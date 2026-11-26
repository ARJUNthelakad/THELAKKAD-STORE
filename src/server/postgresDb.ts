import crypto from 'node:crypto';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_COUPONS,
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
  DEFAULT_WEBSITE,
} from '../shared/catalog';
import type {
  Category,
  Coupon,
  CustomerSummary,
  MediaKind,
  Order,
  OrderCustomer,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductMedia,
  ProductOption,
  ProductReview,
  ReviewSummary,
  StaffMember,
  StaffRole,
  StoreSettings,
  WebsiteContent,
  WebsiteHighlight,
} from '../shared/types';
import { SESSION_TTL_MS, generateOpaqueToken, hashPassword, hashToken, verifyPassword } from './auth';
import type { DatabaseClient, SqlExecutor } from './neon';

export interface ProductOverride {
  title?: string;
  subtitle?: string;
  category?: string;
  priceInr?: number;
  stock?: number;
  editionNote?: string;
  description?: string;
  materials?: string;
  dimensions?: string;
  care?: string;
  options?: ProductOption[];
  media?: ProductMedia[];
  featured?: boolean;
  archived?: boolean;
  updatedAt?: string;
}

export interface StaffRecord {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  passwordHash: string;
  passwordSalt: string;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UploadedMediaRecord {
  filename: string;
  kind: MediaKind;
  mimeType: string;
  alt: string;
  data: Buffer;
  createdAt: string;
}

export interface LegacyJsonStoreState {
  catalogVersion?: number;
  productOverrides?: Record<string, ProductOverride>;
  customProducts?: Product[];
  categories?: Category[];
  coupons?: Coupon[];
  settings?: Partial<StoreSettings>;
  website?: Partial<WebsiteContent>;
  orders?: Order[];
  reviews?: ProductReview[];
  subscribers?: Array<{ email: string; subscribedAt?: string }>;
  staff?: StaffRecord[];
  sessions?: Array<{ tokenHash: string; staffId: string; createdAt: string; expiresAt: string }>;
  actionTokens?: Array<{
    tokenHash: string;
    kind: 'verify' | 'reset';
    staffId: string;
    expiresAt: string;
  }>;
}

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (email)`,

  `CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_staff_id ON admin_sessions (staff_id)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions (expires_at)`,

  `CREATE TABLE IF NOT EXISTS admin_action_tokens (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
    staff_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_admin_action_tokens_staff_kind ON admin_action_tokens (staff_id, kind)`,

  `CREATE TABLE IF NOT EXISTS product_categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS products (
    slug TEXT PRIMARY KEY,
    sku TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    category_slug TEXT NOT NULL REFERENCES product_categories(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
    price_inr INTEGER NOT NULL CHECK (price_inr >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    edition_note TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    materials TEXT NOT NULL DEFAULT '',
    dimensions TEXT NOT NULL DEFAULT '',
    care TEXT NOT NULL DEFAULT '',
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    media JSONB NOT NULL DEFAULT '[]'::jsonb,
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    has_override BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_category_slug ON products (category_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_products_archived ON products (archived)`,
  `CREATE INDEX IF NOT EXISTS idx_products_featured ON products (featured)`,

  `CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('percent', 'flat', 'shipping')),
    value INTEGER NOT NULL DEFAULT 0,
    min_subtotal_inr INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    address_line1 TEXT NOT NULL DEFAULT '',
    address_line2 TEXT,
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    pincode TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email)`,

  `CREATE TABLE IF NOT EXISTS orders (
    reference TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('confirmed', 'packed', 'dispatched', 'delivered', 'cancelled')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('upi', 'card', 'cod')),
    customer_snapshot JSONB NOT NULL,
    subtotal_inr INTEGER NOT NULL,
    discount_inr INTEGER NOT NULL DEFAULT 0,
    shipping_inr INTEGER NOT NULL DEFAULT 0,
    total_inr INTEGER NOT NULL,
    coupon_code TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_reference TEXT NOT NULL REFERENCES orders(reference) ON DELETE CASCADE,
    product_slug TEXT NOT NULL,
    sku TEXT NOT NULL,
    title TEXT NOT NULL,
    unit_price_inr INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    selected_options JSONB NOT NULL DEFAULT '{}'::jsonb,
    image_url TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_ref ON order_items (order_reference)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_product_slug ON order_items (product_slug)`,

  `CREATE TABLE IF NOT EXISTS product_reviews (
    id TEXT PRIMARY KEY,
    product_slug TEXT NOT NULL REFERENCES products(slug) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL,
    verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_product_reviews_slug_created ON product_reviews (product_slug, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    email TEXT PRIMARY KEY,
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS store_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    store_name TEXT NOT NULL,
    tagline TEXT NOT NULL,
    studio_address TEXT NOT NULL,
    support_email TEXT NOT NULL,
    support_phone TEXT NOT NULL,
    free_shipping_threshold_inr INTEGER NOT NULL,
    flat_shipping_inr INTEGER NOT NULL,
    dispatch_window TEXT NOT NULL,
    announcement TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS website_editor_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bg_color TEXT NOT NULL,
    surface_color TEXT NOT NULL,
    ink_color TEXT NOT NULL,
    accent_color TEXT NOT NULL,
    show_announcement BOOLEAN NOT NULL DEFAULT TRUE,
    footer_config JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS homepage_sections (
    section_key TEXT PRIMARY KEY,
    visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    content JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS navigation_menus (
    menu_key TEXT PRIMARY KEY,
    items JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,

  `CREATE TABLE IF NOT EXISTS uploaded_media (
    filename TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
    mime_type TEXT NOT NULL,
    alt TEXT NOT NULL DEFAULT '',
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

function cloneDefaultWebsite(): WebsiteContent {
  return {
    theme: { ...DEFAULT_WEBSITE.theme },
    showAnnouncement: DEFAULT_WEBSITE.showAnnouncement,
    header: { ...DEFAULT_WEBSITE.header },
    hero: { ...DEFAULT_WEBSITE.hero },
    collection: { ...DEFAULT_WEBSITE.collection },
    about: {
      ...DEFAULT_WEBSITE.about,
      highlights: DEFAULT_WEBSITE.about.highlights.map((h) => ({ ...h })),
    },
    footer: { ...DEFAULT_WEBSITE.footer },
  };
}

export function mergeWebsite(partial?: Partial<WebsiteContent>): WebsiteContent {
  const base = cloneDefaultWebsite();
  if (!partial) return base;
  return {
    theme: { ...base.theme, ...(partial.theme ?? {}) },
    showAnnouncement:
      typeof partial.showAnnouncement === 'boolean'
        ? partial.showAnnouncement
        : base.showAnnouncement,
    header: { ...base.header, ...(partial.header ?? {}) },
    hero: { ...base.hero, ...(partial.hero ?? {}) },
    collection: { ...base.collection, ...(partial.collection ?? {}) },
    about: {
      ...base.about,
      ...(partial.about ?? {}),
      highlights: Array.isArray(partial.about?.highlights)
        ? partial.about.highlights.map((h) => ({ title: h.title, description: h.description }))
        : base.about.highlights,
    },
    footer: { ...base.footer, ...(partial.footer ?? {}) },
  };
}

function deterministicCustomerId(email: string): string {
  const hash = crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16);
  return `cust_${hash}`;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return new Date().toISOString();
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function toPublicStaff(record: StaffRecord): StaffMember {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: record.role,
    verified: record.verified,
    createdAt: record.createdAt,
    lastLoginAt: record.lastLoginAt,
  };
}

function createSeedOrders(): Order[] {
  const now = Date.now();
  return [
    {
      reference: 'THL-24091',
      createdAt: new Date(now - 1000 * 60 * 60 * 54).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60 * 18).toISOString(),
      status: 'dispatched',
      paymentMethod: 'upi',
      customer: {
        name: 'Ananya Deshmukh',
        email: 'ananya.deshmukh@example.in',
        phone: '+91 98201 44120',
        addressLine1: '14 Pali Hill Road, Bandra West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400050',
      },
      items: [
        {
          slug: 'emerald-pleated-satin-midi-dress',
          sku: 'THL-DRS-01',
          title: 'Emerald Pleated Satin Midi Dress',
          unitPriceInr: 4850,
          quantity: 1,
          selectedOptions: { Size: 'M', Color: 'Deep Emerald' },
          imageUrl: '/src/assets/images/prod_emerald_midi_dress_1795715870632.jpg',
        },
        {
          slug: 'cognac-full-grain-leather-tote',
          sku: 'THL-ACC-01',
          title: 'Cognac Full-Grain Leather Work Tote',
          unitPriceInr: 5890,
          quantity: 1,
          selectedOptions: { Color: 'Cognac Tan', Set: 'Tote Only' },
          imageUrl: '/src/assets/images/prod_leather_tote_bag_1795715872827.jpg',
        },
      ],
      subtotalInr: 10740,
      discountInr: 1074,
      shippingInr: 0,
      totalInr: 9666,
      couponCode: 'WELCOME10',
      note: 'Please pack dress in garment sleeve.',
    },
    {
      reference: 'THL-24092',
      createdAt: new Date(now - 1000 * 60 * 60 * 9).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60 * 5).toISOString(),
      status: 'packed',
      paymentMethod: 'card',
      customer: {
        name: 'Rohan Menon',
        email: 'rohan.menon@example.in',
        phone: '+91 98450 88219',
        addressLine1: '204 Indiranagar 12th Main',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      },
      items: [
        {
          slug: 'barista-compact-espresso-machine',
          sku: 'THL-KTC-01',
          title: 'Barista Compact Espresso Machine',
          unitPriceInr: 18990,
          quantity: 1,
          selectedOptions: {
            Finish: 'Matte Black & Steel',
            Bundle: 'Machine + Milk Pitcher & Tamper',
          },
          imageUrl: '/src/assets/images/prod_espresso_maker_1795715868210.jpg',
        },
      ],
      subtotalInr: 18990,
      discountInr: 0,
      shippingInr: 0,
      totalInr: 18990,
      couponCode: null,
    },
  ];
}

function createSeedReviews(): ProductReview[] {
  const now = Date.now();
  return [
    {
      id: 'rev_seed_espresso_1',
      slug: 'barista-compact-espresso-machine',
      authorName: 'Rohan Menon',
      rating: 5,
      title: 'Consistent crema and heats up in half a minute',
      comment:
        'Fits neatly on my compact kitchen counter and pulls balanced double shots every morning. The steam wand micro-foam takes a little practice but produces genuine cafe-grade flat whites.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 48).toISOString(),
    },
    {
      id: 'rev_seed_espresso_2',
      slug: 'barista-compact-espresso-machine',
      authorName: 'Kavita Rao',
      rating: 4,
      title: 'Solid stainless build, compact footprint',
      comment:
        'Very sturdy portafilter and quiet pump compared to plastic espresso machines. Adding a calibrated tamper in the bundle is a nice touch.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 140).toISOString(),
    },
    {
      id: 'rev_seed_emerald_1',
      slug: 'emerald-pleated-satin-midi-dress',
      authorName: 'Ananya Deshmukh',
      rating: 5,
      title: 'Drapes like liquid satin without clinging',
      comment:
        'Wore the Deep Emerald midi to an evening reception in Mumbai. The pleats hold crisp movement all night and the viscose lining keeps it breathable.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 32).toISOString(),
    },
    {
      id: 'rev_seed_ivory_1',
      slug: 'ivory-tiered-cotton-linen-maxi-dress',
      authorName: 'Meera Nair',
      rating: 5,
      title: 'Breathable summer staple with real pockets',
      comment:
        'True to size and completely opaque thanks to the cotton voile lining. Washed twice on cold gentle cycle and it still hangs cleanly.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 96).toISOString(),
    },
    {
      id: 'rev_seed_mixer_1',
      slug: 'artisan-tilt-head-stand-mixer',
      authorName: 'Devika Sharma',
      rating: 5,
      title: 'Handles sourdough and brioche dough effortlessly',
      comment:
        'Heavy die-cast body does not walk across the counter even at higher speeds. Quiet motor and very easy to clean.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 120).toISOString(),
    },
    {
      id: 'rev_seed_tote_1',
      slug: 'cognac-full-grain-leather-tote',
      authorName: 'Ananya Deshmukh',
      rating: 5,
      title: 'Fits a 15-inch laptop with room to spare',
      comment:
        'Rich pebbled leather with sturdy brass hardware. Keeps its upright shape even when packed for office travel.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
    },
  ];
}

async function upsertWebsiteTables(tx: SqlExecutor, website: WebsiteContent): Promise<void> {
  const merged = mergeWebsite(website);
  await tx.query(
    `INSERT INTO website_editor_config (
      id, bg_color, surface_color, ink_color, accent_color, show_announcement, footer_config, updated_at
    ) VALUES (1, $1, $2, $3, $4, $5, $6::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET
      bg_color = EXCLUDED.bg_color,
      surface_color = EXCLUDED.surface_color,
      ink_color = EXCLUDED.ink_color,
      accent_color = EXCLUDED.accent_color,
      show_announcement = EXCLUDED.show_announcement,
      footer_config = EXCLUDED.footer_config,
      updated_at = NOW()`,
    [
      merged.theme.bgColor,
      merged.theme.surfaceColor,
      merged.theme.inkColor,
      merged.theme.accentColor,
      merged.showAnnouncement,
      JSON.stringify(merged.footer),
    ]
  );

  await tx.query(
    `INSERT INTO navigation_menus (menu_key, items, updated_at)
     VALUES ('header', $1::jsonb, NOW())
     ON CONFLICT (menu_key) DO UPDATE SET
       items = EXCLUDED.items,
       updated_at = NOW()`,
    [JSON.stringify(merged.header)]
  );

  const sections: Array<{ key: string; visible: boolean; sortOrder: number; content: unknown }> = [
    { key: 'hero', visible: merged.hero.visible, sortOrder: 1, content: merged.hero },
    { key: 'collection', visible: true, sortOrder: 2, content: merged.collection },
    { key: 'about', visible: merged.about.visible, sortOrder: 3, content: merged.about },
  ];

  for (const sec of sections) {
    await tx.query(
      `INSERT INTO homepage_sections (section_key, visible, sort_order, content, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (section_key) DO UPDATE SET
         visible = EXCLUDED.visible,
         sort_order = EXCLUDED.sort_order,
         content = EXCLUDED.content,
         updated_at = NOW()`,
      [sec.key, sec.visible, sec.sortOrder, JSON.stringify(sec.content)]
    );
  }
}

async function upsertCustomer(tx: SqlExecutor, customer: OrderCustomer): Promise<string> {
  const email = customer.email.trim().toLowerCase();
  const id = deterministicCustomerId(email);
  await tx.query(
    `INSERT INTO customers (
      id, name, email, phone, address_line1, address_line2, city, state, pincode, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      address_line1 = EXCLUDED.address_line1,
      address_line2 = COALESCE(EXCLUDED.address_line2, customers.address_line2),
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      pincode = EXCLUDED.pincode,
      updated_at = NOW()`,
    [
      id,
      customer.name.trim(),
      email,
      customer.phone.trim(),
      customer.addressLine1.trim(),
      customer.addressLine2?.trim() || null,
      customer.city.trim(),
      customer.state.trim(),
      customer.pincode.trim(),
    ]
  );
  const res = await tx.query<{ id: string }>(`SELECT id FROM customers WHERE email = $1`, [email]);
  return res.rows[0]?.id ?? id;
}

const schemaReadyByClient = new WeakMap<DatabaseClient, Promise<void>>();

export async function ensurePostgresSchema(db: DatabaseClient): Promise<void> {
  let promise = schemaReadyByClient.get(db);
  if (!promise) {
    promise = (async () => {
      for (const ddl of SCHEMA_STATEMENTS) {
        await db.query(ddl);
      }

      // Idempotent initial seeding only if core tables are empty
      const catCountRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM product_categories`
      );
      if (Number(catCountRes.rows[0]?.count ?? 0) === 0) {
        for (let i = 0; i < DEFAULT_CATEGORIES.length; i += 1) {
          const c = DEFAULT_CATEGORIES[i];
          await db.query(
            `INSERT INTO product_categories (slug, name, description, is_default, sort_order)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (slug) DO NOTHING`,
            [c.slug, c.name, c.description, Boolean(c.isDefault), i]
          );
        }
      }

      const prodCountRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM products`
      );
      if (Number(prodCountRes.rows[0]?.count ?? 0) === 0) {
        for (let i = 0; i < DEFAULT_PRODUCTS.length; i += 1) {
          const p = DEFAULT_PRODUCTS[i];
          await db.query(
            `INSERT INTO products (
              slug, sku, title, subtitle, category_slug, price_inr, stock, edition_note,
              description, materials, dimensions, care, options, media, featured, archived,
              is_custom, has_override, sort_order
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, FALSE,
              FALSE, FALSE, $16
            ) ON CONFLICT (slug) DO NOTHING`,
            [
              p.slug,
              p.sku,
              p.title,
              p.subtitle,
              p.category,
              p.priceInr,
              p.stock,
              p.editionNote,
              p.description,
              p.materials,
              p.dimensions,
              p.care,
              JSON.stringify(p.options),
              JSON.stringify(p.media),
              Boolean(p.featured),
              i,
            ]
          );
        }
      }

      const couponCountRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM coupons`
      );
      if (Number(couponCountRes.rows[0]?.count ?? 0) === 0) {
        for (const c of DEFAULT_COUPONS) {
          await db.query(
            `INSERT INTO coupons (code, kind, value, min_subtotal_inr, description, active, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (code) DO NOTHING`,
            [c.code, c.kind, c.value, c.minSubtotalInr, c.description, c.active, Boolean(c.isDefault)]
          );
        }
      }

      const settingsCountRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM store_settings`
      );
      if (Number(settingsCountRes.rows[0]?.count ?? 0) === 0) {
        const s = DEFAULT_SETTINGS;
        await db.query(
          `INSERT INTO store_settings (
            id, store_name, tagline, studio_address, support_email, support_phone,
            free_shipping_threshold_inr, flat_shipping_inr, dispatch_window, announcement
          ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING`,
          [
            s.storeName,
            s.tagline,
            s.studioAddress,
            s.supportEmail,
            s.supportPhone,
            s.freeShippingThresholdInr,
            s.flatShippingInr,
            s.dispatchWindow,
            s.announcement,
          ]
        );
      }

      const webCountRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM website_editor_config`
      );
      if (Number(webCountRes.rows[0]?.count ?? 0) === 0) {
        await db.withTransaction(async (tx) => {
          await upsertWebsiteTables(tx, cloneDefaultWebsite());
        });
      }

      const orderCountRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM orders`
      );
      if (Number(orderCountRes.rows[0]?.count ?? 0) === 0) {
        await db.withTransaction(async (tx) => {
          for (const order of createSeedOrders()) {
            const customerId = await upsertCustomer(tx, order.customer);
            const inserted = await tx.query<{ reference: string }>(
              `INSERT INTO orders (
                reference, customer_id, status, payment_method, customer_snapshot,
                subtotal_inr, discount_inr, shipping_inr, total_inr, coupon_code, note,
                created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz)
              ON CONFLICT (reference) DO NOTHING
              RETURNING reference`,
              [
                order.reference,
                customerId,
                order.status,
                order.paymentMethod,
                JSON.stringify(order.customer),
                order.subtotalInr,
                order.discountInr,
                order.shippingInr,
                order.totalInr,
                order.couponCode,
                order.note ?? null,
                order.createdAt,
                order.updatedAt,
              ]
            );
            if (inserted.rows.length > 0) {
              for (const item of order.items) {
                await tx.query(
                  `INSERT INTO order_items (
                    order_reference, product_slug, sku, title, unit_price_inr, quantity, selected_options, image_url
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
                  [
                    order.reference,
                    item.slug,
                    item.sku,
                    item.title,
                    item.unitPriceInr,
                    item.quantity,
                    JSON.stringify(item.selectedOptions),
                    item.imageUrl,
                  ]
                );
              }
            }
          }
        });
      }

      const reviewCountRes = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM product_reviews`
      );
      if (Number(reviewCountRes.rows[0]?.count ?? 0) === 0) {
        for (const rev of createSeedReviews()) {
          await db.query(
            `INSERT INTO product_reviews (
              id, product_slug, author_name, rating, title, comment, verified_purchase, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
            ON CONFLICT (id) DO NOTHING`,
            [
              rev.id,
              rev.slug,
              rev.authorName,
              rev.rating,
              rev.title,
              rev.comment,
              rev.verifiedPurchase,
              rev.createdAt,
            ]
          );
        }
      }
    })();

    schemaReadyByClient.set(db, promise);
    promise.catch(() => {
      schemaReadyByClient.delete(db);
    });
  }
  await promise;
}

export async function migrateJsonStateToPostgres(
  db: DatabaseClient,
  jsonState: LegacyJsonStoreState
): Promise<{
  categories: number;
  products: number;
  coupons: number;
  customers: number;
  orders: number;
  reviews: number;
  subscribers: number;
  staff: number;
  sessions: number;
}> {
  await ensurePostgresSchema(db);

  return db.withTransaction(async (tx) => {
    const categories = Array.isArray(jsonState.categories) && jsonState.categories.length > 0
      ? jsonState.categories
      : DEFAULT_CATEGORIES;

    for (let i = 0; i < categories.length; i += 1) {
      const c = categories[i];
      await tx.query(
        `INSERT INTO product_categories (slug, name, description, is_default, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description`,
        [c.slug, c.name, c.description ?? '', Boolean(c.isDefault), i]
      );
    }

    const overrides = jsonState.productOverrides ?? {};
    let productOrder = 0;
    for (const base of DEFAULT_PRODUCTS) {
      const ov = overrides[base.slug];
      const merged: Product = ov
        ? { ...base, ...ov, slug: base.slug, sku: base.sku, hasOverride: true, isCustom: false }
        : { ...base, hasOverride: false, isCustom: false };

      await tx.query(
        `INSERT INTO products (
          slug, sku, title, subtitle, category_slug, price_inr, stock, edition_note,
          description, materials, dimensions, care, options, media, featured, archived,
          is_custom, has_override, sort_order, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16,
          FALSE, $17, $18, NOW()
        )
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title,
          subtitle = EXCLUDED.subtitle,
          category_slug = EXCLUDED.category_slug,
          price_inr = EXCLUDED.price_inr,
          stock = EXCLUDED.stock,
          edition_note = EXCLUDED.edition_note,
          description = EXCLUDED.description,
          materials = EXCLUDED.materials,
          dimensions = EXCLUDED.dimensions,
          care = EXCLUDED.care,
          options = EXCLUDED.options,
          media = EXCLUDED.media,
          featured = EXCLUDED.featured,
          archived = EXCLUDED.archived,
          has_override = EXCLUDED.has_override,
          updated_at = NOW()`,
        [
          merged.slug,
          merged.sku,
          merged.title,
          merged.subtitle,
          merged.category,
          merged.priceInr,
          merged.stock,
          merged.editionNote,
          merged.description,
          merged.materials,
          merged.dimensions,
          merged.care,
          JSON.stringify(merged.options),
          JSON.stringify(merged.media),
          Boolean(merged.featured),
          Boolean(merged.archived),
          Boolean(ov),
          productOrder++,
        ]
      );
    }

    for (const custom of jsonState.customProducts ?? []) {
      await tx.query(
        `INSERT INTO products (
          slug, sku, title, subtitle, category_slug, price_inr, stock, edition_note,
          description, materials, dimensions, care, options, media, featured, archived,
          is_custom, has_override, sort_order, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16,
          TRUE, FALSE, $17, $18::timestamptz, $19::timestamptz
        )
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title,
          subtitle = EXCLUDED.subtitle,
          category_slug = EXCLUDED.category_slug,
          price_inr = EXCLUDED.price_inr,
          stock = EXCLUDED.stock,
          edition_note = EXCLUDED.edition_note,
          description = EXCLUDED.description,
          materials = EXCLUDED.materials,
          dimensions = EXCLUDED.dimensions,
          care = EXCLUDED.care,
          options = EXCLUDED.options,
          media = EXCLUDED.media,
          featured = EXCLUDED.featured,
          archived = EXCLUDED.archived,
          updated_at = NOW()`,
        [
          custom.slug,
          custom.sku,
          custom.title,
          custom.subtitle,
          custom.category,
          custom.priceInr,
          custom.stock,
          custom.editionNote,
          custom.description,
          custom.materials,
          custom.dimensions,
          custom.care,
          JSON.stringify(custom.options),
          JSON.stringify(custom.media),
          Boolean(custom.featured),
          Boolean(custom.archived),
          productOrder++,
          custom.createdAt || new Date().toISOString(),
          custom.updatedAt || new Date().toISOString(),
        ]
      );
    }

    for (const c of jsonState.coupons ?? DEFAULT_COUPONS) {
      await tx.query(
        `INSERT INTO coupons (code, kind, value, min_subtotal_inr, description, active, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO UPDATE SET
           kind = EXCLUDED.kind,
           value = EXCLUDED.value,
           min_subtotal_inr = EXCLUDED.min_subtotal_inr,
           description = EXCLUDED.description,
           active = EXCLUDED.active`,
        [c.code.toUpperCase(), c.kind, c.value, c.minSubtotalInr, c.description, c.active, Boolean(c.isDefault)]
      );
    }

    if (jsonState.settings) {
      const s = { ...DEFAULT_SETTINGS, ...jsonState.settings };
      await tx.query(
        `INSERT INTO store_settings (
          id, store_name, tagline, studio_address, support_email, support_phone,
          free_shipping_threshold_inr, flat_shipping_inr, dispatch_window, announcement, updated_at
        ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (id) DO UPDATE SET
          store_name = EXCLUDED.store_name,
          tagline = EXCLUDED.tagline,
          studio_address = EXCLUDED.studio_address,
          support_email = EXCLUDED.support_email,
          support_phone = EXCLUDED.support_phone,
          free_shipping_threshold_inr = EXCLUDED.free_shipping_threshold_inr,
          flat_shipping_inr = EXCLUDED.flat_shipping_inr,
          dispatch_window = EXCLUDED.dispatch_window,
          announcement = EXCLUDED.announcement,
          updated_at = NOW()`,
        [
          s.storeName,
          s.tagline,
          s.studioAddress,
          s.supportEmail,
          s.supportPhone,
          s.freeShippingThresholdInr,
          s.flatShippingInr,
          s.dispatchWindow,
          s.announcement,
        ]
      );
    }

    if (jsonState.website) {
      await upsertWebsiteTables(tx, mergeWebsite(jsonState.website));
    }

    for (const order of jsonState.orders ?? []) {
      const customerId = await upsertCustomer(tx, order.customer);
      const inserted = await tx.query<{ reference: string }>(
        `INSERT INTO orders (
          reference, customer_id, status, payment_method, customer_snapshot,
          subtotal_inr, discount_inr, shipping_inr, total_inr, coupon_code, note,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz)
        ON CONFLICT (reference) DO NOTHING
        RETURNING reference`,
        [
          order.reference,
          customerId,
          order.status,
          order.paymentMethod,
          JSON.stringify(order.customer),
          order.subtotalInr,
          order.discountInr,
          order.shippingInr,
          order.totalInr,
          order.couponCode,
          order.note ?? null,
          order.createdAt,
          order.updatedAt,
        ]
      );
      if (inserted.rows.length > 0) {
        for (const item of order.items) {
          await tx.query(
            `INSERT INTO order_items (
              order_reference, product_slug, sku, title, unit_price_inr, quantity, selected_options, image_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
            [
              order.reference,
              item.slug,
              item.sku,
              item.title,
              item.unitPriceInr,
              item.quantity,
              JSON.stringify(item.selectedOptions),
              item.imageUrl,
            ]
          );
        }
      }
    }

    for (const rev of jsonState.reviews ?? []) {
      const exists = await tx.query<{ slug: string }>(
        `SELECT slug FROM products WHERE slug = $1`,
        [rev.slug]
      );
      if (exists.rows.length > 0) {
        await tx.query(
          `INSERT INTO product_reviews (
            id, product_slug, author_name, rating, title, comment, verified_purchase, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
          ON CONFLICT (id) DO NOTHING`,
          [
            rev.id,
            rev.slug,
            rev.authorName,
            rev.rating,
            rev.title,
            rev.comment,
            rev.verifiedPurchase,
            rev.createdAt,
          ]
        );
      }
    }

    for (const sub of jsonState.subscribers ?? []) {
      if (sub.email) {
        await tx.query(
          `INSERT INTO newsletter_subscribers (email, subscribed_at)
           VALUES ($1, $2::timestamptz)
           ON CONFLICT (email) DO NOTHING`,
          [sub.email.trim().toLowerCase(), sub.subscribedAt || new Date().toISOString()]
        );
      }
    }

    for (const stf of jsonState.staff ?? []) {
      await tx.query(
        `INSERT INTO admin_users (
          id, name, email, role, password_hash, password_salt, verified, created_at, last_login_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
        ON CONFLICT (email) DO NOTHING`,
        [
          stf.id,
          stf.name,
          stf.email.trim().toLowerCase(),
          stf.role,
          stf.passwordHash,
          stf.passwordSalt,
          Boolean(stf.verified),
          stf.createdAt || new Date().toISOString(),
          stf.lastLoginAt ?? null,
        ]
      );
    }

    for (const sess of jsonState.sessions ?? []) {
      if (Date.parse(sess.expiresAt) > Date.now()) {
        const userExists = await tx.query<{ id: string }>(
          `SELECT id FROM admin_users WHERE id = $1`,
          [sess.staffId]
        );
        if (userExists.rows.length > 0) {
          await tx.query(
            `INSERT INTO admin_sessions (token_hash, staff_id, created_at, expires_at)
             VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
             ON CONFLICT (token_hash) DO NOTHING`,
            [sess.tokenHash, sess.staffId, sess.createdAt, sess.expiresAt]
          );
        }
      }
    }

    for (const tok of jsonState.actionTokens ?? []) {
      if (Date.parse(tok.expiresAt) > Date.now()) {
        const userExists = await tx.query<{ id: string }>(
          `SELECT id FROM admin_users WHERE id = $1`,
          [tok.staffId]
        );
        if (userExists.rows.length > 0) {
          await tx.query(
            `INSERT INTO admin_action_tokens (token_hash, kind, staff_id, expires_at)
             VALUES ($1, $2, $3, $4::timestamptz)
             ON CONFLICT (token_hash) DO NOTHING`,
            [tok.tokenHash, tok.kind, tok.staffId, tok.expiresAt]
          );
        }
      }
    }

    const countOf = async (table: string) => {
      const r = await tx.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
      return Number(r.rows[0]?.count ?? 0);
    };

    return {
      categories: await countOf('product_categories'),
      products: await countOf('products'),
      coupons: await countOf('coupons'),
      customers: await countOf('customers'),
      orders: await countOf('orders'),
      reviews: await countOf('product_reviews'),
      subscribers: await countOf('newsletter_subscribers'),
      staff: await countOf('admin_users'),
      sessions: await countOf('admin_sessions'),
    };
  });
}

// =========================================================================
// POSTGRESQL REPOSITORY FACTORY
// =========================================================================

function mapProductRow(row: Record<string, unknown>): Product {
  return {
    slug: String(row.slug),
    sku: String(row.sku),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ''),
    category: String(row.category_slug),
    priceInr: Number(row.price_inr),
    stock: Number(row.stock),
    editionNote: String(row.edition_note ?? ''),
    description: String(row.description ?? ''),
    materials: String(row.materials ?? ''),
    dimensions: String(row.dimensions ?? ''),
    care: String(row.care ?? ''),
    options: parseJson<ProductOption[]>(row.options, []),
    media: parseJson<ProductMedia[]>(row.media, []),
    featured: Boolean(row.featured),
    archived: Boolean(row.archived),
    isCustom: Boolean(row.is_custom),
    hasOverride: Boolean(row.has_override),
    createdAt: row.created_at ? toIso(row.created_at) : undefined,
    updatedAt: row.updated_at ? toIso(row.updated_at) : undefined,
  };
}

function mapStaffRow(row: Record<string, unknown>): StaffRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role === 'admin' ? 'admin' : 'staff',
    passwordHash: String(row.password_hash),
    passwordSalt: String(row.password_salt),
    verified: Boolean(row.verified),
    createdAt: toIso(row.created_at),
    lastLoginAt: row.last_login_at ? toIso(row.last_login_at) : null,
  };
}

export function createPostgresRepository(db: DatabaseClient) {
  const ready = () => ensurePostgresSchema(db);

  async function hydrateOrders(orderRows: Array<Record<string, unknown>>): Promise<Order[]> {
    if (orderRows.length === 0) return [];
    const refs = orderRows.map((r) => String(r.reference));
    const itemRes = await db.query<Record<string, unknown>>(
      `SELECT order_reference, product_slug, sku, title, unit_price_inr, quantity, selected_options, image_url
       FROM order_items
       WHERE order_reference = ANY($1::text[])
       ORDER BY id ASC`,
      [refs]
    );
    const itemsByRef = new Map<string, OrderItem[]>();
    for (const r of itemRes.rows) {
      const ref = String(r.order_reference);
      const list = itemsByRef.get(ref) ?? [];
      list.push({
        slug: String(r.product_slug),
        sku: String(r.sku),
        title: String(r.title),
        unitPriceInr: Number(r.unit_price_inr),
        quantity: Number(r.quantity),
        selectedOptions: parseJson<Record<string, string>>(r.selected_options, {}),
        imageUrl: String(r.image_url ?? ''),
      });
      itemsByRef.set(ref, list);
    }

    return orderRows.map((r) => ({
      reference: String(r.reference),
      createdAt: toIso(r.created_at),
      updatedAt: toIso(r.updated_at),
      status: r.status as OrderStatus,
      paymentMethod: r.payment_method as PaymentMethod,
      customer: parseJson<OrderCustomer>(r.customer_snapshot, {
        name: 'Guest',
        email: '',
        phone: '',
        addressLine1: '',
        city: '',
        state: '',
        pincode: '',
      }),
      items: itemsByRef.get(String(r.reference)) ?? [],
      subtotalInr: Number(r.subtotal_inr),
      discountInr: Number(r.discount_inr),
      shippingInr: Number(r.shipping_inr),
      totalInr: Number(r.total_inr),
      couponCode: r.coupon_code ? String(r.coupon_code) : null,
      note: r.note ? String(r.note) : undefined,
    }));
  }

  return {
    async getMergedProducts(includeArchived = false): Promise<Product[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        includeArchived
          ? `SELECT * FROM products ORDER BY sort_order ASC, created_at ASC`
          : `SELECT * FROM products WHERE archived = FALSE ORDER BY sort_order ASC, created_at ASC`
      );
      return res.rows.map(mapProductRow);
    },

    async getProductBySlug(slug: string, includeArchived = true): Promise<Product | undefined> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        includeArchived
          ? `SELECT * FROM products WHERE slug = $1`
          : `SELECT * FROM products WHERE slug = $1 AND archived = FALSE`,
        [slug]
      );
      return res.rows[0] ? mapProductRow(res.rows[0]) : undefined;
    },

    async getCategories(): Promise<Category[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT slug, name, description, is_default FROM product_categories ORDER BY sort_order ASC, created_at ASC`
      );
      return res.rows.map((r) => ({
        slug: String(r.slug),
        name: String(r.name),
        description: String(r.description ?? ''),
        isDefault: Boolean(r.is_default),
      }));
    },

    async getCoupons(): Promise<Coupon[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT code, kind, value, min_subtotal_inr, description, active, is_default FROM coupons ORDER BY created_at ASC`
      );
      return res.rows.map((r) => ({
        code: String(r.code),
        kind: r.kind as Coupon['kind'],
        value: Number(r.value),
        minSubtotalInr: Number(r.min_subtotal_inr),
        description: String(r.description ?? ''),
        active: Boolean(r.active),
        isDefault: Boolean(r.is_default),
      }));
    },

    async getSettings(): Promise<StoreSettings> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM store_settings WHERE id = 1`
      );
      const r = res.rows[0];
      if (!r) return { ...DEFAULT_SETTINGS };
      return {
        storeName: String(r.store_name),
        tagline: String(r.tagline),
        studioAddress: String(r.studio_address),
        supportEmail: String(r.support_email),
        supportPhone: String(r.support_phone),
        freeShippingThresholdInr: Number(r.free_shipping_threshold_inr),
        flatShippingInr: Number(r.flat_shipping_inr),
        dispatchWindow: String(r.dispatch_window),
        announcement: String(r.announcement),
      };
    },

    async updateSettings(next: Partial<StoreSettings>): Promise<StoreSettings> {
      await ready();
      const current = await this.getSettings();
      const merged: StoreSettings = {
        storeName: next.storeName ?? current.storeName,
        tagline: next.tagline ?? current.tagline,
        studioAddress: next.studioAddress ?? current.studioAddress,
        supportEmail: next.supportEmail ?? current.supportEmail,
        supportPhone: next.supportPhone ?? current.supportPhone,
        freeShippingThresholdInr:
          next.freeShippingThresholdInr ?? current.freeShippingThresholdInr,
        flatShippingInr: next.flatShippingInr ?? current.flatShippingInr,
        dispatchWindow: next.dispatchWindow ?? current.dispatchWindow,
        announcement: next.announcement ?? current.announcement,
      };
      await db.query(
        `INSERT INTO store_settings (
          id, store_name, tagline, studio_address, support_email, support_phone,
          free_shipping_threshold_inr, flat_shipping_inr, dispatch_window, announcement, updated_at
        ) VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (id) DO UPDATE SET
          store_name = EXCLUDED.store_name,
          tagline = EXCLUDED.tagline,
          studio_address = EXCLUDED.studio_address,
          support_email = EXCLUDED.support_email,
          support_phone = EXCLUDED.support_phone,
          free_shipping_threshold_inr = EXCLUDED.free_shipping_threshold_inr,
          flat_shipping_inr = EXCLUDED.flat_shipping_inr,
          dispatch_window = EXCLUDED.dispatch_window,
          announcement = EXCLUDED.announcement,
          updated_at = NOW()`,
        [
          merged.storeName,
          merged.tagline,
          merged.studioAddress,
          merged.supportEmail,
          merged.supportPhone,
          merged.freeShippingThresholdInr,
          merged.flatShippingInr,
          merged.dispatchWindow,
          merged.announcement,
        ]
      );
      return merged;
    },

    async getWebsiteContent(): Promise<WebsiteContent> {
      await ready();
      const [cfgRes, navRes, secRes] = await Promise.all([
        db.query<Record<string, unknown>>(`SELECT * FROM website_editor_config WHERE id = 1`),
        db.query<Record<string, unknown>>(
          `SELECT items FROM navigation_menus WHERE menu_key = 'header'`
        ),
        db.query<Record<string, unknown>>(
          `SELECT section_key, visible, content FROM homepage_sections ORDER BY sort_order ASC`
        ),
      ]);

      const cfg = cfgRes.rows[0];
      const nav = navRes.rows[0];
      const sectionMap = new Map<string, { visible: boolean; content: Record<string, unknown> }>();
      for (const row of secRes.rows) {
        sectionMap.set(String(row.section_key), {
          visible: Boolean(row.visible),
          content: parseJson<Record<string, unknown>>(row.content, {}),
        });
      }

      const heroRec = sectionMap.get('hero');
      const collectionRec = sectionMap.get('collection');
      const aboutRec = sectionMap.get('about');

      return mergeWebsite({
        theme: cfg
          ? {
              bgColor: String(cfg.bg_color),
              surfaceColor: String(cfg.surface_color),
              inkColor: String(cfg.ink_color),
              accentColor: String(cfg.accent_color),
            }
          : undefined,
        showAnnouncement: cfg ? Boolean(cfg.show_announcement) : undefined,
        footer: cfg ? parseJson<WebsiteContent['footer']>(cfg.footer_config, DEFAULT_WEBSITE.footer) : undefined,
        header: nav ? parseJson<WebsiteContent['header']>(nav.items, DEFAULT_WEBSITE.header) : undefined,
        hero: heroRec
          ? ({
              ...heroRec.content,
              visible: heroRec.visible,
            } as WebsiteContent['hero'])
          : undefined,
        collection: collectionRec
          ? (collectionRec.content as WebsiteContent['collection'])
          : undefined,
        about: aboutRec
          ? ({
              ...aboutRec.content,
              visible: aboutRec.visible,
              highlights: Array.isArray(aboutRec.content.highlights)
                ? (aboutRec.content.highlights as WebsiteHighlight[])
                : DEFAULT_WEBSITE.about.highlights,
            } as WebsiteContent['about'])
          : undefined,
      });
    },

    async updateWebsiteContent(next: WebsiteContent): Promise<WebsiteContent> {
      await ready();
      const merged = mergeWebsite(next);
      await db.withTransaction(async (tx) => {
        await upsertWebsiteTables(tx, merged);
      });
      return merged;
    },

    async resetWebsiteContent(): Promise<WebsiteContent> {
      await ready();
      const fresh = cloneDefaultWebsite();
      await db.withTransaction(async (tx) => {
        await upsertWebsiteTables(tx, fresh);
      });
      return fresh;
    },

    async createCategory(input: {
      name: string;
      slug?: string;
      description: string;
    }): Promise<Category> {
      await ready();
      const slug = slugify(input.slug || input.name);
      if (!slug) {
        throw new Error('Category slug is invalid.');
      }
      const existing = await db.query<{ slug: string }>(
        `SELECT slug FROM product_categories WHERE slug = $1`,
        [slug]
      );
      if (existing.rows.length > 0) {
        throw new Error('A category with this slug already exists.');
      }
      const orderRes = await db.query<{ next_order: number }>(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM product_categories`
      );
      const sortOrder = Number(orderRes.rows[0]?.next_order ?? 10);
      await db.query(
        `INSERT INTO product_categories (slug, name, description, is_default, sort_order)
         VALUES ($1, $2, $3, FALSE, $4)`,
        [slug, input.name.trim(), input.description.trim(), sortOrder]
      );
      return {
        slug,
        name: input.name.trim(),
        description: input.description.trim(),
        isDefault: false,
      };
    },

    async updateCategory(
      slug: string,
      input: { name: string; description: string }
    ): Promise<Category> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `UPDATE product_categories
         SET name = $2, description = $3
         WHERE slug = $1
         RETURNING slug, name, description, is_default`,
        [slug, input.name.trim(), input.description.trim()]
      );
      const row = res.rows[0];
      if (!row) {
        throw new Error('Category not found.');
      }
      return {
        slug: String(row.slug),
        name: String(row.name),
        description: String(row.description ?? ''),
        isDefault: Boolean(row.is_default),
      };
    },

    async deleteCategory(slug: string): Promise<void> {
      await ready();
      await db.withTransaction(async (tx) => {
        const catRes = await tx.query<{ slug: string }>(
          `SELECT slug FROM product_categories WHERE slug = $1`,
          [slug]
        );
        if (catRes.rows.length === 0) {
          throw new Error('Category not found.');
        }
        const usageRes = await tx.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM products WHERE category_slug = $1`,
          [slug]
        );
        const count = Number(usageRes.rows[0]?.count ?? 0);
        if (count > 0) {
          throw new Error(`Cannot delete category while ${count} product(s) still reference it.`);
        }
        await tx.query(`DELETE FROM product_categories WHERE slug = $1`, [slug]);
      });
    },

    async createProduct(product: Product): Promise<Product> {
      await ready();
      const exists = await db.query<{ slug: string }>(
        `SELECT slug FROM products WHERE slug = $1`,
        [product.slug]
      );
      if (exists.rows.length > 0) {
        throw new Error('A product with this slug already exists.');
      }
      const orderRes = await db.query<{ next_order: number }>(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM products`
      );
      const sortOrder = Number(orderRes.rows[0]?.next_order ?? 100);
      const res = await db.query<Record<string, unknown>>(
        `INSERT INTO products (
          slug, sku, title, subtitle, category_slug, price_inr, stock, edition_note,
          description, materials, dimensions, care, options, media, featured, archived,
          is_custom, has_override, sort_order, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, FALSE,
          TRUE, FALSE, $16, NOW(), NOW()
        ) RETURNING *`,
        [
          product.slug,
          product.sku,
          product.title,
          product.subtitle,
          product.category,
          product.priceInr,
          product.stock,
          product.editionNote,
          product.description,
          product.materials,
          product.dimensions,
          product.care,
          JSON.stringify(product.options),
          JSON.stringify(product.media),
          Boolean(product.featured),
          sortOrder,
        ]
      );
      return mapProductRow(res.rows[0]);
    },

    async updateProduct(slug: string, patch: ProductOverride): Promise<Product> {
      await ready();
      const existing = await this.getProductBySlug(slug, true);
      if (!existing) {
        throw new Error('Product not found.');
      }
      const isDefaultCatalogItem = DEFAULT_PRODUCTS.some((p) => p.slug === slug);
      const next: Product = {
        ...existing,
        ...patch,
        slug,
        hasOverride: isDefaultCatalogItem ? true : existing.hasOverride,
      };
      const res = await db.query<Record<string, unknown>>(
        `UPDATE products SET
          title = $2,
          subtitle = $3,
          category_slug = $4,
          price_inr = $5,
          stock = $6,
          edition_note = $7,
          description = $8,
          materials = $9,
          dimensions = $10,
          care = $11,
          options = $12::jsonb,
          media = $13::jsonb,
          featured = $14,
          archived = $15,
          has_override = $16,
          updated_at = NOW()
        WHERE slug = $1
        RETURNING *`,
        [
          slug,
          next.title,
          next.subtitle,
          next.category,
          next.priceInr,
          next.stock,
          next.editionNote,
          next.description,
          next.materials,
          next.dimensions,
          next.care,
          JSON.stringify(next.options),
          JSON.stringify(next.media),
          Boolean(next.featured),
          Boolean(next.archived),
          Boolean(next.hasOverride),
        ]
      );
      return mapProductRow(res.rows[0]);
    },

    async setProductArchived(slug: string, archived: boolean): Promise<Product> {
      return this.updateProduct(slug, { archived });
    },

    async resetOrDeleteProduct(
      slug: string
    ): Promise<{ action: 'deleted' | 'reset'; removedMediaUrls: string[] }> {
      await ready();
      const existing = await this.getProductBySlug(slug, true);
      if (!existing) {
        throw new Error('Product not found.');
      }
      const removedMediaUrls = existing.media
        .map((m) => m.url)
        .filter((u) => u.startsWith('/uploads/'));

      const base = DEFAULT_PRODUCTS.find((p) => p.slug === slug);
      if (!base) {
        await db.query(`DELETE FROM products WHERE slug = $1`, [slug]);
        return { action: 'deleted', removedMediaUrls };
      }

      await db.query(
        `UPDATE products SET
          sku = $2,
          title = $3,
          subtitle = $4,
          category_slug = $5,
          price_inr = $6,
          stock = $7,
          edition_note = $8,
          description = $9,
          materials = $10,
          dimensions = $11,
          care = $12,
          options = $13::jsonb,
          media = $14::jsonb,
          featured = $15,
          archived = FALSE,
          has_override = FALSE,
          updated_at = NOW()
        WHERE slug = $1`,
        [
          base.slug,
          base.sku,
          base.title,
          base.subtitle,
          base.category,
          base.priceInr,
          base.stock,
          base.editionNote,
          base.description,
          base.materials,
          base.dimensions,
          base.care,
          JSON.stringify(base.options),
          JSON.stringify(base.media),
          Boolean(base.featured),
        ]
      );
      return { action: 'reset', removedMediaUrls };
    },

    async createCoupon(coupon: Coupon): Promise<Coupon> {
      await ready();
      const code = coupon.code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
        throw new Error('Coupon code must be 3–24 letters, numbers, dashes, or underscores.');
      }
      const exists = await db.query<{ code: string }>(`SELECT code FROM coupons WHERE code = $1`, [
        code,
      ]);
      if (exists.rows.length > 0) {
        throw new Error('Coupon code already exists.');
      }
      await db.query(
        `INSERT INTO coupons (code, kind, value, min_subtotal_inr, description, active, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
        [code, coupon.kind, coupon.value, coupon.minSubtotalInr, coupon.description, coupon.active]
      );
      return { ...coupon, code, isDefault: false };
    },

    async deleteCoupon(code: string): Promise<void> {
      await ready();
      const upper = code.trim().toUpperCase();
      const res = await db.query(`DELETE FROM coupons WHERE code = $1`, [upper]);
      if ((res.rowCount ?? 0) === 0) {
        throw new Error('Coupon not found.');
      }
    },

    async calculateDiscountAndShipping(params: {
      subtotalInr: number;
      couponCode?: string | null;
    }): Promise<{
      discountInr: number;
      shippingInr: number;
      appliedCoupon: string | null;
      couponError?: string;
    }> {
      await ready();
      const [settings, coupons] = await Promise.all([this.getSettings(), this.getCoupons()]);
      let discountInr = 0;
      let shippingInr =
        params.subtotalInr >= settings.freeShippingThresholdInr ? 0 : settings.flatShippingInr;
      let appliedCoupon: string | null = null;

      const trimmedCode = (params.couponCode || '').trim().toUpperCase();
      if (trimmedCode) {
        const coupon = coupons.find((c) => c.code === trimmedCode && c.active);
        if (!coupon) {
          return {
            discountInr: 0,
            shippingInr,
            appliedCoupon: null,
            couponError: 'Coupon code is not valid or has expired.',
          };
        }
        if (params.subtotalInr < coupon.minSubtotalInr) {
          return {
            discountInr: 0,
            shippingInr,
            appliedCoupon: null,
            couponError: `Minimum order of ₹${coupon.minSubtotalInr.toLocaleString('en-IN')} required for ${coupon.code}.`,
          };
        }
        appliedCoupon = coupon.code;
        if (coupon.kind === 'percent') {
          discountInr = Math.round((params.subtotalInr * coupon.value) / 100);
        } else if (coupon.kind === 'flat') {
          discountInr = Math.min(params.subtotalInr, coupon.value);
        } else if (coupon.kind === 'shipping') {
          shippingInr = 0;
        }
      }

      return { discountInr, shippingInr, appliedCoupon };
    },

    async createOrder(input: {
      customer: Order['customer'];
      paymentMethod: Order['paymentMethod'];
      items: Array<{ slug: string; quantity: number; selectedOptions?: Record<string, string> }>;
      couponCode?: string | null;
      note?: string;
    }): Promise<Order> {
      await ready();
      if (!input.items.length || input.items.length > 30) {
        throw new Error('Order must contain between 1 and 30 line items.');
      }

      return db.withTransaction(async (tx) => {
        const prodRes = await tx.query<Record<string, unknown>>(
          `SELECT * FROM products WHERE archived = FALSE`
        );
        const productMap = new Map(prodRes.rows.map((r) => {
          const p = mapProductRow(r);
          return [p.slug, p] as const;
        }));

        const qtyBySlug = new Map<string, number>();
        for (const line of input.items) {
          const product = productMap.get(line.slug);
          if (!product) {
            throw new Error(`Product "${line.slug}" is no longer available.`);
          }
          if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 25) {
            throw new Error(`Invalid quantity for "${product.title}".`);
          }
          qtyBySlug.set(line.slug, (qtyBySlug.get(line.slug) ?? 0) + line.quantity);
        }

        for (const [slug, totalQty] of qtyBySlug.entries()) {
          const product = productMap.get(slug)!;
          if (product.stock < totalQty) {
            throw new Error(`Only ${product.stock} left in stock for "${product.title}".`);
          }
        }

        const orderItems: OrderItem[] = input.items.map((line) => {
          const product = productMap.get(line.slug)!;
          const cleanOptions: Record<string, string> = {};
          if (line.selectedOptions && typeof line.selectedOptions === 'object') {
            for (const opt of product.options) {
              const chosen = line.selectedOptions[opt.label];
              if (typeof chosen === 'string' && opt.values.includes(chosen)) {
                cleanOptions[opt.label] = chosen;
              } else if (opt.values[0]) {
                cleanOptions[opt.label] = opt.values[0];
              }
            }
          }
          const primaryImage =
            product.media.find((m) => m.kind === 'image')?.url ??
            product.media[0]?.url ??
            '/src/assets/images/prod_espresso_maker_1795715868210.jpg';
          return {
            slug: product.slug,
            sku: product.sku,
            title: product.title,
            unitPriceInr: product.priceInr,
            quantity: line.quantity,
            selectedOptions: cleanOptions,
            imageUrl: primaryImage,
          };
        });

        const subtotalInr = orderItems.reduce(
          (sum, item) => sum + item.unitPriceInr * item.quantity,
          0
        );

        const settingsRes = await tx.query<Record<string, unknown>>(
          `SELECT free_shipping_threshold_inr, flat_shipping_inr FROM store_settings WHERE id = 1`
        );
        const freeThreshold = Number(
          settingsRes.rows[0]?.free_shipping_threshold_inr ?? DEFAULT_SETTINGS.freeShippingThresholdInr
        );
        const flatShip = Number(
          settingsRes.rows[0]?.flat_shipping_inr ?? DEFAULT_SETTINGS.flatShippingInr
        );

        let discountInr = 0;
        let shippingInr = subtotalInr >= freeThreshold ? 0 : flatShip;
        let appliedCoupon: string | null = null;

        const trimmedCode = (input.couponCode || '').trim().toUpperCase();
        if (trimmedCode) {
          const cRes = await tx.query<Record<string, unknown>>(
            `SELECT * FROM coupons WHERE code = $1 AND active = TRUE`,
            [trimmedCode]
          );
          const couponRow = cRes.rows[0];
          if (!couponRow) {
            throw new Error('Coupon code is not valid or has expired.');
          }
          const minSub = Number(couponRow.min_subtotal_inr);
          if (subtotalInr < minSub) {
            throw new Error(
              `Minimum order of ₹${minSub.toLocaleString('en-IN')} required for ${trimmedCode}.`
            );
          }
          appliedCoupon = trimmedCode;
          const kind = String(couponRow.kind);
          const val = Number(couponRow.value);
          if (kind === 'percent') {
            discountInr = Math.round((subtotalInr * val) / 100);
          } else if (kind === 'flat') {
            discountInr = Math.min(subtotalInr, val);
          } else if (kind === 'shipping') {
            shippingInr = 0;
          }
        }

        // Atomically decrement stock inside transaction
        for (const [slug, totalQty] of qtyBySlug.entries()) {
          const updatedStock = await tx.query<{ stock: number }>(
            `UPDATE products
             SET stock = stock - $2, updated_at = NOW()
             WHERE slug = $1 AND stock >= $2
             RETURNING stock`,
            [slug, totalQty]
          );
          if (updatedStock.rows.length === 0) {
            const p = productMap.get(slug)!;
            throw new Error(`Insufficient stock remaining for "${p.title}".`);
          }
        }

        const cleanCustomer: OrderCustomer = {
          name: input.customer.name.trim(),
          email: input.customer.email.trim().toLowerCase(),
          phone: input.customer.phone.trim(),
          addressLine1: input.customer.addressLine1.trim(),
          addressLine2: input.customer.addressLine2?.trim() || undefined,
          city: input.customer.city.trim(),
          state: input.customer.state.trim(),
          pincode: input.customer.pincode.trim(),
        };
        const customerId = await upsertCustomer(tx, cleanCustomer);

        let reference = '';
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const candidate = `THL-${Math.floor(10000 + Math.random() * 89999)}`;
          const dup = await tx.query<{ reference: string }>(
            `SELECT reference FROM orders WHERE reference = $1`,
            [candidate]
          );
          if (dup.rows.length === 0) {
            reference = candidate;
            break;
          }
        }
        if (!reference) {
          reference = `THL-${Date.now().toString().slice(-6)}`;
        }

        const now = new Date().toISOString();
        const totalInr = Math.max(0, subtotalInr - discountInr + shippingInr);

        await tx.query(
          `INSERT INTO orders (
            reference, customer_id, status, payment_method, customer_snapshot,
            subtotal_inr, discount_inr, shipping_inr, total_inr, coupon_code, note,
            created_at, updated_at
          ) VALUES ($1, $2, 'confirmed', $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11::timestamptz, $11::timestamptz)`,
          [
            reference,
            customerId,
            input.paymentMethod,
            JSON.stringify(cleanCustomer),
            subtotalInr,
            discountInr,
            shippingInr,
            totalInr,
            appliedCoupon,
            input.note?.trim() || null,
            now,
          ]
        );

        for (const item of orderItems) {
          await tx.query(
            `INSERT INTO order_items (
              order_reference, product_slug, sku, title, unit_price_inr, quantity, selected_options, image_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
            [
              reference,
              item.slug,
              item.sku,
              item.title,
              item.unitPriceInr,
              item.quantity,
              JSON.stringify(item.selectedOptions),
              item.imageUrl,
            ]
          );
        }

        return {
          reference,
          createdAt: now,
          updatedAt: now,
          status: 'confirmed',
          paymentMethod: input.paymentMethod,
          customer: cleanCustomer,
          items: orderItems,
          subtotalInr,
          discountInr,
          shippingInr,
          totalInr,
          couponCode: appliedCoupon,
          note: input.note?.trim() || undefined,
        };
      });
    },

    async getOrders(): Promise<Order[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM orders ORDER BY created_at DESC`
      );
      return hydrateOrders(res.rows);
    },

    async getOrderByReference(reference: string): Promise<Order | undefined> {
      await ready();
      const normalized = reference.trim().toUpperCase();
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM orders WHERE UPPER(reference) = $1`,
        [normalized]
      );
      const orders = await hydrateOrders(res.rows);
      return orders[0];
    },

    async updateOrderStatus(reference: string, status: OrderStatus): Promise<Order> {
      await ready();
      const normalized = reference.trim().toUpperCase();
      const res = await db.query<Record<string, unknown>>(
        `UPDATE orders SET status = $2, updated_at = NOW()
         WHERE UPPER(reference) = $1
         RETURNING *`,
        [normalized, status]
      );
      if (res.rows.length === 0) {
        throw new Error('Order not found.');
      }
      const orders = await hydrateOrders(res.rows);
      return orders[0];
    },

    async getCustomers(): Promise<CustomerSummary[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT
           c.id, c.name, c.email, c.phone, c.city, c.state, c.pincode, c.created_at,
           COUNT(o.reference)::int AS order_count,
           COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total_inr ELSE 0 END), 0)::int AS total_spent_inr,
           MAX(o.created_at) AS last_order_at
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
         GROUP BY c.id, c.name, c.email, c.phone, c.city, c.state, c.pincode, c.created_at
         ORDER BY MAX(o.created_at) DESC NULLS LAST, c.created_at DESC`
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        email: String(r.email),
        phone: String(r.phone ?? ''),
        city: String(r.city ?? ''),
        state: String(r.state ?? ''),
        pincode: String(r.pincode ?? ''),
        orderCount: Number(r.order_count ?? 0),
        totalSpentInr: Number(r.total_spent_inr ?? 0),
        lastOrderAt: r.last_order_at ? toIso(r.last_order_at) : null,
        createdAt: toIso(r.created_at),
      }));
    },

    // --- Staff & Sessions ---

    async hasAnyStaff(): Promise<boolean> {
      await ready();
      const res = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM admin_users`
      );
      return Number(res.rows[0]?.count ?? 0) > 0;
    },

    async getAllStaff(): Promise<StaffMember[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM admin_users ORDER BY created_at ASC`
      );
      return res.rows.map((r) => toPublicStaff(mapStaffRow(r)));
    },

    async findStaffByEmail(email: string): Promise<StaffRecord | undefined> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM admin_users WHERE email = $1`,
        [email.trim().toLowerCase()]
      );
      return res.rows[0] ? mapStaffRow(res.rows[0]) : undefined;
    },

    async findStaffById(id: string): Promise<StaffRecord | undefined> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT * FROM admin_users WHERE id = $1`,
        [id]
      );
      return res.rows[0] ? mapStaffRow(res.rows[0]) : undefined;
    },

    async createFirstAdmin(input: {
      name: string;
      email: string;
      password: string;
    }): Promise<StaffRecord> {
      await ready();
      return db.withTransaction(async (tx) => {
        const existing = await tx.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM admin_users`
        );
        if (Number(existing.rows[0]?.count ?? 0) > 0) {
          throw new Error('Initial admin setup has already been completed.');
        }
        const { hash, salt } = hashPassword(input.password);
        const now = new Date().toISOString();
        const id = `stf_${generateOpaqueToken(8)}`;
        const res = await tx.query<Record<string, unknown>>(
          `INSERT INTO admin_users (
            id, name, email, role, password_hash, password_salt, verified, created_at, last_login_at
          ) VALUES ($1, $2, $3, 'admin', $4, $5, TRUE, $6::timestamptz, $6::timestamptz)
          RETURNING *`,
          [id, input.name.trim(), input.email.trim().toLowerCase(), hash, salt, now]
        );
        return mapStaffRow(res.rows[0]);
      });
    },

    async createStaffAccount(input: {
      name: string;
      email: string;
      role: StaffRole;
      password: string;
    }): Promise<StaffRecord> {
      await ready();
      const email = input.email.trim().toLowerCase();
      const exists = await db.query<{ id: string }>(
        `SELECT id FROM admin_users WHERE email = $1`,
        [email]
      );
      if (exists.rows.length > 0) {
        throw new Error('A staff member with this email already exists.');
      }
      const { hash, salt } = hashPassword(input.password);
      const id = `stf_${generateOpaqueToken(8)}`;
      const res = await db.query<Record<string, unknown>>(
        `INSERT INTO admin_users (
          id, name, email, role, password_hash, password_salt, verified, created_at, last_login_at
        ) VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), NULL)
        RETURNING *`,
        [id, input.name.trim(), email, input.role, hash, salt]
      );
      return mapStaffRow(res.rows[0]);
    },

    async deleteStaffAccount(id: string, actingStaffId: string): Promise<void> {
      await ready();
      if (id === actingStaffId) {
        throw new Error('You cannot remove your own active account.');
      }
      await db.withTransaction(async (tx) => {
        const targetRes = await tx.query<Record<string, unknown>>(
          `SELECT id, role FROM admin_users WHERE id = $1`,
          [id]
        );
        const target = targetRes.rows[0];
        if (!target) {
          throw new Error('Staff account not found.');
        }
        if (target.role === 'admin') {
          const countRes = await tx.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM admin_users WHERE role = 'admin'`
          );
          if (Number(countRes.rows[0]?.count ?? 0) <= 1) {
            throw new Error('At least one administrator account must remain.');
          }
        }
        await tx.query(`DELETE FROM admin_users WHERE id = $1`, [id]);
      });
    },

    async authenticateStaff(email: string, password: string): Promise<StaffRecord | null> {
      await ready();
      const staff = await this.findStaffByEmail(email);
      if (!staff) return null;
      if (!verifyPassword(password, staff.passwordHash, staff.passwordSalt)) {
        return null;
      }
      return staff;
    },

    async createSession(staffId: string): Promise<string> {
      await ready();
      const rawToken = generateOpaqueToken(32);
      const tokenHash = hashToken(rawToken);
      const now = Date.now();
      const createdAt = new Date(now).toISOString();
      const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();

      await db.withTransaction(async (tx) => {
        await tx.query(`DELETE FROM admin_sessions WHERE expires_at <= NOW()`);
        await tx.query(
          `INSERT INTO admin_sessions (token_hash, staff_id, created_at, expires_at)
           VALUES ($1, $2, $3::timestamptz, $4::timestamptz)`,
          [tokenHash, staffId, createdAt, expiresAt]
        );
        await tx.query(`UPDATE admin_users SET last_login_at = $2::timestamptz WHERE id = $1`, [
          staffId,
          createdAt,
        ]);
      });
      return rawToken;
    },

    async getStaffBySessionToken(rawToken: string): Promise<StaffRecord | null> {
      await ready();
      const hashed = hashToken(rawToken);
      const res = await db.query<Record<string, unknown>>(
        `SELECT u.*, s.expires_at AS session_expires_at
         FROM admin_sessions s
         INNER JOIN admin_users u ON u.id = s.staff_id
         WHERE s.token_hash = $1`,
        [hashed]
      );
      const row = res.rows[0];
      if (!row) return null;
      if (Date.parse(toIso(row.session_expires_at)) <= Date.now()) {
        await db.query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [hashed]);
        return null;
      }
      return mapStaffRow(row);
    },

    async revokeSession(rawToken: string): Promise<void> {
      await ready();
      await db.query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [hashToken(rawToken)]);
    },

    async createActionToken(
      staffId: string,
      kind: 'verify' | 'reset',
      ttlMs = 1000 * 60 * 60 * 24
    ): Promise<string> {
      await ready();
      const rawToken = generateOpaqueToken(24);
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + ttlMs).toISOString();
      await db.withTransaction(async (tx) => {
        await tx.query(
          `DELETE FROM admin_action_tokens WHERE expires_at <= NOW() OR (staff_id = $1 AND kind = $2)`,
          [staffId, kind]
        );
        await tx.query(
          `INSERT INTO admin_action_tokens (token_hash, kind, staff_id, expires_at)
           VALUES ($1, $2, $3, $4::timestamptz)`,
          [tokenHash, kind, staffId, expiresAt]
        );
      });
      return rawToken;
    },

    async consumeVerificationToken(rawToken: string): Promise<StaffRecord | null> {
      await ready();
      const hashed = hashToken(rawToken);
      return db.withTransaction(async (tx) => {
        const tokRes = await tx.query<{ staff_id: string }>(
          `DELETE FROM admin_action_tokens
           WHERE token_hash = $1 AND kind = 'verify' AND expires_at > NOW()
           RETURNING staff_id`,
          [hashed]
        );
        const staffId = tokRes.rows[0]?.staff_id;
        if (!staffId) return null;
        const userRes = await tx.query<Record<string, unknown>>(
          `UPDATE admin_users SET verified = TRUE WHERE id = $1 RETURNING *`,
          [staffId]
        );
        return userRes.rows[0] ? mapStaffRow(userRes.rows[0]) : null;
      });
    },

    async consumeResetToken(rawToken: string, newPassword: string): Promise<StaffRecord | null> {
      await ready();
      const hashed = hashToken(rawToken);
      return db.withTransaction(async (tx) => {
        const tokRes = await tx.query<{ staff_id: string }>(
          `DELETE FROM admin_action_tokens
           WHERE token_hash = $1 AND kind = 'reset' AND expires_at > NOW()
           RETURNING staff_id`,
          [hashed]
        );
        const staffId = tokRes.rows[0]?.staff_id;
        if (!staffId) return null;
        const { hash, salt } = hashPassword(newPassword);
        const userRes = await tx.query<Record<string, unknown>>(
          `UPDATE admin_users
           SET password_hash = $2, password_salt = $3, verified = TRUE
           WHERE id = $1
           RETURNING *`,
          [staffId, hash, salt]
        );
        await tx.query(`DELETE FROM admin_sessions WHERE staff_id = $1`, [staffId]);
        return userRes.rows[0] ? mapStaffRow(userRes.rows[0]) : null;
      });
    },

    async updateStaffPassword(
      staffId: string,
      currentPassword: string,
      newPassword: string
    ): Promise<void> {
      await ready();
      const staff = await this.findStaffById(staffId);
      if (!staff) {
        throw new Error('Staff account not found.');
      }
      if (!verifyPassword(currentPassword, staff.passwordHash, staff.passwordSalt)) {
        throw new Error('Current password is incorrect.');
      }
      const { hash, salt } = hashPassword(newPassword);
      await db.query(
        `UPDATE admin_users SET password_hash = $2, password_salt = $3 WHERE id = $1`,
        [staffId, hash, salt]
      );
    },

    // --- Reviews & Newsletter ---

    async getReviewsBySlug(slug: string): Promise<ProductReview[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT id, product_slug, author_name, rating, title, comment, verified_purchase, created_at
         FROM product_reviews
         WHERE product_slug = $1
         ORDER BY created_at DESC`,
        [slug]
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        slug: String(r.product_slug),
        authorName: String(r.author_name),
        rating: Number(r.rating),
        title: String(r.title ?? ''),
        comment: String(r.comment),
        verifiedPurchase: Boolean(r.verified_purchase),
        createdAt: toIso(r.created_at),
      }));
    },

    async getAllReviews(): Promise<ProductReview[]> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT id, product_slug, author_name, rating, title, comment, verified_purchase, created_at
         FROM product_reviews
         ORDER BY created_at DESC`
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        slug: String(r.product_slug),
        authorName: String(r.author_name),
        rating: Number(r.rating),
        title: String(r.title ?? ''),
        comment: String(r.comment),
        verifiedPurchase: Boolean(r.verified_purchase),
        createdAt: toIso(r.created_at),
      }));
    },

    async getReviewStats(): Promise<Record<string, ReviewSummary>> {
      await ready();
      const res = await db.query<{ product_slug: string; avg_rating: string; review_count: string }>(
        `SELECT
           product_slug,
           ROUND(AVG(rating)::numeric, 1)::text AS avg_rating,
           COUNT(*)::text AS review_count
         FROM product_reviews
         GROUP BY product_slug`
      );
      const result: Record<string, ReviewSummary> = {};
      for (const r of res.rows) {
        result[r.product_slug] = {
          average: Number(r.avg_rating),
          count: Number(r.review_count),
        };
      }
      return result;
    },

    async createReview(input: {
      slug: string;
      authorName: string;
      rating: number;
      title: string;
      comment: string;
      orderReference?: string;
    }): Promise<ProductReview> {
      await ready();
      const product = await this.getProductBySlug(input.slug, false);
      if (!product) {
        throw new Error('Product not found.');
      }

      let verifiedPurchase = false;
      if (input.orderReference && input.orderReference.trim()) {
        const ref = input.orderReference.trim().toUpperCase();
        const match = await db.query<{ reference: string }>(
          `SELECT o.reference
           FROM orders o
           INNER JOIN order_items oi ON oi.order_reference = o.reference
           WHERE UPPER(o.reference) = $1
             AND o.status <> 'cancelled'
             AND oi.product_slug = $2
           LIMIT 1`,
          [ref, input.slug]
        );
        verifiedPurchase = match.rows.length > 0;
      }

      const id = `rev_${generateOpaqueToken(8)}`;
      const now = new Date().toISOString();
      await db.query(
        `INSERT INTO product_reviews (
          id, product_slug, author_name, rating, title, comment, verified_purchase, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)`,
        [
          id,
          input.slug,
          input.authorName.trim(),
          input.rating,
          input.title.trim(),
          input.comment.trim(),
          verifiedPurchase,
          now,
        ]
      );

      return {
        id,
        slug: input.slug,
        authorName: input.authorName.trim(),
        rating: input.rating,
        title: input.title.trim(),
        comment: input.comment.trim(),
        verifiedPurchase,
        createdAt: now,
      };
    },

    async deleteReview(id: string): Promise<void> {
      await ready();
      const res = await db.query(`DELETE FROM product_reviews WHERE id = $1`, [id]);
      if ((res.rowCount ?? 0) === 0) {
        throw new Error('Review not found.');
      }
    },

    async addNewsletterSubscriber(email: string): Promise<{ alreadySubscribed: boolean }> {
      await ready();
      const normalized = email.trim().toLowerCase();
      const res = await db.query<{ email: string }>(
        `INSERT INTO newsletter_subscribers (email, subscribed_at)
         VALUES ($1, NOW())
         ON CONFLICT (email) DO NOTHING
         RETURNING email`,
        [normalized]
      );
      return { alreadySubscribed: res.rows.length === 0 };
    },

    // --- Uploaded Media (stored in Neon so uploads work across Vercel serverless instances) ---

    async saveUploadedMedia(input: {
      filename: string;
      kind: MediaKind;
      mimeType: string;
      alt: string;
      data: Buffer;
    }): Promise<void> {
      await ready();
      await db.query(
        `INSERT INTO uploaded_media (filename, kind, mime_type, alt, data, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (filename) DO UPDATE SET
           kind = EXCLUDED.kind,
           mime_type = EXCLUDED.mime_type,
           alt = EXCLUDED.alt,
           data = EXCLUDED.data`,
        [input.filename, input.kind, input.mimeType, input.alt, input.data]
      );
    },

    async getUploadedMedia(filename: string): Promise<UploadedMediaRecord | null> {
      await ready();
      const res = await db.query<Record<string, unknown>>(
        `SELECT filename, kind, mime_type, alt, data, created_at
         FROM uploaded_media
         WHERE filename = $1`,
        [filename]
      );
      const r = res.rows[0];
      if (!r) return null;
      const rawData = r.data;
      const buf = Buffer.isBuffer(rawData)
        ? rawData
        : rawData instanceof Uint8Array
          ? Buffer.from(rawData)
          : Buffer.from(String(rawData ?? ''), 'base64');
      return {
        filename: String(r.filename),
        kind: r.kind === 'video' ? 'video' : 'image',
        mimeType: String(r.mime_type),
        alt: String(r.alt ?? ''),
        data: buf,
        createdAt: toIso(r.created_at),
      };
    },

    async deleteUploadedMedia(filename: string): Promise<void> {
      await ready();
      await db.query(`DELETE FROM uploaded_media WHERE filename = $1`, [filename]);
    },
  };
}

export type StoreRepository = ReturnType<typeof createPostgresRepository>;

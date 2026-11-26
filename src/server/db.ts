import fs from 'node:fs';
import path from 'node:path';
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
  Order,
  OrderStatus,
  Product,
  ProductReview,
  ReviewSummary,
  StaffMember,
  StaffRole,
  StoreSettings,
  WebsiteContent,
} from '../shared/types';
import { SESSION_TTL_MS, generateOpaqueToken, hashPassword, hashToken, verifyPassword } from './auth';

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
  options?: Product['options'];
  media?: Product['media'];
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

export interface SessionRecord {
  tokenHash: string;
  staffId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ActionTokenRecord {
  tokenHash: string;
  kind: 'verify' | 'reset';
  staffId: string;
  expiresAt: string;
}

interface PersistedState {
  catalogVersion?: number;
  productOverrides: Record<string, ProductOverride>;
  customProducts: Product[];
  categories: Category[];
  coupons: Coupon[];
  settings: StoreSettings;
  website: WebsiteContent;
  orders: Order[];
  reviews: ProductReview[];
  subscribers: Array<{ email: string; subscribedAt: string }>;
  staff: StaffRecord[];
  sessions: SessionRecord[];
  actionTokens: ActionTokenRecord[];
}

const CURRENT_CATALOG_VERSION = 2;
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'thelakkad-data')
  : path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

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

function mergeWebsite(stored?: Partial<WebsiteContent>): WebsiteContent {
  const base = cloneDefaultWebsite();
  if (!stored || typeof stored !== 'object') return base;
  return {
    theme: { ...base.theme, ...(stored.theme ?? {}) },
    showAnnouncement:
      typeof stored.showAnnouncement === 'boolean'
        ? stored.showAnnouncement
        : base.showAnnouncement,
    header: { ...base.header, ...(stored.header ?? {}) },
    hero: { ...base.hero, ...(stored.hero ?? {}) },
    collection: { ...base.collection, ...(stored.collection ?? {}) },
    about: {
      ...base.about,
      ...(stored.about ?? {}),
      highlights:
        Array.isArray(stored.about?.highlights) && stored.about.highlights.length > 0
          ? stored.about.highlights.map((h) => ({ ...h }))
          : base.about.highlights,
    },
    footer: { ...base.footer, ...(stored.footer ?? {}) },
  };
}

function createSeedReviews(): ProductReview[] {
  const now = Date.now();
  return [
    {
      id: 'rev_seed_1',
      slug: 'barista-compact-espresso-machine',
      authorName: 'Rohan Menon',
      rating: 5,
      title: 'Fast heat-up and real café crema',
      comment:
        'Heats up in under a minute and pulls balanced double shots right out of the box. The steam wand micro-foams oat milk smoothly without taking over my counter.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 6).toISOString(),
    },
    {
      id: 'rev_seed_2',
      slug: 'barista-compact-espresso-machine',
      authorName: 'Kavita Iyer',
      rating: 4,
      title: 'Solid build, compact footprint',
      comment:
        'Very sturdy brushed steel casing and clean controls. Took two mornings to dial in my grind size, and now it makes better cappuccinos than my local café.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 2).toISOString(),
    },
    {
      id: 'rev_seed_3',
      slug: 'emerald-pleated-satin-midi-dress',
      authorName: 'Ananya Deshmukh',
      rating: 5,
      title: 'Beautiful drape and rich emerald shade',
      comment:
        'The sunburst pleats hold their shape even after sitting through a long dinner. True to size—I ordered M and the wrap waist tie adjusts cleanly.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
    },
    {
      id: 'rev_seed_4',
      slug: 'ivory-tiered-cotton-linen-maxi-dress',
      authorName: 'Priya Nair',
      rating: 5,
      title: 'Breathable fabric with deep pockets',
      comment:
        'Wore this through a humid Goa weekend and stayed comfortable all afternoon. The cotton lining is completely opaque and the side pockets are a huge plus.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 4).toISOString(),
    },
    {
      id: 'rev_seed_5',
      slug: 'artisan-tilt-head-stand-mixer',
      authorName: 'Devika Shah',
      rating: 5,
      title: 'Handles sourdough and brioche effortlessly',
      comment:
        'Heavy die-cast base stays put on speed 6 with zero wobble. Much quieter than my previous mixer.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString(),
    },
    {
      id: 'rev_seed_6',
      slug: 'cognac-full-grain-leather-tote',
      authorName: 'Nikhil Rao',
      rating: 5,
      title: 'Fits my 15-inch MacBook and charger easily',
      comment:
        'Supple pebbled leather with sturdy brass zip. Looks sharp for office commutes and weekend flights alike.',
      verifiedPurchase: true,
      createdAt: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
    },
  ];
}

function createInitialState(): PersistedState {
  return {
    catalogVersion: CURRENT_CATALOG_VERSION,
    productOverrides: {},
    customProducts: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    coupons: DEFAULT_COUPONS.map((c) => ({ ...c })),
    settings: { ...DEFAULT_SETTINGS },
    website: cloneDefaultWebsite(),
    orders: createSeedOrders(),
    reviews: createSeedReviews(),
    subscribers: [],
    staff: [],
    sessions: [],
    actionTokens: [],
  };
}

let cachedState: PersistedState | null = null;

function loadState(): PersistedState {
  if (cachedState) return cachedState;
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const initial = createInitialState();

      // Migrate older stoneware catalog data cleanly while keeping staff & sessions intact
      if (parsed.catalogVersion !== CURRENT_CATALOG_VERSION) {
        cachedState = {
          ...initial,
          staff: Array.isArray(parsed.staff) ? parsed.staff : [],
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          actionTokens: Array.isArray(parsed.actionTokens) ? parsed.actionTokens : [],
        };
        saveState(cachedState);
        return cachedState;
      }

      cachedState = {
        catalogVersion: CURRENT_CATALOG_VERSION,
        productOverrides: parsed.productOverrides ?? initial.productOverrides,
        customProducts: Array.isArray(parsed.customProducts) ? parsed.customProducts : [],
        categories:
          Array.isArray(parsed.categories) && parsed.categories.length > 0
            ? parsed.categories
            : initial.categories,
        coupons: Array.isArray(parsed.coupons) ? parsed.coupons : initial.coupons,
        settings: { ...initial.settings, ...(parsed.settings ?? {}) },
        website: mergeWebsite(parsed.website),
        orders: Array.isArray(parsed.orders) ? parsed.orders : initial.orders,
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews : initial.reviews,
        subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [],
        staff: Array.isArray(parsed.staff) ? parsed.staff : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        actionTokens: Array.isArray(parsed.actionTokens) ? parsed.actionTokens : [],
      };
      return cachedState;
    }
  } catch (err) {
    console.warn('[db] Could not read store.json, initializing fresh state:', err);
  }
  cachedState = createInitialState();
  saveState(cachedState);
  return cachedState;
}

function saveState(state: PersistedState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmpFile, STORE_FILE);
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

export function getMergedProducts(includeArchived = false): Product[] {
  const state = loadState();
  const defaults = DEFAULT_PRODUCTS.map((base) => {
    const override = state.productOverrides[base.slug];
    if (!override) {
      return { ...base, hasOverride: false, isCustom: false };
    }
    return {
      ...base,
      ...override,
      slug: base.slug,
      sku: base.sku,
      hasOverride: true,
      isCustom: false,
    };
  });

  const customs = state.customProducts.map((p) => ({
    ...p,
    isCustom: true,
    hasOverride: false,
  }));

  const combined = [...defaults, ...customs];
  return includeArchived ? combined : combined.filter((p) => !p.archived);
}

export function getProductBySlug(slug: string, includeArchived = true): Product | undefined {
  return getMergedProducts(includeArchived).find((p) => p.slug === slug);
}

export function getCategories(): Category[] {
  return loadState().categories.map((c) => ({ ...c }));
}

export function getCoupons(): Coupon[] {
  return loadState().coupons.map((c) => ({ ...c }));
}

export function getSettings(): StoreSettings {
  return { ...loadState().settings };
}

export function updateSettings(next: Partial<StoreSettings>): StoreSettings {
  const state = loadState();
  state.settings = {
    ...state.settings,
    ...next,
  };
  saveState(state);
  return { ...state.settings };
}

export function getWebsiteContent(): WebsiteContent {
  return mergeWebsite(loadState().website);
}

export function updateWebsiteContent(next: WebsiteContent): WebsiteContent {
  const state = loadState();
  state.website = mergeWebsite(next);
  saveState(state);
  return mergeWebsite(state.website);
}

export function resetWebsiteContent(): WebsiteContent {
  const state = loadState();
  state.website = cloneDefaultWebsite();
  saveState(state);
  return cloneDefaultWebsite();
}

export function createCategory(input: { name: string; slug?: string; description: string }): Category {
  const state = loadState();
  const slug = slugify(input.slug || input.name);
  if (!slug) {
    throw new Error('Category slug is invalid.');
  }
  if (state.categories.some((c) => c.slug === slug)) {
    throw new Error('A category with this slug already exists.');
  }
  const category: Category = {
    slug,
    name: input.name.trim(),
    description: input.description.trim(),
    isDefault: false,
  };
  state.categories.push(category);
  saveState(state);
  return { ...category };
}

export function updateCategory(slug: string, input: { name: string; description: string }): Category {
  const state = loadState();
  const idx = state.categories.findIndex((c) => c.slug === slug);
  if (idx === -1) {
    throw new Error('Category not found.');
  }
  state.categories[idx] = {
    ...state.categories[idx],
    name: input.name.trim(),
    description: input.description.trim(),
  };
  saveState(state);
  return { ...state.categories[idx] };
}

export function deleteCategory(slug: string): void {
  const state = loadState();
  const idx = state.categories.findIndex((c) => c.slug === slug);
  if (idx === -1) {
    throw new Error('Category not found.');
  }
  const allProducts = getMergedProducts(true);
  const inUseCount = allProducts.filter((p) => p.category === slug).length;
  if (inUseCount > 0) {
    throw new Error(`Cannot delete category while ${inUseCount} product(s) still reference it.`);
  }
  state.categories.splice(idx, 1);
  saveState(state);
}

export function createProduct(product: Product): Product {
  const state = loadState();
  const existingSlugs = new Set(getMergedProducts(true).map((p) => p.slug));
  if (existingSlugs.has(product.slug)) {
    throw new Error('A product with this slug already exists.');
  }
  const now = new Date().toISOString();
  const created: Product = {
    ...product,
    isCustom: true,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  state.customProducts.push(created);
  saveState(state);
  return { ...created };
}

export function updateProduct(slug: string, patch: ProductOverride): Product {
  const state = loadState();
  const now = new Date().toISOString();
  const customIdx = state.customProducts.findIndex((p) => p.slug === slug);
  if (customIdx !== -1) {
    state.customProducts[customIdx] = {
      ...state.customProducts[customIdx],
      ...patch,
      slug,
      updatedAt: now,
    };
    saveState(state);
    return { ...state.customProducts[customIdx], isCustom: true, hasOverride: false };
  }

  const base = DEFAULT_PRODUCTS.find((p) => p.slug === slug);
  if (!base) {
    throw new Error('Product not found.');
  }

  state.productOverrides[slug] = {
    ...(state.productOverrides[slug] ?? {}),
    ...patch,
    updatedAt: now,
  };
  saveState(state);
  const merged = getProductBySlug(slug, true);
  if (!merged) throw new Error('Product not found.');
  return merged;
}

export function setProductArchived(slug: string, archived: boolean): Product {
  return updateProduct(slug, { archived });
}

export function resetOrDeleteProduct(slug: string): { action: 'deleted' | 'reset'; removedMediaUrls: string[] } {
  const state = loadState();
  const customIdx = state.customProducts.findIndex((p) => p.slug === slug);
  if (customIdx !== -1) {
    const removed = state.customProducts[customIdx].media
      .map((m) => m.url)
      .filter((u) => u.startsWith('/uploads/'));
    state.customProducts.splice(customIdx, 1);
    saveState(state);
    return { action: 'deleted', removedMediaUrls: removed };
  }

  const base = DEFAULT_PRODUCTS.find((p) => p.slug === slug);
  if (!base) {
    throw new Error('Product not found.');
  }
  const existingOverride = state.productOverrides[slug];
  const removed = (existingOverride?.media ?? [])
    .map((m) => m.url)
    .filter((u) => u.startsWith('/uploads/'));
  delete state.productOverrides[slug];
  saveState(state);
  return { action: 'reset', removedMediaUrls: removed };
}

export function createCoupon(coupon: Coupon): Coupon {
  const state = loadState();
  const code = coupon.code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
    throw new Error('Coupon code must be 3–24 letters, numbers, dashes, or underscores.');
  }
  if (state.coupons.some((c) => c.code === code)) {
    throw new Error('Coupon code already exists.');
  }
  const created: Coupon = {
    ...coupon,
    code,
    isDefault: false,
  };
  state.coupons.push(created);
  saveState(state);
  return { ...created };
}

export function deleteCoupon(code: string): void {
  const state = loadState();
  const upper = code.trim().toUpperCase();
  const idx = state.coupons.findIndex((c) => c.code === upper);
  if (idx === -1) {
    throw new Error('Coupon not found.');
  }
  state.coupons.splice(idx, 1);
  saveState(state);
}

export function calculateDiscountAndShipping(params: {
  subtotalInr: number;
  couponCode?: string | null;
}): {
  discountInr: number;
  shippingInr: number;
  appliedCoupon: string | null;
  couponError?: string;
} {
  const state = loadState();
  const settings = state.settings;
  let discountInr = 0;
  let shippingInr =
    params.subtotalInr >= settings.freeShippingThresholdInr ? 0 : settings.flatShippingInr;
  let appliedCoupon: string | null = null;

  const trimmedCode = (params.couponCode || '').trim().toUpperCase();
  if (trimmedCode) {
    const coupon = state.coupons.find((c) => c.code === trimmedCode && c.active);
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
}

export function createOrder(input: {
  customer: Order['customer'];
  paymentMethod: Order['paymentMethod'];
  items: Array<{ slug: string; quantity: number; selectedOptions?: Record<string, string> }>;
  couponCode?: string | null;
  note?: string;
}): Order {
  const state = loadState();
  const mergedProducts = getMergedProducts(false);
  const productMap = new Map(mergedProducts.map((p) => [p.slug, p]));

  if (!input.items.length || input.items.length > 30) {
    throw new Error('Order must contain between 1 and 30 line items.');
  }

  // Validate stock across aggregated quantities per slug first
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
      throw new Error(
        `Only ${product.stock} left in stock for "${product.title}".`
      );
    }
  }

  const orderItems: Order['items'] = input.items.map((line) => {
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

  const pricing = calculateDiscountAndShipping({
    subtotalInr,
    couponCode: input.couponCode,
  });
  if (pricing.couponError) {
    throw new Error(pricing.couponError);
  }

  // Decrement stock
  const now = new Date().toISOString();
  for (const [slug, totalQty] of qtyBySlug.entries()) {
    const product = productMap.get(slug)!;
    const nextStock = Math.max(0, product.stock - totalQty);
    const customIdx = state.customProducts.findIndex((p) => p.slug === slug);
    if (customIdx !== -1) {
      state.customProducts[customIdx].stock = nextStock;
      state.customProducts[customIdx].updatedAt = now;
    } else {
      state.productOverrides[slug] = {
        ...(state.productOverrides[slug] ?? {}),
        stock: nextStock,
        updatedAt: now,
      };
    }
  }

  // Generate unique order reference
  let reference = '';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const num = Math.floor(10000 + Math.random() * 89999);
    const candidate = `THL-${num}`;
    if (!state.orders.some((o) => o.reference === candidate)) {
      reference = candidate;
      break;
    }
  }
  if (!reference) {
    reference = `THL-${Date.now().toString().slice(-6)}`;
  }

  const order: Order = {
    reference,
    createdAt: now,
    updatedAt: now,
    status: 'confirmed',
    paymentMethod: input.paymentMethod,
    customer: {
      name: input.customer.name.trim(),
      email: input.customer.email.trim().toLowerCase(),
      phone: input.customer.phone.trim(),
      addressLine1: input.customer.addressLine1.trim(),
      addressLine2: input.customer.addressLine2?.trim() || undefined,
      city: input.customer.city.trim(),
      state: input.customer.state.trim(),
      pincode: input.customer.pincode.trim(),
    },
    items: orderItems,
    subtotalInr,
    discountInr: pricing.discountInr,
    shippingInr: pricing.shippingInr,
    totalInr: Math.max(0, subtotalInr - pricing.discountInr + pricing.shippingInr),
    couponCode: pricing.appliedCoupon,
    note: input.note?.trim() || undefined,
  };

  state.orders.unshift(order);
  saveState(state);
  return order;
}

export function getOrders(): Order[] {
  return loadState().orders.map((o) => ({ ...o }));
}

export function getOrderByReference(reference: string): Order | undefined {
  const normalized = reference.trim().toUpperCase();
  return loadState().orders.find((o) => o.reference.toUpperCase() === normalized);
}

export function updateOrderStatus(reference: string, status: OrderStatus): Order {
  const state = loadState();
  const normalized = reference.trim().toUpperCase();
  const idx = state.orders.findIndex((o) => o.reference.toUpperCase() === normalized);
  if (idx === -1) {
    throw new Error('Order not found.');
  }
  state.orders[idx] = {
    ...state.orders[idx],
    status,
    updatedAt: new Date().toISOString(),
  };
  saveState(state);
  return { ...state.orders[idx] };
}

// --- Staff & Auth ---

export function hasAnyStaff(): boolean {
  return loadState().staff.length > 0;
}

export function getAllStaff(): StaffMember[] {
  return loadState().staff.map(toPublicStaff);
}

export function findStaffByEmail(email: string): StaffRecord | undefined {
  const lower = email.trim().toLowerCase();
  return loadState().staff.find((s) => s.email === lower);
}

export function findStaffById(id: string): StaffRecord | undefined {
  return loadState().staff.find((s) => s.id === id);
}

export function createFirstAdmin(input: { name: string; email: string; password: string }): StaffRecord {
  const state = loadState();
  if (state.staff.length > 0) {
    throw new Error('Initial admin setup has already been completed.');
  }
  const { hash, salt } = hashPassword(input.password);
  const now = new Date().toISOString();
  const record: StaffRecord = {
    id: `stf_${generateOpaqueToken(8)}`,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: 'admin',
    passwordHash: hash,
    passwordSalt: salt,
    verified: true,
    createdAt: now,
    lastLoginAt: now,
  };
  state.staff.push(record);
  saveState(state);
  return record;
}

export function createStaffAccount(input: {
  name: string;
  email: string;
  role: StaffRole;
  password: string;
}): StaffRecord {
  const state = loadState();
  const email = input.email.trim().toLowerCase();
  if (state.staff.some((s) => s.email === email)) {
    throw new Error('A staff member with this email already exists.');
  }
  const { hash, salt } = hashPassword(input.password);
  const record: StaffRecord = {
    id: `stf_${generateOpaqueToken(8)}`,
    name: input.name.trim(),
    email,
    role: input.role,
    passwordHash: hash,
    passwordSalt: salt,
    verified: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  state.staff.push(record);
  saveState(state);
  return record;
}

export function deleteStaffAccount(id: string, actingStaffId: string): void {
  const state = loadState();
  if (id === actingStaffId) {
    throw new Error('You cannot remove your own active account.');
  }
  const target = state.staff.find((s) => s.id === id);
  if (!target) {
    throw new Error('Staff account not found.');
  }
  if (target.role === 'admin') {
    const adminCount = state.staff.filter((s) => s.role === 'admin').length;
    if (adminCount <= 1) {
      throw new Error('At least one administrator account must remain.');
    }
  }
  state.staff = state.staff.filter((s) => s.id !== id);
  state.sessions = state.sessions.filter((s) => s.staffId !== id);
  state.actionTokens = state.actionTokens.filter((t) => t.staffId !== id);
  saveState(state);
}

export function authenticateStaff(email: string, password: string): StaffRecord | null {
  const state = loadState();
  const lower = email.trim().toLowerCase();
  const staff = state.staff.find((s) => s.email === lower);
  if (!staff) return null;
  if (!verifyPassword(password, staff.passwordHash, staff.passwordSalt)) {
    return null;
  }
  return staff;
}

export function createSession(staffId: string): string {
  const state = loadState();
  const now = Date.now();
  // Prune expired sessions
  state.sessions = state.sessions.filter((s) => Date.parse(s.expiresAt) > now);
  const rawToken = generateOpaqueToken(32);
  state.sessions.push({
    tokenHash: hashToken(rawToken),
    staffId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  });
  const staff = state.staff.find((s) => s.id === staffId);
  if (staff) {
    staff.lastLoginAt = new Date(now).toISOString();
  }
  saveState(state);
  return rawToken;
}

export function getStaffBySessionToken(rawToken: string): StaffRecord | null {
  const state = loadState();
  const now = Date.now();
  const hashed = hashToken(rawToken);
  const session = state.sessions.find((s) => s.tokenHash === hashed);
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= now) {
    state.sessions = state.sessions.filter((s) => s.tokenHash !== hashed);
    saveState(state);
    return null;
  }
  return state.staff.find((s) => s.id === session.staffId) ?? null;
}

export function revokeSession(rawToken: string): void {
  const state = loadState();
  const hashed = hashToken(rawToken);
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((s) => s.tokenHash !== hashed);
  if (state.sessions.length !== before) {
    saveState(state);
  }
}

export function createActionToken(staffId: string, kind: 'verify' | 'reset', ttlMs = 1000 * 60 * 60 * 24): string {
  const state = loadState();
  const now = Date.now();
  state.actionTokens = state.actionTokens.filter(
    (t) => Date.parse(t.expiresAt) > now && !(t.staffId === staffId && t.kind === kind)
  );
  const rawToken = generateOpaqueToken(24);
  state.actionTokens.push({
    tokenHash: hashToken(rawToken),
    kind,
    staffId,
    expiresAt: new Date(now + ttlMs).toISOString(),
  });
  saveState(state);
  return rawToken;
}

export function consumeVerificationToken(rawToken: string): StaffRecord | null {
  const state = loadState();
  const now = Date.now();
  const hashed = hashToken(rawToken);
  const idx = state.actionTokens.findIndex(
    (t) => t.tokenHash === hashed && t.kind === 'verify' && Date.parse(t.expiresAt) > now
  );
  if (idx === -1) return null;
  const { staffId } = state.actionTokens[idx];
  state.actionTokens.splice(idx, 1);
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) {
    saveState(state);
    return null;
  }
  staff.verified = true;
  saveState(state);
  return staff;
}

export function consumeResetToken(rawToken: string, newPassword: string): StaffRecord | null {
  const state = loadState();
  const now = Date.now();
  const hashed = hashToken(rawToken);
  const idx = state.actionTokens.findIndex(
    (t) => t.tokenHash === hashed && t.kind === 'reset' && Date.parse(t.expiresAt) > now
  );
  if (idx === -1) return null;
  const { staffId } = state.actionTokens[idx];
  state.actionTokens.splice(idx, 1);
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) {
    saveState(state);
    return null;
  }
  const { hash, salt } = hashPassword(newPassword);
  staff.passwordHash = hash;
  staff.passwordSalt = salt;
  staff.verified = true;
  // Invalidate existing sessions after password reset
  state.sessions = state.sessions.filter((s) => s.staffId !== staffId);
  saveState(state);
  return staff;
}

export function updateStaffPassword(
  staffId: string,
  currentPassword: string,
  newPassword: string
): void {
  const state = loadState();
  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) {
    throw new Error('Staff account not found.');
  }
  if (!verifyPassword(currentPassword, staff.passwordHash, staff.passwordSalt)) {
    throw new Error('Current password is incorrect.');
  }
  const { hash, salt } = hashPassword(newPassword);
  staff.passwordHash = hash;
  staff.passwordSalt = salt;
  saveState(state);
}

// --- Product Reviews & Newsletter ---

export function getReviewsBySlug(slug: string): ProductReview[] {
  return loadState()
    .reviews.filter((r) => r.slug === slug)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function getAllReviews(): ProductReview[] {
  return [...loadState().reviews].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

export function getReviewStats(): Record<string, ReviewSummary> {
  const reviews = loadState().reviews;
  const accum = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    const prev = accum.get(r.slug) ?? { sum: 0, count: 0 };
    prev.sum += r.rating;
    prev.count += 1;
    accum.set(r.slug, prev);
  }
  const result: Record<string, ReviewSummary> = {};
  for (const [slug, { sum, count }] of accum.entries()) {
    result[slug] = {
      average: Math.round((sum / count) * 10) / 10,
      count,
    };
  }
  return result;
}

export function createReview(input: {
  slug: string;
  authorName: string;
  rating: number;
  title: string;
  comment: string;
  orderReference?: string;
}): ProductReview {
  const state = loadState();
  const product = getProductBySlug(input.slug, false);
  if (!product) {
    throw new Error('Product not found.');
  }

  let verifiedPurchase = false;
  if (input.orderReference && input.orderReference.trim()) {
    const ref = input.orderReference.trim().toUpperCase();
    const matchedOrder = state.orders.find(
      (o) =>
        o.reference.toUpperCase() === ref &&
        o.status !== 'cancelled' &&
        o.items.some((item) => item.slug === input.slug)
    );
    verifiedPurchase = Boolean(matchedOrder);
  }

  const review: ProductReview = {
    id: `rev_${generateOpaqueToken(8)}`,
    slug: input.slug,
    authorName: input.authorName.trim(),
    rating: input.rating,
    title: input.title.trim(),
    comment: input.comment.trim(),
    verifiedPurchase,
    createdAt: new Date().toISOString(),
  };

  state.reviews.unshift(review);
  saveState(state);
  return review;
}

export function deleteReview(id: string): void {
  const state = loadState();
  const before = state.reviews.length;
  state.reviews = state.reviews.filter((r) => r.id !== id);
  if (state.reviews.length === before) {
    throw new Error('Review not found.');
  }
  saveState(state);
}

export function addNewsletterSubscriber(email: string): { alreadySubscribed: boolean } {
  const state = loadState();
  const normalized = email.trim().toLowerCase();
  if (state.subscribers.some((s) => s.email === normalized)) {
    return { alreadySubscribed: true };
  }
  state.subscribers.unshift({
    email: normalized,
    subscribedAt: new Date().toISOString(),
  });
  saveState(state);
  return { alreadySubscribed: false };
}


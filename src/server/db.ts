import crypto from 'node:crypto';
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
  CustomerSummary,
  MediaKind,
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
import { DatabaseConfigError, getNeonClient, isNeonConfigured, isVercelRuntime } from './neon';
import {
  createPostgresRepository,
  mergeWebsite,
  slugify,
  toPublicStaff,
  type ProductOverride,
  type StaffRecord,
  type StoreRepository,
  type UploadedMediaRecord,
} from './postgresDb';

export { slugify, toPublicStaff };
export type { ProductOverride, StaffRecord, StoreRepository, UploadedMediaRecord };

// =========================================================================
// REPOSITORY ROUTING (Neon PostgreSQL in production/Vercel & when DATABASE_URL is set;
// local JSON fallback strictly for non-Vercel local development without DATABASE_URL)
// =========================================================================

let repositoryOverride: StoreRepository | null = null;
let cachedNeonRepo: StoreRepository | null = null;
let cachedLocalRepo: StoreRepository | null = null;

export function setRepositoryOverride(repo: StoreRepository | null): void {
  repositoryOverride = repo;
}

export function getActiveStorageDriver(): 'override' | 'neon' | 'local' {
  if (repositoryOverride) return 'override';
  if (isNeonConfigured() || isVercelRuntime()) return 'neon';
  return 'local';
}

export function getActiveRepository(): StoreRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (isNeonConfigured()) {
    if (!cachedNeonRepo) {
      cachedNeonRepo = createPostgresRepository(getNeonClient());
    }
    return cachedNeonRepo;
  }

  if (isVercelRuntime()) {
    // Never fall back to ephemeral /tmp JSON storage on Vercel serverless instances
    throw new DatabaseConfigError(
      'DATABASE_URL is not configured. Connect your Neon PostgreSQL database in Vercel Environment Variables.'
    );
  }

  if (!cachedLocalRepo) {
    cachedLocalRepo = createLocalDevRepository();
  }
  return cachedLocalRepo;
}

// =========================================================================
// LOCAL NON-VERCEL DEV FALLBACK REPOSITORY (strictly when DATABASE_URL is unset locally)
// =========================================================================

interface LocalSessionRecord {
  tokenHash: string;
  staffId: string;
  createdAt: string;
  expiresAt: string;
}

interface LocalActionTokenRecord {
  tokenHash: string;
  kind: 'verify' | 'reset';
  staffId: string;
  expiresAt: string;
}

interface LocalPersistedState {
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
  sessions: LocalSessionRecord[];
  actionTokens: LocalActionTokenRecord[];
}

const CURRENT_CATALOG_VERSION = 2;
const LOCAL_DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_STORE_FILE = path.join(LOCAL_DATA_DIR, 'store.json');
const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

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

function createLocalSeedOrders(): Order[] {
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

function createLocalSeedReviews(): ProductReview[] {
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
  ];
}

function createLocalInitialState(): LocalPersistedState {
  return {
    catalogVersion: CURRENT_CATALOG_VERSION,
    productOverrides: {},
    customProducts: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    coupons: DEFAULT_COUPONS.map((c) => ({ ...c })),
    settings: { ...DEFAULT_SETTINGS },
    website: cloneDefaultWebsite(),
    orders: createLocalSeedOrders(),
    reviews: createLocalSeedReviews(),
    subscribers: [],
    staff: [],
    sessions: [],
    actionTokens: [],
  };
}

function createLocalDevRepository(): StoreRepository {
  let cachedState: LocalPersistedState | null = null;

  const saveState = (state: LocalPersistedState): void => {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    const tmpFile = `${LOCAL_STORE_FILE}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, LOCAL_STORE_FILE);
  };

  const loadState = (): LocalPersistedState => {
    if (cachedState) return cachedState;
    try {
      if (fs.existsSync(LOCAL_STORE_FILE)) {
        const raw = fs.readFileSync(LOCAL_STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as Partial<LocalPersistedState>;
        const initial = createLocalInitialState();
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
      console.warn('[db:local] Could not read local store.json, initializing fresh state:', err);
    }
    cachedState = createLocalInitialState();
    saveState(cachedState);
    return cachedState;
  };

  const mergedProductsSync = (includeArchived = false): Product[] => {
    const state = loadState();
    const defaults = DEFAULT_PRODUCTS.map((base) => {
      const override = state.productOverrides[base.slug];
      if (!override) return { ...base, hasOverride: false, isCustom: false };
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
  };

  const repo: StoreRepository = {
    async getMergedProducts(includeArchived = false) {
      return mergedProductsSync(includeArchived);
    },

    async getProductBySlug(slug: string, includeArchived = true) {
      return mergedProductsSync(includeArchived).find((p) => p.slug === slug);
    },

    async getCategories() {
      return loadState().categories.map((c) => ({ ...c }));
    },

    async getCoupons() {
      return loadState().coupons.map((c) => ({ ...c }));
    },

    async getSettings() {
      return { ...loadState().settings };
    },

    async updateSettings(next: Partial<StoreSettings>) {
      const state = loadState();
      state.settings = { ...state.settings, ...next };
      saveState(state);
      return { ...state.settings };
    },

    async getWebsiteContent() {
      return mergeWebsite(loadState().website);
    },

    async updateWebsiteContent(next: WebsiteContent) {
      const state = loadState();
      state.website = mergeWebsite(next);
      saveState(state);
      return mergeWebsite(state.website);
    },

    async resetWebsiteContent() {
      const state = loadState();
      state.website = cloneDefaultWebsite();
      saveState(state);
      return cloneDefaultWebsite();
    },

    async createCategory(input) {
      const state = loadState();
      const slug = slugify(input.slug || input.name);
      if (!slug) throw new Error('Category slug is invalid.');
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
    },

    async updateCategory(slug, input) {
      const state = loadState();
      const idx = state.categories.findIndex((c) => c.slug === slug);
      if (idx === -1) throw new Error('Category not found.');
      state.categories[idx] = {
        ...state.categories[idx],
        name: input.name.trim(),
        description: input.description.trim(),
      };
      saveState(state);
      return { ...state.categories[idx] };
    },

    async deleteCategory(slug) {
      const state = loadState();
      const idx = state.categories.findIndex((c) => c.slug === slug);
      if (idx === -1) throw new Error('Category not found.');
      const inUseCount = mergedProductsSync(true).filter((p) => p.category === slug).length;
      if (inUseCount > 0) {
        throw new Error(`Cannot delete category while ${inUseCount} product(s) still reference it.`);
      }
      state.categories.splice(idx, 1);
      saveState(state);
    },

    async createProduct(product) {
      const state = loadState();
      const existingSlugs = new Set(mergedProductsSync(true).map((p) => p.slug));
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
    },

    async updateProduct(slug, patch) {
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
      if (!base) throw new Error('Product not found.');
      state.productOverrides[slug] = {
        ...(state.productOverrides[slug] ?? {}),
        ...patch,
        updatedAt: now,
      };
      saveState(state);
      const merged = mergedProductsSync(true).find((p) => p.slug === slug);
      if (!merged) throw new Error('Product not found.');
      return merged;
    },

    async setProductArchived(slug, archived) {
      return repo.updateProduct(slug, { archived });
    },

    async resetOrDeleteProduct(slug) {
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
      if (!base) throw new Error('Product not found.');
      const removed = (state.productOverrides[slug]?.media ?? [])
        .map((m) => m.url)
        .filter((u) => u.startsWith('/uploads/'));
      delete state.productOverrides[slug];
      saveState(state);
      return { action: 'reset', removedMediaUrls: removed };
    },

    async createCoupon(coupon) {
      const state = loadState();
      const code = coupon.code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
        throw new Error('Coupon code must be 3–24 letters, numbers, dashes, or underscores.');
      }
      if (state.coupons.some((c) => c.code === code)) {
        throw new Error('Coupon code already exists.');
      }
      const created: Coupon = { ...coupon, code, isDefault: false };
      state.coupons.push(created);
      saveState(state);
      return { ...created };
    },

    async deleteCoupon(code) {
      const state = loadState();
      const upper = code.trim().toUpperCase();
      const idx = state.coupons.findIndex((c) => c.code === upper);
      if (idx === -1) throw new Error('Coupon not found.');
      state.coupons.splice(idx, 1);
      saveState(state);
    },

    async calculateDiscountAndShipping(params) {
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
    },

    async createOrder(input) {
      const state = loadState();
      const merged = mergedProductsSync(false);
      const productMap = new Map(merged.map((p) => [p.slug, p]));
      if (!input.items.length || input.items.length > 30) {
        throw new Error('Order must contain between 1 and 30 line items.');
      }
      const qtyBySlug = new Map<string, number>();
      for (const line of input.items) {
        const product = productMap.get(line.slug);
        if (!product) throw new Error(`Product "${line.slug}" is no longer available.`);
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
      const orderItems = input.items.map((line) => {
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
      const pricing = await repo.calculateDiscountAndShipping({
        subtotalInr,
        couponCode: input.couponCode,
      });
      if (pricing.couponError) throw new Error(pricing.couponError);

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

      let reference = '';
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = `THL-${Math.floor(10000 + Math.random() * 89999)}`;
        if (!state.orders.some((o) => o.reference === candidate)) {
          reference = candidate;
          break;
        }
      }
      if (!reference) reference = `THL-${Date.now().toString().slice(-6)}`;

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
    },

    async getOrders() {
      return loadState().orders.map((o) => ({ ...o }));
    },

    async getOrderByReference(reference) {
      const normalized = reference.trim().toUpperCase();
      return loadState().orders.find((o) => o.reference.toUpperCase() === normalized);
    },

    async updateOrderStatus(reference, status) {
      const state = loadState();
      const normalized = reference.trim().toUpperCase();
      const idx = state.orders.findIndex((o) => o.reference.toUpperCase() === normalized);
      if (idx === -1) throw new Error('Order not found.');
      state.orders[idx] = {
        ...state.orders[idx],
        status,
        updatedAt: new Date().toISOString(),
      };
      saveState(state);
      return { ...state.orders[idx] };
    },

    async getCustomers() {
      const orders = loadState().orders;
      const byEmail = new Map<string, CustomerSummary>();
      for (const order of orders) {
        const email = order.customer.email.trim().toLowerCase();
        const id = `cust_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
        const existing = byEmail.get(email);
        const spentDelta = order.status === 'cancelled' ? 0 : order.totalInr;
        if (!existing) {
          byEmail.set(email, {
            id,
            name: order.customer.name,
            email,
            phone: order.customer.phone,
            city: order.customer.city,
            state: order.customer.state,
            pincode: order.customer.pincode,
            orderCount: 1,
            totalSpentInr: spentDelta,
            lastOrderAt: order.createdAt,
            createdAt: order.createdAt,
          });
        } else {
          existing.orderCount += 1;
          existing.totalSpentInr += spentDelta;
          if (!existing.lastOrderAt || Date.parse(order.createdAt) > Date.parse(existing.lastOrderAt)) {
            existing.lastOrderAt = order.createdAt;
            existing.name = order.customer.name;
            existing.phone = order.customer.phone;
            existing.city = order.customer.city;
            existing.state = order.customer.state;
            existing.pincode = order.customer.pincode;
          }
          if (Date.parse(order.createdAt) < Date.parse(existing.createdAt)) {
            existing.createdAt = order.createdAt;
          }
        }
      }
      return Array.from(byEmail.values()).sort(
        (a, b) => Date.parse(b.lastOrderAt ?? b.createdAt) - Date.parse(a.lastOrderAt ?? a.createdAt)
      );
    },

    async hasAnyStaff() {
      return loadState().staff.length > 0;
    },

    async getAllStaff() {
      return loadState().staff.map(toPublicStaff);
    },

    async findStaffByEmail(email) {
      const lower = email.trim().toLowerCase();
      return loadState().staff.find((s) => s.email === lower);
    },

    async findStaffById(id) {
      return loadState().staff.find((s) => s.id === id);
    },

    async createFirstAdmin(input) {
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
    },

    async createStaffAccount(input) {
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
    },

    async deleteStaffAccount(id, actingStaffId) {
      const state = loadState();
      if (id === actingStaffId) {
        throw new Error('You cannot remove your own active account.');
      }
      const target = state.staff.find((s) => s.id === id);
      if (!target) throw new Error('Staff account not found.');
      if (target.role === 'admin' && state.staff.filter((s) => s.role === 'admin').length <= 1) {
        throw new Error('At least one administrator account must remain.');
      }
      state.staff = state.staff.filter((s) => s.id !== id);
      state.sessions = state.sessions.filter((s) => s.staffId !== id);
      state.actionTokens = state.actionTokens.filter((t) => t.staffId !== id);
      saveState(state);
    },

    async authenticateStaff(email, password) {
      const state = loadState();
      const lower = email.trim().toLowerCase();
      const staff = state.staff.find((s) => s.email === lower);
      if (!staff) return null;
      if (!verifyPassword(password, staff.passwordHash, staff.passwordSalt)) return null;
      return staff;
    },

    async createSession(staffId) {
      const state = loadState();
      const now = Date.now();
      state.sessions = state.sessions.filter((s) => Date.parse(s.expiresAt) > now);
      const rawToken = generateOpaqueToken(32);
      state.sessions.push({
        tokenHash: hashToken(rawToken),
        staffId,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      });
      const staff = state.staff.find((s) => s.id === staffId);
      if (staff) staff.lastLoginAt = new Date(now).toISOString();
      saveState(state);
      return rawToken;
    },

    async getStaffBySessionToken(rawToken) {
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
    },

    async revokeSession(rawToken) {
      const state = loadState();
      const hashed = hashToken(rawToken);
      const before = state.sessions.length;
      state.sessions = state.sessions.filter((s) => s.tokenHash !== hashed);
      if (state.sessions.length !== before) saveState(state);
    },

    async createActionToken(staffId, kind, ttlMs = 1000 * 60 * 60 * 24) {
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
    },

    async consumeVerificationToken(rawToken) {
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
    },

    async consumeResetToken(rawToken, newPassword) {
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
      state.sessions = state.sessions.filter((s) => s.staffId !== staffId);
      saveState(state);
      return staff;
    },

    async updateStaffPassword(staffId, currentPassword, newPassword) {
      const state = loadState();
      const staff = state.staff.find((s) => s.id === staffId);
      if (!staff) throw new Error('Staff account not found.');
      if (!verifyPassword(currentPassword, staff.passwordHash, staff.passwordSalt)) {
        throw new Error('Current password is incorrect.');
      }
      const { hash, salt } = hashPassword(newPassword);
      staff.passwordHash = hash;
      staff.passwordSalt = salt;
      saveState(state);
    },

    async getReviewsBySlug(slug) {
      return loadState()
        .reviews.filter((r) => r.slug === slug)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },

    async getAllReviews() {
      return [...loadState().reviews].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );
    },

    async getReviewStats() {
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
    },

    async createReview(input) {
      const state = loadState();
      const product = mergedProductsSync(false).find((p) => p.slug === input.slug);
      if (!product) throw new Error('Product not found.');
      let verifiedPurchase = false;
      if (input.orderReference && input.orderReference.trim()) {
        const ref = input.orderReference.trim().toUpperCase();
        verifiedPurchase = state.orders.some(
          (o) =>
            o.reference.toUpperCase() === ref &&
            o.status !== 'cancelled' &&
            o.items.some((item) => item.slug === input.slug)
        );
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
    },

    async deleteReview(id) {
      const state = loadState();
      const before = state.reviews.length;
      state.reviews = state.reviews.filter((r) => r.id !== id);
      if (state.reviews.length === before) throw new Error('Review not found.');
      saveState(state);
    },

    async addNewsletterSubscriber(email) {
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
    },

    async saveUploadedMedia(input: {
      filename: string;
      kind: MediaKind;
      mimeType: string;
      alt: string;
      data: Buffer;
    }) {
      if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
        fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
      }
      const dest = path.resolve(LOCAL_UPLOADS_DIR, input.filename);
      if (!dest.startsWith(LOCAL_UPLOADS_DIR + path.sep)) {
        throw new Error('Invalid upload path.');
      }
      fs.writeFileSync(dest, input.data);
    },

    async getUploadedMedia(filename: string): Promise<UploadedMediaRecord | null> {
      const dest = path.resolve(LOCAL_UPLOADS_DIR, filename);
      if (!dest.startsWith(LOCAL_UPLOADS_DIR + path.sep) || !fs.existsSync(dest)) {
        return null;
      }
      const ext = path.extname(filename).toLowerCase();
      const mimeMap: Record<string, { mime: string; kind: MediaKind }> = {
        '.jpg': { mime: 'image/jpeg', kind: 'image' },
        '.png': { mime: 'image/png', kind: 'image' },
        '.webp': { mime: 'image/webp', kind: 'image' },
        '.mp4': { mime: 'video/mp4', kind: 'video' },
        '.webm': { mime: 'video/webm', kind: 'video' },
      };
      const meta = mimeMap[ext] ?? { mime: 'application/octet-stream', kind: 'image' as MediaKind };
      const data = fs.readFileSync(dest);
      return {
        filename,
        kind: meta.kind,
        mimeType: meta.mime,
        alt: 'Uploaded studio media',
        data,
        createdAt: new Date().toISOString(),
      };
    },

    async deleteUploadedMedia(filename: string) {
      const dest = path.resolve(LOCAL_UPLOADS_DIR, filename);
      if (!dest.startsWith(LOCAL_UPLOADS_DIR + path.sep)) return;
      if (fs.existsSync(dest)) {
        try {
          fs.unlinkSync(dest);
        } catch {
          // ignore cleanup failure
        }
      }
    },
  };

  return repo;
}

// =========================================================================
// EXPORTED ASYNC FACADE FUNCTIONS
// =========================================================================

export const getMergedProducts = (includeArchived = false): Promise<Product[]> =>
  getActiveRepository().getMergedProducts(includeArchived);

export const getProductBySlug = (
  slug: string,
  includeArchived = true
): Promise<Product | undefined> => getActiveRepository().getProductBySlug(slug, includeArchived);

export const getCategories = (): Promise<Category[]> => getActiveRepository().getCategories();

export const getCoupons = (): Promise<Coupon[]> => getActiveRepository().getCoupons();

export const getSettings = (): Promise<StoreSettings> => getActiveRepository().getSettings();

export const updateSettings = (next: Partial<StoreSettings>): Promise<StoreSettings> =>
  getActiveRepository().updateSettings(next);

export const getWebsiteContent = (): Promise<WebsiteContent> =>
  getActiveRepository().getWebsiteContent();

export const updateWebsiteContent = (next: WebsiteContent): Promise<WebsiteContent> =>
  getActiveRepository().updateWebsiteContent(next);

export const resetWebsiteContent = (): Promise<WebsiteContent> =>
  getActiveRepository().resetWebsiteContent();

export const createCategory = (input: {
  name: string;
  slug?: string;
  description: string;
}): Promise<Category> => getActiveRepository().createCategory(input);

export const updateCategory = (
  slug: string,
  input: { name: string; description: string }
): Promise<Category> => getActiveRepository().updateCategory(slug, input);

export const deleteCategory = (slug: string): Promise<void> =>
  getActiveRepository().deleteCategory(slug);

export const createProduct = (product: Product): Promise<Product> =>
  getActiveRepository().createProduct(product);

export const updateProduct = (slug: string, patch: ProductOverride): Promise<Product> =>
  getActiveRepository().updateProduct(slug, patch);

export const setProductArchived = (slug: string, archived: boolean): Promise<Product> =>
  getActiveRepository().setProductArchived(slug, archived);

export const resetOrDeleteProduct = (
  slug: string
): Promise<{ action: 'deleted' | 'reset'; removedMediaUrls: string[] }> =>
  getActiveRepository().resetOrDeleteProduct(slug);

export const createCoupon = (coupon: Coupon): Promise<Coupon> =>
  getActiveRepository().createCoupon(coupon);

export const deleteCoupon = (code: string): Promise<void> =>
  getActiveRepository().deleteCoupon(code);

export const calculateDiscountAndShipping = (params: {
  subtotalInr: number;
  couponCode?: string | null;
}) => getActiveRepository().calculateDiscountAndShipping(params);

export const createOrder = (input: {
  customer: Order['customer'];
  paymentMethod: Order['paymentMethod'];
  items: Array<{ slug: string; quantity: number; selectedOptions?: Record<string, string> }>;
  couponCode?: string | null;
  note?: string;
}): Promise<Order> => getActiveRepository().createOrder(input);

export const getOrders = (): Promise<Order[]> => getActiveRepository().getOrders();

export const getOrderByReference = (reference: string): Promise<Order | undefined> =>
  getActiveRepository().getOrderByReference(reference);

export const updateOrderStatus = (reference: string, status: OrderStatus): Promise<Order> =>
  getActiveRepository().updateOrderStatus(reference, status);

export const getCustomers = (): Promise<CustomerSummary[]> => getActiveRepository().getCustomers();

export const hasAnyStaff = (): Promise<boolean> => getActiveRepository().hasAnyStaff();

export const getAllStaff = (): Promise<StaffMember[]> => getActiveRepository().getAllStaff();

export const findStaffByEmail = (email: string): Promise<StaffRecord | undefined> =>
  getActiveRepository().findStaffByEmail(email);

export const findStaffById = (id: string): Promise<StaffRecord | undefined> =>
  getActiveRepository().findStaffById(id);

export const createFirstAdmin = (input: {
  name: string;
  email: string;
  password: string;
}): Promise<StaffRecord> => getActiveRepository().createFirstAdmin(input);

export const createStaffAccount = (input: {
  name: string;
  email: string;
  role: StaffRole;
  password: string;
}): Promise<StaffRecord> => getActiveRepository().createStaffAccount(input);

export const deleteStaffAccount = (id: string, actingStaffId: string): Promise<void> =>
  getActiveRepository().deleteStaffAccount(id, actingStaffId);

export const authenticateStaff = (email: string, password: string): Promise<StaffRecord | null> =>
  getActiveRepository().authenticateStaff(email, password);

export const createSession = (staffId: string): Promise<string> =>
  getActiveRepository().createSession(staffId);

export const getStaffBySessionToken = (rawToken: string): Promise<StaffRecord | null> =>
  getActiveRepository().getStaffBySessionToken(rawToken);

export const revokeSession = (rawToken: string): Promise<void> =>
  getActiveRepository().revokeSession(rawToken);

export const createActionToken = (
  staffId: string,
  kind: 'verify' | 'reset',
  ttlMs?: number
): Promise<string> => getActiveRepository().createActionToken(staffId, kind, ttlMs);

export const consumeVerificationToken = (rawToken: string): Promise<StaffRecord | null> =>
  getActiveRepository().consumeVerificationToken(rawToken);

export const consumeResetToken = (
  rawToken: string,
  newPassword: string
): Promise<StaffRecord | null> => getActiveRepository().consumeResetToken(rawToken, newPassword);

export const updateStaffPassword = (
  staffId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => getActiveRepository().updateStaffPassword(staffId, currentPassword, newPassword);

export const getReviewsBySlug = (slug: string): Promise<ProductReview[]> =>
  getActiveRepository().getReviewsBySlug(slug);

export const getAllReviews = (): Promise<ProductReview[]> => getActiveRepository().getAllReviews();

export const getReviewStats = (): Promise<Record<string, ReviewSummary>> =>
  getActiveRepository().getReviewStats();

export const createReview = (input: {
  slug: string;
  authorName: string;
  rating: number;
  title: string;
  comment: string;
  orderReference?: string;
}): Promise<ProductReview> => getActiveRepository().createReview(input);

export const deleteReview = (id: string): Promise<void> => getActiveRepository().deleteReview(id);

export const addNewsletterSubscriber = (email: string): Promise<{ alreadySubscribed: boolean }> =>
  getActiveRepository().addNewsletterSubscriber(email);

export const saveUploadedMedia = (input: {
  filename: string;
  kind: MediaKind;
  mimeType: string;
  alt: string;
  data: Buffer;
}): Promise<void> => getActiveRepository().saveUploadedMedia(input);

export const getUploadedMedia = (filename: string): Promise<UploadedMediaRecord | null> =>
  getActiveRepository().getUploadedMedia(filename);

export const deleteUploadedMedia = (filename: string): Promise<void> =>
  getActiveRepository().deleteUploadedMedia(filename);

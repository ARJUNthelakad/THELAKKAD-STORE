import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_COUPONS,
  DEFAULT_PRODUCTS,
  DEFAULT_SETTINGS,
  DEFAULT_WEBSITE,
} from '../shared/catalog';
import type {
  CartItem,
  Category,
  Coupon,
  Product,
  ReviewSummary,
  StoreSettings,
  WebsiteContent,
} from '../shared/types';
import { fetchStore } from '../lib/api';

const WISHLIST_STORAGE_KEY = 'thelakkad_wishlist';
const RECENT_STORAGE_KEY = 'thelakkad_recent';

interface ToastMessage {
  id: number;
  text: string;
}

interface StoreContextValue {
  products: Product[];
  categories: Category[];
  coupons: Coupon[];
  settings: StoreSettings;
  website: WebsiteContent;
  reviewStats: Record<string, ReviewSummary>;
  loading: boolean;
  error: string | null;
  refreshStore: () => Promise<void>;
  cart: CartItem[];
  cartCount: number;
  cartSubtotal: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (product: Product, selectedOptions: Record<string, string>, quantity?: number) => void;
  updateCartQuantity: (key: string, quantity: number) => void;
  removeCartItem: (key: string) => void;
  clearCart: () => void;
  wishlistSlugs: string[];
  wishlistCount: number;
  isWishlisted: (slug: string) => boolean;
  toggleWishlist: (product: Product) => void;
  clearWishlist: () => void;
  recentSlugs: string[];
  recordProductView: (slug: string) => void;
  toast: ToastMessage | null;
  showToast: (text: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function readSlugList(storageKey: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, 40);
  } catch {
    return [];
  }
}

function writeSlugList(storageKey: string, slugs: string[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(slugs));
  } catch {
    // Ignore storage quota or privacy-mode errors
  }
}

function buildCartKey(slug: string, options: Record<string, string>): string {
  const entries = Object.entries(options)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
  return `${slug}::${entries}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [coupons, setCoupons] = useState<Coupon[]>(DEFAULT_COUPONS);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [website, setWebsite] = useState<WebsiteContent>(DEFAULT_WEBSITE);
  const [reviewStats, setReviewStats] = useState<Record<string, ReviewSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistSlugs, setWishlistSlugs] = useState<string[]>(() =>
    readSlugList(WISHLIST_STORAGE_KEY)
  );
  const [recentSlugs, setRecentSlugs] = useState<string[]>(() =>
    readSlugList(RECENT_STORAGE_KEY)
  );
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string) => {
    const id = Date.now();
    setToast({ id, text });
    window.setTimeout(() => {
      setToast((prev) => (prev && prev.id === id ? null : prev));
    }, 3200);
  }, []);

  const refreshStore = useCallback(async () => {
    try {
      const data = await fetchStore(false);
      setProducts(data.products);
      setCategories(data.categories);
      setCoupons(data.coupons);
      setSettings(data.settings);
      if (data.website) {
        setWebsite(data.website);
      }
      if (data.reviewStats) {
        setReviewStats(data.reviewStats);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load store catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStore();
  }, [refreshStore]);

  // Apply live theme palette & page title from website/settings
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--color-paper', website.theme.bgColor);
    root.style.setProperty('--color-paper-soft', website.theme.surfaceColor);
    root.style.setProperty('--color-ink', website.theme.inkColor);
    root.style.setProperty('--color-clay', website.theme.accentColor);
    document.body.style.backgroundColor = website.theme.bgColor;
    document.body.style.color = website.theme.inkColor;
    if (settings.storeName) {
      document.title = `${settings.storeName} — ${website.hero.headline}`;
    }
  }, [website, settings.storeName]);

  // Keep cart prices and stock ceilings synced with live store data
  useEffect(() => {
    const productMap = new Map(products.map((p) => [p.slug, p]));
    setCart((prev) =>
      prev
        .map((item) => {
          const live = productMap.get(item.slug);
          if (!live || live.stock <= 0) return null;
          return {
            ...item,
            title: live.title,
            priceInr: live.priceInr,
            maxStock: live.stock,
            quantity: Math.min(item.quantity, live.stock),
          };
        })
        .filter((x): x is CartItem => x !== null)
    );
  }, [products]);

  const addToCart = useCallback(
    (product: Product, selectedOptions: Record<string, string>, quantity = 1) => {
      if (product.stock <= 0) {
        showToast('This piece is currently sold out.');
        return;
      }
      const normalizedOptions: Record<string, string> = {};
      for (const opt of product.options) {
        normalizedOptions[opt.label] = selectedOptions[opt.label] || opt.values[0] || '';
      }
      const key = buildCartKey(product.slug, normalizedOptions);
      const primaryImage =
        product.media.find((m) => m.kind === 'image')?.url ?? product.media[0]?.url ?? '';

      setCart((prev) => {
        const existing = prev.find((item) => item.key === key);
        if (existing) {
          const nextQty = Math.min(product.stock, existing.quantity + quantity);
          return prev.map((item) =>
            item.key === key ? { ...item, quantity: nextQty, maxStock: product.stock } : item
          );
        }
        return [
          ...prev,
          {
            key,
            slug: product.slug,
            sku: product.sku,
            title: product.title,
            priceInr: product.priceInr,
            quantity: Math.min(product.stock, Math.max(1, quantity)),
            maxStock: product.stock,
            selectedOptions: normalizedOptions,
            imageUrl: primaryImage,
          },
        ];
      });
      setCartOpen(true);
      showToast(`Added ${product.title} to your bag.`);
    },
    [showToast]
  );

  const updateCartQuantity = useCallback((key: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return prev.filter((item) => item.key !== key);
      }
      return prev.map((item) =>
        item.key === key ? { ...item, quantity: Math.min(item.maxStock, quantity) } : item
      );
    });
  }, []);

  const removeCartItem = useCallback((key: string) => {
    setCart((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const isWishlisted = useCallback(
    (slug: string) => wishlistSlugs.includes(slug),
    [wishlistSlugs]
  );

  const toggleWishlist = useCallback(
    (product: Product) => {
      setWishlistSlugs((prev) => {
        const exists = prev.includes(product.slug);
        const next = exists
          ? prev.filter((s) => s !== product.slug)
          : [product.slug, ...prev].slice(0, 40);
        writeSlugList(WISHLIST_STORAGE_KEY, next);
        showToast(
          exists
            ? `Removed ${product.title} from saved items.`
            : `Saved ${product.title} to your wishlist.`
        );
        return next;
      });
    },
    [showToast]
  );

  const clearWishlist = useCallback(() => {
    setWishlistSlugs([]);
    writeSlugList(WISHLIST_STORAGE_KEY, []);
    showToast('Cleared all saved items.');
  }, [showToast]);

  const recordProductView = useCallback((slug: string) => {
    if (!slug) return;
    setRecentSlugs((prev) => {
      if (prev[0] === slug) return prev;
      const next = [slug, ...prev.filter((s) => s !== slug)].slice(0, 8);
      writeSlugList(RECENT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const wishlistCount = useMemo(() => {
    const activeSlugs = new Set(products.map((p) => p.slug));
    return wishlistSlugs.filter((s) => activeSlugs.has(s)).length;
  }, [products, wishlistSlugs]);

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.priceInr * item.quantity, 0),
    [cart]
  );

  return (
    <StoreContext.Provider
      value={{
        products,
        categories,
        coupons,
        settings,
        website,
        reviewStats,
        loading,
        error,
        refreshStore,
        cart,
        cartCount,
        cartSubtotal,
        cartOpen,
        setCartOpen,
        addToCart,
        updateCartQuantity,
        removeCartItem,
        clearCart,
        wishlistSlugs,
        wishlistCount,
        isWishlisted,
        toggleWishlist,
        clearWishlist,
        recentSlugs,
        recordProductView,
        toast,
        showToast,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used inside StoreProvider');
  }
  return ctx;
}

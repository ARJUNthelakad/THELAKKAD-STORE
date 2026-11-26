import React, { useMemo } from 'react';
import { ArrowLeft, Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatInr } from '../lib/format';
import { Link } from '../lib/router';
import { SafeImage } from '../components/SafeImage';
import { StarRow } from '../components/ProductReviews';
import type { Product } from '../shared/types';

export function WishlistPage() {
  const {
    products,
    categories,
    reviewStats,
    wishlistSlugs,
    toggleWishlist,
    clearWishlist,
    addToCart,
    recentSlugs,
  } = useStore();

  const categoryNameBySlug = useMemo(
    () => new Map(categories.map((c) => [c.slug, c.name])),
    [categories]
  );

  const savedProducts = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return wishlistSlugs
      .map((slug) => bySlug.get(slug))
      .filter((p): p is Product => Boolean(p));
  }, [products, wishlistSlugs]);

  const recentProducts = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const savedSet = new Set(wishlistSlugs);
    return recentSlugs
      .filter((slug) => !savedSet.has(slug))
      .map((slug) => bySlug.get(slug))
      .filter((p): p is Product => Boolean(p))
      .slice(0, 3);
  }, [products, recentSlugs, wishlistSlugs]);

  const handleMoveToBag = (product: Product) => {
    const defaultOpts: Record<string, string> = {};
    for (const opt of product.options) {
      if (opt.values[0]) defaultOpts[opt.label] = opt.values[0];
    }
    addToCart(product, defaultOpts, 1);
    toggleWishlist(product);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        to="/#collection"
        className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-[#78716c] transition-colors hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Continue Shopping
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-4 border-b border-[#ded5c8] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">Wishlist</p>
          <h1 className="mt-2 font-serif text-3xl font-normal text-[var(--color-ink)] sm:text-4xl">
            Saved Items{' '}
            <span className="font-mono text-xl text-[#78716c] tabular-nums">
              ({savedProducts.length})
            </span>
          </h1>
        </div>

        {savedProducts.length > 0 && (
          <button
            type="button"
            onClick={clearWishlist}
            className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium tracking-wider uppercase text-[#78716c] transition-colors hover:text-[#991b1b]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Saved
          </button>
        )}
      </div>

      {savedProducts.length === 0 ? (
        <div className="mt-12 border border-[#ded5c8] bg-[var(--color-paper-soft)] px-6 py-16 text-center">
          <Heart className="mx-auto h-7 w-7 text-[#c8beb0]" aria-hidden="true" />
          <h2 className="mt-4 font-serif text-2xl font-normal text-[var(--color-ink)]">
            Your wishlist is empty
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#57534e]">
            Tap the heart icon on any kitchen appliance, dress, or accessory to keep a shortlist for
            later comparison.
          </p>
          <Link
            to="/#collection"
            className="mt-6 inline-flex items-center gap-2 bg-[var(--color-ink)] px-6 py-3 text-xs font-medium tracking-wider uppercase text-[var(--color-paper)] transition-opacity hover:opacity-85"
          >
            Explore Collection
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {savedProducts.map((product) => {
            const primaryImage =
              product.media.find((m) => m.kind === 'image') ?? product.media[0];
            const categoryName = categoryNameBySlug.get(product.category) ?? product.category;
            const stats = reviewStats[product.slug];

            return (
              <article key={product.slug} className="group flex flex-col">
                <div className="relative">
                  <Link
                    to={`/product/${product.slug}`}
                    className="block aspect-[4/3] w-full overflow-hidden bg-[#ebe3d7]"
                  >
                    <SafeImage
                      src={primaryImage?.url ?? ''}
                      alt={primaryImage?.alt ?? product.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleWishlist(product)}
                    aria-label={`Remove ${product.title} from wishlist`}
                    className="absolute top-3 right-3 inline-flex h-9 w-9 cursor-pointer items-center justify-center bg-[var(--color-paper)]/90 text-[var(--color-clay)] transition-colors hover:bg-[var(--color-paper)]"
                  >
                    <Heart className="h-4 w-4 fill-current" />
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 text-xs text-[#78716c]">
                  <span>
                    {categoryName} ·{' '}
                    {product.stock === 0
                      ? 'Out of Stock'
                      : product.stock <= 4
                        ? `Only ${product.stock} left`
                        : 'In Stock'}
                  </span>
                  {stats && stats.count > 0 ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[var(--color-ink)] tabular-nums">
                      <StarRow rating={stats.average} size="xs" />
                      <span>{stats.average.toFixed(1)}</span>
                    </span>
                  ) : (
                    <span className="font-mono">{product.sku}</span>
                  )}
                </div>

                <div className="mt-1.5 flex items-baseline justify-between gap-4">
                  <Link
                    to={`/product/${product.slug}`}
                    className="font-serif text-xl leading-snug text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-clay)]"
                  >
                    {product.title}
                  </Link>
                  <span className="shrink-0 font-mono text-sm font-medium text-[var(--color-ink)] tabular-nums">
                    {formatInr(product.priceInr)}
                  </span>
                </div>

                <p className="mt-1.5 line-clamp-2 text-sm text-[#57534e]">{product.subtitle}</p>

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#ded5c8] pt-3">
                  <button
                    type="button"
                    onClick={() => toggleWishlist(product)}
                    className="cursor-pointer text-xs font-medium tracking-wider uppercase text-[#78716c] hover:text-[#991b1b]"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    disabled={product.stock <= 0}
                    onClick={() => handleMoveToBag(product)}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium tracking-wider uppercase text-[var(--color-ink)] underline decoration-[var(--color-ink)]/40 underline-offset-4 transition-colors hover:text-[var(--color-clay)] hover:decoration-[var(--color-clay)] disabled:cursor-not-allowed disabled:text-[#78716c] disabled:no-underline"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{product.stock <= 0 ? 'Out of Stock' : 'Move to Bag'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {recentProducts.length > 0 && (
        <section className="mt-20 border-t border-[#ded5c8] pt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-normal text-[var(--color-ink)]">
              Recently Viewed
            </h2>
            <Link
              to="/#collection"
              className="text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[var(--color-ink)]"
            >
              Browse All
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {recentProducts.map((item) => {
              const img = item.media.find((m) => m.kind === 'image') ?? item.media[0];
              return (
                <Link key={item.slug} to={`/product/${item.slug}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden bg-[#ebe3d7]">
                    <SafeImage
                      src={img?.url ?? ''}
                      alt={img?.alt ?? item.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-3">
                    <p className="font-serif text-lg text-[var(--color-ink)] group-hover:text-[var(--color-clay)]">
                      {item.title}
                    </p>
                    <span className="font-mono text-xs text-[#57534e] tabular-nums">
                      {formatInr(item.priceInr)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

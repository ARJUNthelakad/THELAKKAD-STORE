import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, Minus, Play, Plus, Ruler, ShieldCheck, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatInr, sanitizeMediaUrl } from '../lib/format';
import { Link } from '../lib/router';
import { SafeImage } from '../components/SafeImage';
import { ProductReviews, StarRow } from '../components/ProductReviews';
import type { Product } from '../shared/types';

function BuyingGuideModal({
  category,
  onClose,
}: {
  category: string;
  onClose: () => void;
}) {
  const isApparel = category === 'dresses' || category === 'fashion';
  const isAppliance = category === 'kitchen-appliances';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isApparel ? 'Apparel Size & Fit Guide' : 'Specifications & Care Guide'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl border border-[#ded5c8] bg-[var(--color-paper-soft)] p-6 text-[var(--color-ink)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#ded5c8] pb-4">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
              {isApparel ? 'Size & Fit Guide' : isAppliance ? 'Power & Warranty Guide' : 'Sizing & Care'}
            </p>
            <h2 className="mt-1 font-serif text-2xl font-normal">
              {isApparel
                ? 'Apparel Measurement Chart (Inches)'
                : isAppliance
                  ? 'Indian Voltage & Warranty Standards'
                  : 'Carry Dimensions & Leather Care'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="cursor-pointer p-1 text-[#57534e] hover:text-[var(--color-ink)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isApparel ? (
          <div className="mt-5">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[#ded5c8] text-[#78716c] uppercase">
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">Bust / Chest</th>
                    <th className="py-2 pr-4 font-medium">Waist</th>
                    <th className="py-2 font-medium">Hip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ded5c8] font-mono tabular-nums">
                  {[
                    ['XS', '32–33"', '25–26"', '35–36"'],
                    ['S', '34–35"', '27–28"', '37–38"'],
                    ['M', '36–37"', '29–30"', '39–40"'],
                    ['L', '38–40"', '31–33"', '41–43"'],
                    ['XL', '41–43"', '34–36"', '44–46"'],
                  ].map(([sz, b, w, h]) => (
                    <tr key={sz}>
                      <td className="py-2.5 pr-4 font-semibold">{sz}</td>
                      <td className="py-2.5 pr-4 text-[#57534e]">{b}</td>
                      <td className="py-2.5 pr-4 text-[#57534e]">{w}</td>
                      <td className="py-2.5 text-[#57534e]">{h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[#57534e]">
              Between sizes? For structured blazers and pleated satin dresses, we recommend sizing
              up for comfortable shoulder and waist movement. Easy 14-day size exchanges apply.
            </p>
          </div>
        ) : isAppliance ? (
          <div className="mt-5 space-y-3 text-sm text-[#57534e]">
            <p>
              <strong className="font-medium text-[var(--color-ink)]">Power &amp; Plug:</strong>{' '}
              All kitchen appliances are calibrated for Indian 220–240V / 50Hz mains with standard
              ISI-certified 3-pin plugs (no step-down transformer required).
            </p>
            <p>
              <strong className="font-medium text-[var(--color-ink)]">Warranty Coverage:</strong>{' '}
              Includes a 2-year comprehensive motor, heating element, and thermostat warranty with
              doorstep service coordination across major Indian cities.
            </p>
            <p>
              <strong className="font-medium text-[var(--color-ink)]">Safe Dispatch:</strong>{' '}
              Double-walled foam-cradled packaging with full transit damage replacement guarantee.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3 text-sm text-[#57534e]">
            <p>
              <strong className="font-medium text-[var(--color-ink)]">Laptop &amp; Carry Fit:</strong>{' '}
              Sized to accommodate everyday essentials including up to a 15-inch laptop sleeve,
              charger pouch, and water bottle without losing structure.
            </p>
            <p>
              <strong className="font-medium text-[var(--color-ink)]">Long-Term Care:</strong>{' '}
              Store inside the included cotton dust bag away from direct afternoon sunlight and
              condition full-grain leather twice a year with neutral beeswax balm.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductDetailPage({ slug }: { slug: string }) {
  const {
    products,
    categories,
    settings,
    reviewStats,
    addToCart,
    isWishlisted,
    toggleWishlist,
    recentSlugs,
    recordProductView,
  } = useStore();

  const product = useMemo(() => products.find((p) => p.slug === slug), [products, slug]);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setActiveMediaIdx(0);
    setQuantity(1);
    setGuideOpen(false);
    if (product) {
      recordProductView(product.slug);
      const defaults: Record<string, string> = {};
      for (const opt of product.options) {
        if (opt.values[0]) defaults[opt.label] = opt.values[0];
      }
      setSelectedOptions(defaults);
    }
  }, [product, recordProductView]);

  const recentlyViewed = useMemo(() => {
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    return recentSlugs
      .filter((s) => s !== slug)
      .map((s) => bySlug.get(s))
      .filter((p): p is Product => Boolean(p))
      .slice(0, 3);
  }, [products, recentSlugs, slug]);

  if (!product) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <p className="text-xs tracking-widest uppercase text-[#78716c]">Catalog</p>
        <h1 className="mt-3 font-serif text-3xl text-[var(--color-ink)]">Product not found</h1>
        <p className="mt-2 text-sm text-[#57534e]">
          This item may have sold out or been moved from the active catalog.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 border border-[var(--color-ink)] px-5 py-2.5 text-xs font-medium tracking-wider uppercase text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Store
        </Link>
      </main>
    );
  }

  const categoryName =
    categories.find((c) => c.slug === product.category)?.name ?? product.category;
  const activeMedia = product.media[activeMediaIdx] ?? product.media[0];
  const stats = reviewStats[product.slug];
  const saved = isWishlisted(product.slug);
  const isApparel = product.category === 'dresses' || product.category === 'fashion';
  const related = products.filter((p) => p.slug !== product.slug).slice(0, 3);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        to="/#collection"
        className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-[#78716c] transition-colors hover:text-[var(--color-ink)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Collection
      </Link>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-14">
        {/* Left: Sticky Media Gallery */}
        <div className="lg:col-span-7">
          <div className="lg:sticky lg:top-24">
            <div className="aspect-[4/3] w-full overflow-hidden bg-[#ebe3d7]">
              {activeMedia?.kind === 'video' ? (
                <video
                  key={activeMedia.url}
                  src={sanitizeMediaUrl(activeMedia.url)}
                  controls
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <SafeImage
                  src={activeMedia?.url ?? ''}
                  alt={activeMedia?.alt ?? product.title}
                  loading="eager"
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            {product.media.length > 1 && (
              <div className="mt-4 grid grid-cols-5 gap-3">
                {product.media.map((media, idx) => (
                  <button
                    key={media.id}
                    type="button"
                    onClick={() => setActiveMediaIdx(idx)}
                    aria-label={`View media ${idx + 1}`}
                    className={`relative aspect-[4/3] cursor-pointer overflow-hidden border transition-opacity ${
                      idx === activeMediaIdx
                        ? 'border-[var(--color-ink)] opacity-100'
                        : 'border-transparent opacity-65 hover:opacity-100'
                    }`}
                  >
                    {media.kind === 'video' ? (
                      <div className="flex h-full w-full items-center justify-center bg-[var(--color-ink)] text-[var(--color-paper)]">
                        <Play className="h-4 w-4" />
                      </div>
                    ) : (
                      <SafeImage
                        src={media.url}
                        alt={media.alt}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Contiguous Purchase Module */}
        <div className="lg:col-span-5">
          <p className="text-xs text-[#78716c]">
            {categoryName} · <span className="font-mono">{product.sku}</span>
            {product.editionNote ? ` · ${product.editionNote}` : ''}
          </p>

          <h1 className="mt-2 font-serif text-3xl font-normal text-[var(--color-ink)] sm:text-4xl">
            {product.title}
          </h1>
          <p className="mt-2 text-sm text-[#57534e]">{product.subtitle}</p>

          <div className="mt-3 flex items-center gap-3">
            {stats && stats.count > 0 ? (
              <a
                href="#reviews"
                className="inline-flex items-center gap-2 text-xs text-[#57534e] transition-colors hover:text-[var(--color-ink)]"
              >
                <StarRow rating={stats.average} size="sm" />
                <span className="font-mono font-medium text-[var(--color-ink)] tabular-nums">
                  {stats.average.toFixed(1)}
                </span>
                <span className="underline decoration-[#ded5c8] underline-offset-4">
                  {stats.count === 1 ? '1 review' : `${stats.count} reviews`}
                </span>
              </a>
            ) : (
              <a
                href="#reviews"
                className="text-xs text-[#78716c] underline decoration-[#ded5c8] underline-offset-4 hover:text-[var(--color-ink)]"
              >
                Be the first to review
              </a>
            )}
          </div>

          <div className="mt-5 flex items-baseline justify-between border-y border-[#ded5c8] py-4">
            <span className="font-mono text-2xl font-medium text-[var(--color-ink)] tabular-nums">
              {formatInr(product.priceInr)}
            </span>
            <span className="text-xs text-[#57534e] tabular-nums">
              {product.stock === 0
                ? 'Currently out of stock'
                : product.stock <= 4
                  ? `Only ${product.stock} left in stock`
                  : `${product.stock} available in stock`}
            </span>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-[#57534e]">{product.description}</p>

          {product.options.length > 0 && (
            <div className="mt-6 space-y-5">
              {product.options.map((opt, idx) => (
                <div key={opt.label}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      {opt.label}:{' '}
                      <span className="font-normal normal-case text-[var(--color-ink)]">
                        {selectedOptions[opt.label] || opt.values[0]}
                      </span>
                    </p>
                    {idx === 0 && (
                      <button
                        type="button"
                        onClick={() => setGuideOpen(true)}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs text-[#57534e] underline decoration-[#ded5c8] underline-offset-4 hover:text-[var(--color-ink)]"
                      >
                        {isApparel ? (
                          <Ruler className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>{isApparel ? 'Size Guide' : 'Specs & Warranty'}</span>
                      </button>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {opt.values.map((val) => {
                      const active = (selectedOptions[opt.label] || opt.values[0]) === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() =>
                            setSelectedOptions((prev) => ({ ...prev, [opt.label]: val }))
                          }
                          className={`cursor-pointer border px-3.5 py-2 text-xs transition-colors ${
                            active
                              ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-paper)]'
                              : 'border-[#ded5c8] bg-[var(--color-paper-soft)] text-[var(--color-ink)] hover:border-[var(--color-ink)]'
                          }`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 flex items-stretch gap-3">
            <div className="inline-flex items-center border border-[#ded5c8] bg-[var(--color-paper-soft)]">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="flex h-12 w-10 cursor-pointer items-center justify-center text-[var(--color-ink)] hover:bg-[#ebe3d7]"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center font-mono text-sm tabular-nums">{quantity}</span>
              <button
                type="button"
                disabled={quantity >= product.stock}
                onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                aria-label="Increase quantity"
                className="flex h-12 w-10 cursor-pointer items-center justify-center text-[var(--color-ink)] hover:bg-[#ebe3d7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              disabled={product.stock <= 0}
              onClick={() => addToCart(product, selectedOptions, quantity)}
              className="flex-1 cursor-pointer bg-[var(--color-ink)] px-6 text-xs font-medium tracking-wider uppercase text-[var(--color-paper)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {product.stock <= 0 ? 'Sold Out' : 'Add to Bag'}
            </button>

            <button
              type="button"
              onClick={() => toggleWishlist(product)}
              aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={saved}
              className={`inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center border transition-colors ${
                saved
                  ? 'border-[var(--color-clay)] bg-[var(--color-paper-soft)] text-[var(--color-clay)]'
                  : 'border-[#ded5c8] bg-[var(--color-paper-soft)] text-[var(--color-ink)] hover:border-[var(--color-ink)]'
              }`}
            >
              <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
            </button>
          </div>

          <dl className="mt-8 divide-y divide-[#ded5c8] border-y border-[#ded5c8] text-sm">
            {product.materials && (
              <div className="py-3.5">
                <dt className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Materials
                </dt>
                <dd className="mt-1 text-[var(--color-ink)]">{product.materials}</dd>
              </div>
            )}
            {product.dimensions && (
              <div className="py-3.5">
                <dt className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Dimensions
                </dt>
                <dd className="mt-1 text-[var(--color-ink)]">{product.dimensions}</dd>
              </div>
            )}
            {product.care && (
              <div className="py-3.5">
                <dt className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Care
                </dt>
                <dd className="mt-1 text-[var(--color-ink)]">{product.care}</dd>
              </div>
            )}
            <div className="py-3.5">
              <dt className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Dispatch &amp; Returns
              </dt>
              <dd className="mt-1 text-[#57534e]">
                {settings.dispatchWindow} · Free shipping over{' '}
                {formatInr(settings.freeShippingThresholdInr)}.
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Customer Reviews & Ratings */}
      <ProductReviews slug={product.slug} productTitle={product.title} />

      {/* Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <section className="mt-20 border-t border-[#ded5c8] pt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-normal text-[var(--color-ink)]">
              Recently Viewed
            </h2>
            <Link
              to="/wishlist"
              className="text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[var(--color-ink)]"
            >
              View Saved
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {recentlyViewed.map((item) => {
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

      {/* Related Products */}
      {related.length > 0 && (
        <section className="mt-20 border-t border-[#ded5c8] pt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-2xl font-normal text-[var(--color-ink)]">
              You May Also Like
            </h2>
            <Link
              to="/#collection"
              className="text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[var(--color-ink)]"
            >
              View All
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {related.map((item) => {
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

      {guideOpen && <BuyingGuideModal category={product.category} onClose={() => setGuideOpen(false)} />}
    </main>
  );
}

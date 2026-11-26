import React, { useMemo, useState } from 'react';
import { ArrowRight, Heart, Search, Star } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatInr } from '../lib/format';
import { Link } from '../lib/router';
import { SafeImage } from '../components/SafeImage';
import type { Product } from '../shared/types';

type CatalogSort = 'featured' | 'price-asc' | 'price-desc' | 'rating';

export function HomePage() {
  const {
    products,
    categories,
    settings,
    website,
    reviewStats,
    loading,
    addToCart,
    isWishlisted,
    toggleWishlist,
  } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<CatalogSort>('featured');
  const [inStockOnly, setInStockOnly] = useState(false);

  const categoryNameBySlug = useMemo(
    () => new Map(categories.map((c) => [c.slug, c.name])),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (inStockOnly && p.stock <= 0) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.materials.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (categoryNameBySlug.get(p.category) ?? p.category).toLowerCase().includes(q)
      );
    });

    if (sortBy === 'price-asc') {
      return [...list].sort((a, b) => a.priceInr - b.priceInr);
    }
    if (sortBy === 'price-desc') {
      return [...list].sort((a, b) => b.priceInr - a.priceInr);
    }
    if (sortBy === 'rating') {
      return [...list].sort((a, b) => {
        const ra = reviewStats[a.slug]?.average ?? 0;
        const rb = reviewStats[b.slug]?.average ?? 0;
        if (rb !== ra) return rb - ra;
        return (reviewStats[b.slug]?.count ?? 0) - (reviewStats[a.slug]?.count ?? 0);
      });
    }
    return list;
  }, [products, selectedCategory, inStockOnly, query, sortBy, reviewStats, categoryNameBySlug]);

  // Group filtered products into distinct department sections preserving category order
  const departmentSections = useMemo(() => {
    const sections: Array<{
      slug: string;
      name: string;
      description: string;
      items: Product[];
    }> = [];

    const byCategory = new Map<string, Product[]>();
    for (const p of filteredProducts) {
      const arr = byCategory.get(p.category) ?? [];
      arr.push(p);
      byCategory.set(p.category, arr);
    }

    const handled = new Set<string>();
    for (const cat of categories) {
      if (selectedCategory !== 'all' && selectedCategory !== cat.slug) continue;
      const items = byCategory.get(cat.slug) ?? [];
      if (items.length > 0) {
        sections.push({
          slug: cat.slug,
          name: cat.name,
          description: cat.description,
          items,
        });
      }
      handled.add(cat.slug);
    }

    // Include any uncategorized / newly added category slugs safely
    for (const [slug, items] of byCategory.entries()) {
      if (!handled.has(slug) && items.length > 0) {
        sections.push({
          slug,
          name: slug.replace(/-/g, ' '),
          description: '',
          items,
        });
      }
    }

    return sections;
  }, [categories, filteredProducts, selectedCategory]);

  const renderProductCard = (product: Product) => {
    const primaryImage = product.media.find((m) => m.kind === 'image') ?? product.media[0];
    const categoryName = categoryNameBySlug.get(product.category) ?? product.category;
    const stats = reviewStats[product.slug];
    const saved = isWishlisted(product.slug);
    const defaultOpts: Record<string, string> = {};
    for (const opt of product.options) {
      if (opt.values[0]) defaultOpts[opt.label] = opt.values[0];
    }

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
            aria-label={
              saved
                ? `Remove ${product.title} from saved items`
                : `Save ${product.title} to wishlist`
            }
            aria-pressed={saved}
            className={`absolute top-3 right-3 inline-flex h-9 w-9 cursor-pointer items-center justify-center bg-[var(--color-paper)]/90 transition-colors hover:bg-[var(--color-paper)] ${
              saved ? 'text-[var(--color-clay)]' : 'text-[#57534e] hover:text-[var(--color-ink)]'
            }`}
          >
            <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
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
              <Star
                className="h-3 w-3 fill-[var(--color-clay)] text-[var(--color-clay)]"
                aria-hidden="true"
              />
              <span>{stats.average.toFixed(1)}</span>
              <span className="text-[#78716c]">({stats.count})</span>
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

        <div className="mt-4 flex items-center justify-between border-t border-[#ded5c8] pt-3">
          <Link
            to={`/product/${product.slug}`}
            className="text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[var(--color-ink)]"
          >
            View Details
          </Link>
          <button
            type="button"
            disabled={product.stock <= 0}
            onClick={() => addToCart(product, defaultOpts, 1)}
            className="cursor-pointer text-xs font-medium tracking-wider uppercase text-[var(--color-ink)] underline decoration-[var(--color-ink)]/40 underline-offset-4 transition-colors hover:text-[var(--color-clay)] hover:decoration-[var(--color-clay)] disabled:cursor-not-allowed disabled:text-[#78716c] disabled:no-underline"
          >
            {product.stock <= 0 ? 'Out of Stock' : '+ Add to Bag'}
          </button>
        </div>
      </article>
    );
  };

  return (
    <main>
      {/* Section 1: Editorial Hero */}
      {website.hero.visible && (
        <section className="border-b border-[#ded5c8]">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="lg:col-span-5">
                {website.hero.eyebrow && (
                  <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
                    {website.hero.eyebrow}
                  </p>
                )}
                <h1 className="mt-4 font-serif text-4xl leading-[1.08] font-normal tracking-tight text-[var(--color-ink)] sm:text-5xl lg:text-[3.5rem]">
                  {website.hero.headline}
                </h1>
                {website.hero.subheadline && (
                  <p className="mt-5 max-w-md text-base leading-relaxed text-[#57534e]">
                    {website.hero.subheadline}
                  </p>
                )}
                <div className="mt-8 flex items-center gap-6">
                  <a
                    href="#collection"
                    className="inline-flex items-center gap-2.5 bg-[var(--color-ink)] px-6 py-3.5 text-xs font-medium tracking-wider uppercase text-[var(--color-paper)] transition-opacity hover:opacity-85"
                  >
                    <span>{website.hero.primaryCtaLabel}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  {website.hero.secondaryCtaLabel && (
                    <Link
                      to="/orders"
                      className="text-xs font-medium tracking-wider uppercase text-[#57534e] underline decoration-[#ded5c8] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:decoration-[var(--color-ink)]"
                    >
                      {website.hero.secondaryCtaLabel}
                    </Link>
                  )}
                </div>
                {website.showAnnouncement && settings.announcement && (
                  <p className="mt-8 border-t border-[#ded5c8] pt-4 text-xs text-[#78716c]">
                    {settings.announcement}
                  </p>
                )}
              </div>

              <div className="lg:col-span-7">
                <div className="aspect-[16/10] w-full overflow-hidden bg-[#ebe3d7]">
                  <SafeImage
                    src={website.hero.imageUrl}
                    alt={website.hero.imageAlt}
                    loading="eager"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Section 2: Department Navigation & Search Controls */}
      <section id="collection" className="border-b border-[#ded5c8] bg-[var(--color-paper)]">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              {website.collection.eyebrow && (
                <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
                  {website.collection.eyebrow}
                </p>
              )}
              <h2 className="mt-2 font-serif text-3xl font-normal text-[var(--color-ink)] sm:text-4xl">
                {website.collection.heading}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {website.collection.showSearch && (
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#78716c]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={website.collection.searchPlaceholder}
                    aria-label="Search store catalog"
                    className="w-full border border-[#ded5c8] bg-[var(--color-paper-soft)] py-2 pr-3 pl-9 text-sm text-[var(--color-ink)] placeholder:text-[#78716c] focus:border-[var(--color-ink)] focus:outline-none sm:w-56"
                  />
                </div>
              )}

              <select
                aria-label="Sort products"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CatalogSort)}
                className="border border-[#ded5c8] bg-[var(--color-paper-soft)] px-3 py-2 text-xs text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
              >
                <option value="featured">Sort: Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="rating">Top Rated</option>
              </select>

              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#57534e]">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                  className="accent-[var(--color-ink)]"
                />
                <span>In stock only</span>
              </label>
            </div>
          </div>

          {website.collection.showCategoryTabs && (
            <div
              role="tablist"
              aria-label="Browse by department"
              className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-2.5 border-t border-[#ded5c8] pt-5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedCategory === 'all'}
                onClick={() => setSelectedCategory('all')}
                className={`cursor-pointer border-b pb-1.5 text-sm transition-colors ${
                  selectedCategory === 'all'
                    ? 'border-[var(--color-ink)] font-medium text-[var(--color-ink)]'
                    : 'border-transparent text-[#78716c] hover:text-[var(--color-ink)]'
                }`}
              >
                All Departments <span className="tabular-nums">({products.length})</span>
              </button>
              {categories.map((cat) => {
                const count = products.filter((p) => p.category === cat.slug).length;
                return (
                  <button
                    key={cat.slug}
                    type="button"
                    role="tab"
                    aria-selected={selectedCategory === cat.slug}
                    onClick={() => setSelectedCategory(cat.slug)}
                    className={`cursor-pointer border-b pb-1.5 text-sm transition-colors ${
                      selectedCategory === cat.slug
                        ? 'border-[var(--color-ink)] font-medium text-[var(--color-ink)]'
                        : 'border-transparent text-[#78716c] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    {cat.name} <span className="tabular-nums">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Separate Department Sections (Kitchen Appliances, Dresses, Fashion & Tailoring, Bags & Accessories, etc.) */}
      {loading && products.length === 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="animate-pulse">
                <div className="aspect-[4/3] bg-[#ebe3d7]" />
                <div className="mt-4 h-4 w-1/3 bg-[#ebe3d7]" />
                <div className="mt-2 h-6 w-3/4 bg-[#ebe3d7]" />
              </div>
            ))}
          </div>
        </section>
      ) : departmentSections.length === 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="border border-[#ded5c8] bg-[var(--color-paper-soft)] px-6 py-12 text-center">
            <p className="font-serif text-xl text-[var(--color-ink)]">No matching items found</p>
            <p className="mt-2 text-sm text-[#57534e]">
              Try clearing your search or switching back to all departments.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setQuery('');
                setInStockOnly(false);
                setSortBy('featured');
              }}
              className="mt-5 cursor-pointer border border-[var(--color-ink)] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[var(--color-ink)] hover:bg-[var(--color-ink)] hover:text-[var(--color-paper)]"
            >
              Show All Departments
            </button>
          </div>
        </section>
      ) : (
        departmentSections.map((dept, index) => {
          const isAlternatingSurface = index % 2 === 1;
          const deptNumber = String(index + 1).padStart(2, '0');
          const gridColsClass =
            dept.items.length === 2
              ? 'sm:grid-cols-2 lg:grid-cols-2'
              : 'sm:grid-cols-2 lg:grid-cols-3';

          return (
            <section
              key={dept.slug}
              id={`section-${dept.slug}`}
              className={`border-b border-[#ded5c8] ${
                isAlternatingSurface
                  ? 'bg-[var(--color-paper-soft)]'
                  : 'bg-[var(--color-paper)]'
              }`}
            >
              <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
                <div className="flex flex-col justify-between gap-4 border-b border-[#ded5c8] pb-6 md:flex-row md:items-end">
                  <div className="max-w-2xl">
                    <p className="font-mono text-xs tracking-[0.18em] uppercase text-[#78716c] tabular-nums">
                      {deptNumber} · Department · {dept.items.length}{' '}
                      {dept.items.length === 1 ? 'Item' : 'Items'}
                    </p>
                    <h3 className="mt-2 font-serif text-3xl font-normal text-[var(--color-ink)] sm:text-[2.125rem]">
                      {dept.name}
                    </h3>
                    {dept.description && (
                      <p className="mt-2 text-sm leading-relaxed text-[#57534e]">
                        {dept.description}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    {selectedCategory === 'all' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory(dept.slug);
                          const el = document.getElementById('collection');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium tracking-wider uppercase text-[var(--color-ink)] underline decoration-[#ded5c8] underline-offset-4 transition-colors hover:text-[var(--color-clay)] hover:decoration-[var(--color-clay)]"
                      >
                        <span>Only {dept.name}</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedCategory('all')}
                        className="cursor-pointer text-xs font-medium tracking-wider uppercase text-[#57534e] underline decoration-[#ded5c8] underline-offset-4 transition-colors hover:text-[var(--color-ink)]"
                      >
                        View All Departments
                      </button>
                    )}
                  </div>
                </div>

                <div className={`mt-10 grid grid-cols-1 gap-x-8 gap-y-12 ${gridColsClass}`}>
                  {dept.items.map(renderProductCard)}
                </div>
              </div>
            </section>
          );
        })
      )}

      {/* Brand Story & Standards */}
      {website.about.visible && (
        <section id="about" className="bg-[var(--color-paper-soft)]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
              <div className="lg:col-span-6">
                <div className="aspect-[4/3] w-full overflow-hidden bg-[#ebe3d7]">
                  <SafeImage
                    src={website.about.imageUrl}
                    alt={website.about.imageAlt}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              <div className="lg:col-span-6">
                {website.about.eyebrow && (
                  <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
                    {website.about.eyebrow}
                  </p>
                )}
                <h2 className="mt-3 font-serif text-3xl font-normal text-[var(--color-ink)] sm:text-4xl">
                  {website.about.heading}
                </h2>
                {website.about.body && (
                  <p className="mt-5 text-sm leading-relaxed text-[#57534e] sm:text-base">
                    {website.about.body}
                  </p>
                )}

                {website.about.highlights.length > 0 && (
                  <dl className="mt-8 grid grid-cols-1 gap-6 border-t border-[#ded5c8] pt-6 sm:grid-cols-3">
                    {website.about.highlights.map((item, idx) => (
                      <div key={idx}>
                        <dt className="font-mono text-xs tracking-wider uppercase text-[#78716c]">
                          {item.title}
                        </dt>
                        <dd className="mt-1.5 text-sm text-[var(--color-ink)]">
                          {item.description}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

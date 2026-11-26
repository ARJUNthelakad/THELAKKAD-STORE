import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Star } from 'lucide-react';
import { fetchProductReviews, submitProductReview } from '../lib/api';
import { formatShortDate } from '../lib/format';
import { useStore } from '../context/StoreContext';
import type { ProductReview } from '../shared/types';

type SortOption = 'newest' | 'highest' | 'lowest';

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

export function StarRow({
  rating,
  size = 'sm',
}: {
  rating: number;
  size?: 'xs' | 'sm' | 'md';
}) {
  const sizeClass =
    size === 'xs' ? 'h-3 w-3' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const rounded = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${sizeClass} ${
            star <= rounded
              ? 'fill-[var(--color-clay)] text-[var(--color-clay)]'
              : 'fill-transparent text-[#c8beb0]'
          }`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function ProductReviews({
  slug,
  productTitle,
}: {
  slug: string;
  productTitle: string;
}) {
  const { refreshStore, showToast } = useStore();
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [distribution, setDistribution] = useState<Record<number, number>>({
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortOption>('newest');

  // Form state
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProductReviews(slug);
      setReviews(data.reviews);
      setAverage(data.average);
      setCount(data.count);
      setDistribution(data.distribution);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    setError(null);
    setSubmittedNotice(null);
    void loadReviews();
  }, [loadReviews]);

  const sortedReviews = useMemo(() => {
    const list = [...reviews];
    if (sort === 'highest') {
      list.sort((a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt));
    } else if (sort === 'lowest') {
      list.sort((a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt));
    } else {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return list;
  }, [reviews, sort]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmittedNotice(null);
    setSubmitting(true);

    try {
      const res = await submitProductReview(slug, {
        authorName: authorName.trim(),
        rating,
        title: title.trim(),
        comment: comment.trim(),
        orderReference: orderReference.trim() || undefined,
      });
      setAuthorName('');
      setTitle('');
      setComment('');
      setOrderReference('');
      setRating(5);
      setSubmittedNotice(
        res.review.verifiedPurchase
          ? 'Thank you — your verified purchase review is now live.'
          : 'Thank you — your review is now live.'
      );
      showToast('Review published.');
      await Promise.all([loadReviews(), refreshStore()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit review right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoverRating ?? rating;

  return (
    <section id="reviews" className="mt-20 border-t border-[#ded5c8] pt-14">
      <div className="flex flex-col justify-between gap-4 border-b border-[#ded5c8] pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
            Customer Reviews
          </p>
          <h2 className="mt-2 font-serif text-3xl font-normal text-[var(--color-ink)]">
            Ratings &amp; Impressions
          </h2>
        </div>

        {count > 0 && (
          <div className="flex items-center gap-3">
            <label
              htmlFor="review-sort"
              className="text-xs font-medium tracking-wider uppercase text-[#78716c]"
            >
              Sort
            </label>
            <select
              id="review-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="border border-[#ded5c8] bg-[var(--color-paper-soft)] px-3 py-1.5 text-xs text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
            >
              <option value="newest">Most Recent</option>
              <option value="highest">Highest Rated</option>
              <option value="lowest">Lowest Rated</option>
            </select>
          </div>
        )}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-12">
        {/* Left Column: Summary + Write a Review Form */}
        <div className="space-y-8 lg:col-span-5">
          <div className="border border-[#ded5c8] bg-[var(--color-paper-soft)] p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="font-mono text-4xl font-medium text-[var(--color-ink)] tabular-nums">
                  {count > 0 ? average.toFixed(1) : '—'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <StarRow rating={average} size="md" />
                  <span className="text-xs text-[#57534e] tabular-nums">
                    {count === 0
                      ? 'No reviews yet'
                      : count === 1
                        ? '1 review'
                        : `${count} reviews`}
                  </span>
                </div>
              </div>
              {count > 0 && (
                <p className="text-right text-xs text-[#78716c]">
                  Based on customer
                  <br />
                  feedback
                </p>
              )}
            </div>

            <div className="mt-6 space-y-2 border-t border-[#ded5c8] pt-5">
              {[5, 4, 3, 2, 1].map((star) => {
                const bucket = distribution[star] ?? 0;
                const pct = count > 0 ? Math.round((bucket / count) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-3 text-xs">
                    <span className="w-11 shrink-0 font-mono text-[#57534e] tabular-nums">
                      {star} star
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden bg-[#ebe3d7]">
                      <div
                        className="h-full bg-[var(--color-clay)] transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-7 shrink-0 text-right font-mono text-[#78716c] tabular-nums">
                      {bucket}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 border border-[#ded5c8] bg-[var(--color-paper-soft)] p-6"
          >
            <div>
              <h3 className="font-serif text-xl font-normal text-[var(--color-ink)]">
                Write a Review
              </h3>
              <p className="mt-1 text-xs text-[#57534e]">
                Share your experience with {productTitle}.
              </p>
            </div>

            {error && (
              <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-3.5 py-2.5 text-xs text-[#991b1b]">
                {error}
              </div>
            )}

            {submittedNotice && (
              <div className="flex items-center gap-2 border border-[#2e4a3d]/35 bg-[var(--color-paper)] px-3.5 py-2.5 text-xs text-[#2e4a3d]">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{submittedNotice}</span>
              </div>
            )}

            <div>
              <span className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Your Rating
              </span>
              <div
                className="mt-2 flex items-center gap-1"
                onMouseLeave={() => setHoverRating(null)}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = star <= displayRating;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      aria-label={`Rate ${star} out of 5 stars`}
                      aria-pressed={rating === star}
                      className="cursor-pointer p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-5 w-5 transition-colors ${
                          active
                            ? 'fill-[var(--color-clay)] text-[var(--color-clay)]'
                            : 'fill-transparent text-[#c8beb0]'
                        }`}
                      />
                    </button>
                  );
                })}
                <span className="ml-2 text-xs text-[#57534e]">
                  {displayRating}/5 · {RATING_LABELS[displayRating]}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="review-author"
                className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
              >
                Your Name
              </label>
              <input
                id="review-author"
                required
                minLength={2}
                maxLength={60}
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Priya Nair"
                className="mt-1.5 w-full border border-[#ded5c8] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[#78716c] focus:border-[var(--color-ink)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="review-title"
                className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
              >
                Headline (Optional)
              </label>
              <input
                id="review-title"
                maxLength={100}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Great build quality and everyday ease"
                className="mt-1.5 w-full border border-[#ded5c8] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[#78716c] focus:border-[var(--color-ink)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="review-comment"
                className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
              >
                Written Review
              </label>
              <textarea
                id="review-comment"
                required
                rows={4}
                minLength={5}
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell other shoppers about fit, finish, performance, or daily use…"
                className="mt-1.5 w-full border border-[#ded5c8] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[#78716c] focus:border-[var(--color-ink)] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="review-order-ref"
                className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
              >
                Order Reference (Optional — verifies purchase)
              </label>
              <input
                id="review-order-ref"
                maxLength={32}
                type="text"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
                placeholder="THL-2026-1042"
                className="mt-1.5 w-full border border-[#ded5c8] bg-[var(--color-paper)] px-3 py-2 font-mono text-xs text-[var(--color-ink)] placeholder:text-[#78716c] focus:border-[var(--color-ink)] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full cursor-pointer bg-[var(--color-ink)] py-3 text-xs font-medium tracking-wider uppercase text-[var(--color-paper)] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {submitting ? 'Publishing Review…' : 'Submit Review'}
            </button>
          </form>
        </div>

        {/* Right Column: Review Feed */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="space-y-6">
              {[1, 2].map((n) => (
                <div key={n} className="animate-pulse border-b border-[#ded5c8] pb-6">
                  <div className="h-4 w-32 bg-[#ebe3d7]" />
                  <div className="mt-3 h-5 w-1/2 bg-[#ebe3d7]" />
                  <div className="mt-2 h-14 w-full bg-[#ebe3d7]" />
                </div>
              ))}
            </div>
          ) : sortedReviews.length === 0 ? (
            <div className="border border-[#ded5c8] bg-[var(--color-paper-soft)] px-6 py-12 text-center">
              <p className="font-serif text-xl text-[var(--color-ink)]">Be the first to review</p>
              <p className="mt-2 text-sm text-[#57534e]">
                No customer impressions have been shared for this item yet. Use the form beside this
                panel to leave the first rating and note.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#ded5c8]">
              {sortedReviews.map((rev) => (
                <article key={rev.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <StarRow rating={rev.rating} size="sm" />
                      <span className="text-sm font-medium text-[var(--color-ink)]">
                        {rev.authorName}
                      </span>
                    </div>
                    <p className="text-xs text-[#78716c]">
                      {rev.verifiedPurchase && (
                        <span className="text-[#2e4a3d]">Verified Purchase · </span>
                      )}
                      <span>{formatShortDate(rev.createdAt)}</span>
                    </p>
                  </div>

                  {rev.title && (
                    <h4 className="mt-2.5 font-serif text-lg font-normal text-[var(--color-ink)]">
                      {rev.title}
                    </h4>
                  )}
                  <p className="mt-2 text-sm leading-relaxed text-[#57534e]">{rev.comment}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

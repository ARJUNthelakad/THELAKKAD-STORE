import React, { useState } from 'react';
import { Link } from '../lib/router';
import { useStore } from '../context/StoreContext';
import { subscribeNewsletter } from '../lib/api';

export function Footer() {
  const { categories, settings, website } = useStore();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const res = await subscribeNewsletter(email.trim());
      setEmail('');
      setFeedback({ kind: 'ok', text: res.message });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Unable to subscribe right now.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <footer className="border-t border-[#ded5c8] bg-[var(--color-paper)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <p className="font-serif text-2xl font-medium text-[var(--color-ink)]">
              {settings.storeName}
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#57534e]">
              {settings.tagline}
            </p>
            <p className="mt-4 text-xs leading-relaxed text-[#78716c]">{settings.studioAddress}</p>

            <form onSubmit={handleSubscribe} className="mt-6 max-w-sm">
              <label
                htmlFor="footer-newsletter"
                className="block text-xs font-medium tracking-widest uppercase text-[#78716c]"
              >
                New Drops &amp; Restock Alerts
              </label>
              <div className="mt-2.5 flex items-stretch gap-2">
                <input
                  id="footer-newsletter"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="min-w-0 flex-1 border border-[#ded5c8] bg-[var(--color-paper-soft)] px-3 py-2 text-xs text-[var(--color-ink)] placeholder:text-[#78716c] focus:border-[var(--color-ink)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="shrink-0 cursor-pointer bg-[var(--color-ink)] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[var(--color-paper)] transition-opacity hover:opacity-85 disabled:opacity-55"
                >
                  {submitting ? 'Joining…' : 'Join'}
                </button>
              </div>
              {feedback && (
                <p
                  className={`mt-2 text-xs ${
                    feedback.kind === 'err' ? 'text-[#991b1b]' : 'text-[#2e4a3d]'
                  }`}
                >
                  {feedback.text}
                </p>
              )}
            </form>
          </div>

          <div className="md:col-span-3">
            <p className="text-xs font-medium tracking-widest uppercase text-[#78716c]">
              Departments
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[#57534e]">
              {categories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    to={`/#section-${cat.slug}`}
                    className="hover:text-[var(--color-ink)]"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <p className="text-xs font-medium tracking-widest uppercase text-[#78716c]">
              {website.footer.linksHeading}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[#57534e]">
              <li>
                <Link to="/#collection" className="hover:text-[var(--color-ink)]">
                  {website.header.shopLabel}
                </Link>
              </li>
              {website.about.visible && (
                <li>
                  <Link to="/#about" className="hover:text-[var(--color-ink)]">
                    {website.header.aboutLabel}
                  </Link>
                </li>
              )}
              <li>
                <Link to="/wishlist" className="hover:text-[var(--color-ink)]">
                  Saved Items
                </Link>
              </li>
              <li>
                <Link to="/orders" className="hover:text-[var(--color-ink)]">
                  {website.header.trackLabel}
                </Link>
              </li>
              <li>
                <Link to="/admin" className="hover:text-[var(--color-ink)]">
                  Staff Dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-3">
            <p className="text-xs font-medium tracking-widest uppercase text-[#78716c]">
              {website.footer.shippingHeading}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[#57534e]">{settings.dispatchWindow}</p>
            <p className="mt-4 text-sm text-[var(--color-ink)]">{settings.supportEmail}</p>
            <p className="mt-1 font-mono text-xs text-[#78716c] tabular-nums">
              {settings.supportPhone}
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-[#ded5c8] pt-6 text-xs text-[#78716c] sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} {settings.storeName}
            {website.footer.copyrightNote ? `. ${website.footer.copyrightNote}` : ''}
          </p>
          {website.footer.showFreeShippingNote && (
            <p className="tabular-nums">
              Complimentary shipping above ₹{settings.freeShippingThresholdInr.toLocaleString('en-IN')}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

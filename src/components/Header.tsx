import React, { useState } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';
import { Link, useRouter } from '../lib/router';
import { useStore } from '../context/StoreContext';

export function Header() {
  const { pathname } = useRouter();
  const { settings, website, cartCount, wishlistCount, setCartOpen } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: website.header.shopLabel, to: '/#collection', active: pathname === '/' },
    ...(website.about.visible
      ? [{ label: website.header.aboutLabel, to: '/#about', active: false }]
      : []),
    {
      label: wishlistCount > 0 ? `Saved (${wishlistCount})` : 'Saved',
      to: '/wishlist',
      active: pathname.startsWith('/wishlist'),
    },
    {
      label: website.header.trackLabel,
      to: '/orders',
      active: pathname.startsWith('/orders'),
    },
    { label: 'Admin', to: '/admin', active: pathname.startsWith('/admin') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#ded5c8] bg-[var(--color-paper)]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="whitespace-nowrap shrink-0 font-serif text-2xl font-medium tracking-tight text-[var(--color-ink)] transition-opacity hover:opacity-75"
        >
          {settings.storeName}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`whitespace-nowrap shrink-0 text-sm transition-colors ${
                item.active
                  ? 'font-medium text-[var(--color-ink)]'
                  : 'text-[#57534e] hover:text-[var(--color-ink)]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[var(--color-paper)] transition-opacity hover:opacity-85"
          >
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{website.header.bagLabel}</span>
            <span className="font-mono tabular-nums">({cartCount})</span>
          </button>

          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center border border-[#ded5c8] text-[var(--color-ink)] md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#ded5c8] bg-[var(--color-paper-soft)] px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="py-1.5 text-sm text-[var(--color-ink)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

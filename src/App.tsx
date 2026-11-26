import React from 'react';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { StoreProvider, useStore } from './context/StoreContext';
import { RouterProvider, useRouter } from './lib/router';
import { AdminPage } from './pages/AdminPage';
import { ResetPasswordPage, VerifyEmailPage } from './pages/AuthTokenPages';
import { HomePage } from './pages/HomePage';
import { OrderLookupPage } from './pages/OrderLookupPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { WishlistPage } from './pages/WishlistPage';

function AppShell() {
  const { pathname } = useRouter();
  const { toast } = useStore();

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');

  let content: React.ReactNode;
  if (isAdmin) {
    content = <AdminPage />;
  } else if (pathname === '/verify') {
    content = <VerifyEmailPage />;
  } else if (pathname === '/reset') {
    content = <ResetPasswordPage />;
  } else if (pathname === '/wishlist' || pathname === '/wishlist/') {
    content = <WishlistPage />;
  } else if (pathname === '/orders') {
    content = <OrderLookupPage />;
  } else if (pathname.startsWith('/orders/')) {
    const ref = decodeURIComponent(pathname.slice('/orders/'.length).replace(/\/+$/, ''));
    content = <OrderLookupPage initialReference={ref} />;
  } else if (pathname.startsWith('/product/')) {
    const slug = decodeURIComponent(pathname.slice('/product/'.length).replace(/\/+$/, ''));
    content = <ProductDetailPage slug={slug} />;
  } else {
    content = <HomePage />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-paper)] text-[var(--color-ink)]">
      {!isAdmin && <Header />}
      <div className="flex-1">{content}</div>
      {!isAdmin && <Footer />}
      {!isAdmin && <CartDrawer />}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-5 bottom-5 z-50 border border-[var(--color-ink)] bg-[var(--color-ink)] px-4 py-2.5 text-xs text-[var(--color-paper)]"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <StoreProvider>
        <AppShell />
      </StoreProvider>
    </RouterProvider>
  );
}

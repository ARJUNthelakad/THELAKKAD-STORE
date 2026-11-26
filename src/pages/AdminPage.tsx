import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  FolderOpen,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  Users,
} from 'lucide-react';
import {
  fetchAdminCategories,
  fetchAdminCoupons,
  fetchAdminOrders,
  fetchAdminReviews,
  fetchAdminSettings,
  fetchAdminStaff,
  fetchAdminWebsite,
  fetchAuthStatus,
  fetchCurrentStaff,
  fetchStore,
  loginStaff,
  logoutStaff,
  requestPasswordReset,
  resendVerificationEmail,
  setAuthToken,
  setupFirstAdmin,
} from '../lib/api';
import { useStore } from '../context/StoreContext';
import { Link } from '../lib/router';
import type {
  Category,
  Coupon,
  Order,
  Product,
  ProductReview,
  StaffMember,
  StoreSettings,
  WebsiteContent,
} from '../shared/types';
import { CategoriesPanel, CouponsPanel, ProductsPanel } from '../components/admin/AdminCatalogPanels';
import {
  OrdersPanel,
  OverviewPanel,
  ReviewsPanel,
  SettingsPanel,
  StaffPanel,
} from '../components/admin/AdminOperationsPanels';
import { WebsiteEditorPanel } from '../components/admin/WebsiteEditorPanel';

type AdminTab =
  | 'overview'
  | 'website'
  | 'orders'
  | 'products'
  | 'reviews'
  | 'categories'
  | 'coupons'
  | 'staff'
  | 'settings';
type AuthView = 'login' | 'forgot' | 'resend';

const NAV_ITEMS: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'website', label: 'Website Editor', icon: LayoutTemplate },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  { id: 'categories', label: 'Categories', icon: FolderOpen },
  { id: 'coupons', label: 'Coupons', icon: Tag },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AdminPage() {
  const { refreshStore, showToast } = useStore();

  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [mailConfigured, setMailConfigured] = useState(false);
  const [staff, setStaff] = useState<StaffMember | null>(null);

  // Auth form states
  const [authView, setAuthView] = useState<AuthView>('login');
  const [setupName, setSetupName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [previewLink, setPreviewLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [website, setWebsite] = useState<WebsiteContent | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const loadDashboardData = useCallback(
    async (member: StaffMember) => {
      setLoadingData(true);
      try {
        const [storeRes, ordersRes, catsRes, couponsRes, settingsRes, websiteRes, reviewsRes] =
          await Promise.all([
            fetchStore(true),
            fetchAdminOrders(),
            fetchAdminCategories(),
            fetchAdminCoupons(),
            fetchAdminSettings(),
            fetchAdminWebsite(),
            fetchAdminReviews(),
          ]);
        setProducts(storeRes.products);
        setOrders(ordersRes.orders);
        setCategories(catsRes.categories);
        setCoupons(couponsRes.coupons);
        setSettings(settingsRes.settings);
        setWebsite(websiteRes.website);
        setReviews(reviewsRes.reviews);
        setMailConfigured(settingsRes.mailConfigured);

        if (member.role === 'admin') {
          const staffRes = await fetchAdminStaff();
          setStaffList(staffRes.staff);
        }
      } finally {
        setLoadingData(false);
      }
    },
    []
  );

  const bootstrap = useCallback(async () => {
    setChecking(true);
    try {
      const status = await fetchAuthStatus();
      setNeedsSetup(status.needsSetup);
      setMailConfigured(status.mailConfigured);
      if (!status.needsSetup) {
        try {
          const me = await fetchCurrentStaff();
          setStaff(me.staff);
          await loadDashboardData(me.staff);
        } catch {
          setStaff(null);
        }
      }
    } finally {
      setChecking(false);
    }
  }, [loadDashboardData]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleRefreshAll = useCallback(async () => {
    if (!staff) return;
    await Promise.all([loadDashboardData(staff), refreshStore()]);
  }, [loadDashboardData, refreshStore, staff]);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const res = await setupFirstAdmin({ name: setupName, email, password });
      setAuthToken(res.token);
      setNeedsSetup(false);
      setStaff(res.staff);
      await loadDashboardData(res.staff);
      showToast('Admin account created.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setPreviewLink(null);
    setAuthSubmitting(true);
    try {
      const res = await loginStaff({ email, password });
      setAuthToken(res.token);
      setStaff(res.staff);
      await loadDashboardData(res.staff);
      showToast(`Signed in as ${res.staff.name}.`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setPreviewLink(null);
    setAuthSubmitting(true);
    try {
      const res = await requestPasswordReset(email);
      setAuthInfo(res.message);
      if (res.previewLink) setPreviewLink(res.previewLink);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to request reset.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    setPreviewLink(null);
    setAuthSubmitting(true);
    try {
      const res = await resendVerificationEmail(email);
      setAuthInfo(res.message);
      if (res.previewLink) setPreviewLink(res.previewLink);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to resend verification.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logoutStaff().catch(() => {});
    setAuthToken(null);
    setStaff(null);
    setPassword('');
    showToast('Signed out.');
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea] text-sm text-[#57534e]">
        Loading studio workspace…
      </div>
    );
  }

  // Unauthenticated / First-run setup screens
  if (!staff) {
    return (
      <div className="flex min-h-screen flex-col justify-between bg-[#f6f1ea] px-4 py-10 sm:px-6">
        <div className="mx-auto w-full max-w-md">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-medium tracking-wider uppercase text-[#78716c] hover:text-[#1c1917]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Storefront
          </Link>

          <div className="mt-6 border border-[#ded5c8] bg-[#fcf9f5] p-8">
            <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
              Thelakkad Store Admin
            </p>

            {needsSetup ? (
              <>
                <h1 className="mt-2 font-serif text-3xl font-normal text-[#1c1917]">
                  Claim Studio Admin
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-[#57534e]">
                  No staff accounts exist yet. Create the primary administrator account to unlock
                  inventory, orders, and studio settings.
                </p>

                <form onSubmit={handleSetup} className="mt-6 space-y-4">
                  {authError && (
                    <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-3 py-2 text-xs text-[#991b1b]">
                      {authError}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      Full Name
                    </label>
                    <input
                      required
                      type="text"
                      value={setupName}
                      onChange={(e) => setSetupName(e.target.value)}
                      placeholder="Meera Krishnan"
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      Email
                    </label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="studio@thelakkad.in"
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      Password (min 8 characters)
                    </label>
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="w-full cursor-pointer bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c] disabled:opacity-60"
                  >
                    {authSubmitting ? 'Creating Admin…' : 'Create Admin Account'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h1 className="mt-2 font-serif text-3xl font-normal text-[#1c1917]">
                  {authView === 'login' && 'Staff Sign In'}
                  {authView === 'forgot' && 'Reset Password'}
                  {authView === 'resend' && 'Resend Verification'}
                </h1>

                {authError && (
                  <div className="mt-4 border border-[#991b1b]/30 bg-[#fef2f2] px-3 py-2 text-xs text-[#991b1b]">
                    {authError}
                  </div>
                )}
                {authInfo && (
                  <div className="mt-4 border border-[#2e4a3d]/30 bg-[#f6f1ea] px-3 py-2 text-xs text-[#2e4a3d]">
                    {authInfo}
                  </div>
                )}

                {previewLink && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      readOnly
                      value={previewLink}
                      className="flex-1 border border-[#ded5c8] bg-[#f6f1ea] px-2.5 py-1.5 font-mono text-[11px] text-[#1c1917]"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(previewLink).catch(() => {});
                        setCopiedLink(true);
                        window.setTimeout(() => setCopiedLink(false), 1800);
                      }}
                      className="inline-flex cursor-pointer items-center gap-1 bg-[#1c1917] px-2.5 py-1.5 text-xs text-[#f6f1ea]"
                    >
                      {copiedLink ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedLink ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                {authView === 'login' && (
                  <form onSubmit={handleLogin} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                        Email
                      </label>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                        Password
                      </label>
                      <input
                        required
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full cursor-pointer bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c] disabled:opacity-60"
                    >
                      {authSubmitting ? 'Signing In…' : 'Sign In'}
                    </button>

                    <div className="flex justify-between pt-2 text-xs text-[#57534e]">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthView('forgot');
                          setAuthError(null);
                          setAuthInfo(null);
                        }}
                        className="cursor-pointer underline decoration-[#ded5c8] underline-offset-2 hover:text-[#1c1917]"
                      >
                        Forgot password?
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthView('resend');
                          setAuthError(null);
                          setAuthInfo(null);
                        }}
                        className="cursor-pointer underline decoration-[#ded5c8] underline-offset-2 hover:text-[#1c1917]"
                      >
                        Resend verification
                      </button>
                    </div>
                  </form>
                )}

                {(authView === 'forgot' || authView === 'resend') && (
                  <form
                    onSubmit={authView === 'forgot' ? handleForgot : handleResend}
                    className="mt-6 space-y-4"
                  >
                    <div>
                      <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                        Staff Email
                      </label>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={authSubmitting}
                      className="w-full cursor-pointer bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
                    >
                      {authSubmitting
                        ? 'Processing…'
                        : authView === 'forgot'
                          ? 'Generate Reset Link'
                          : 'Resend Verification Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthView('login');
                        setAuthError(null);
                        setAuthInfo(null);
                        setPreviewLink(null);
                      }}
                      className="w-full cursor-pointer text-center text-xs text-[#57534e] hover:text-[#1c1917]"
                    >
                      Back to sign in
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Workspace
  const currentTabLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Overview';

  return (
    <div className="flex min-h-screen bg-[#f6f1ea] text-[#1c1917]">
      {/* Fixed Desktop Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-[#ded5c8] bg-[#fcf9f5] lg:flex">
        <div>
          <div className="flex h-16 items-center border-b border-[#ded5c8] px-6">
            <Link to="/" className="font-serif text-xl font-medium text-[#1c1917]">
              {settings?.storeName || 'Thelakkad Store'}
            </Link>
          </div>

          <nav aria-label="Admin sections" className="space-y-1 p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? 'bg-[#1c1917] font-medium text-[#f6f1ea]'
                      : 'text-[#57534e] hover:bg-[#f6f1ea] hover:text-[#1c1917]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[#ded5c8] p-4">
          <p className="text-xs font-medium text-[#1c1917]">{staff.name}</p>
          <p className="truncate font-mono text-[11px] text-[#78716c]">
            {staff.email} · {staff.role}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <Link
              to="/"
              className="text-xs text-[#57534e] underline decoration-[#ded5c8] underline-offset-2 hover:text-[#1c1917]"
            >
              Storefront
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-[#991b1b] hover:underline"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-[#ded5c8] bg-[#fcf9f5] px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="text-xs tracking-wider uppercase text-[#78716c]">Admin</span>
            <span className="text-[#ded5c8]">/</span>
            <h1 className="font-serif text-xl font-normal text-[#1c1917]">{currentTabLabel}</h1>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[#1c1917]"
            >
              View Store
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="cursor-pointer text-xs font-medium tracking-wider uppercase text-[#991b1b] lg:hidden"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Mobile Tab Rail */}
        <div className="flex gap-1 overflow-x-auto border-b border-[#ded5c8] bg-[#fcf9f5] px-3 py-2 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`shrink-0 cursor-pointer px-3 py-1.5 text-xs ${
                activeTab === item.id
                  ? 'bg-[#1c1917] text-[#f6f1ea]'
                  : 'text-[#57534e]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <main className="flex-1 p-4 sm:p-8">
          {loadingData && products.length === 0 ? (
            <p className="text-sm text-[#78716c]">Loading studio records…</p>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewPanel
                  orders={orders}
                  products={products}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                />
              )}
              {activeTab === 'website' && website && settings && (
                <WebsiteEditorPanel
                  website={website}
                  settings={settings}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
              {activeTab === 'orders' && (
                <OrdersPanel
                  orders={orders}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
              {activeTab === 'products' && (
                <ProductsPanel
                  products={products}
                  categories={categories}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
              {activeTab === 'reviews' && (
                <ReviewsPanel
                  reviews={reviews}
                  products={products}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
              {activeTab === 'categories' && (
                <CategoriesPanel
                  categories={categories}
                  products={products}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
              {activeTab === 'coupons' && (
                <CouponsPanel
                  coupons={coupons}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
              {activeTab === 'staff' && (
                <StaffPanel
                  currentStaff={staff}
                  staffList={staffList}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
              {activeTab === 'settings' && settings && (
                <SettingsPanel
                  settings={settings}
                  mailConfigured={mailConfigured}
                  role={staff.role}
                  staffEmail={staff.email}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

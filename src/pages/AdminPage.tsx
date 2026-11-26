import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Contact,
  Copy,
  FolderOpen,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  MessageSquare,
  Package,
  RefreshCw,
  Settings,
  ShoppingBag,
  Tag,
  Users,
} from 'lucide-react';
import {
  ApiError,
  fetchAdminCategories,
  fetchAdminCoupons,
  fetchAdminCustomers,
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
  CustomerSummary,
  Order,
  Product,
  ProductReview,
  StaffMember,
  StoreSettings,
  WebsiteContent,
} from '../shared/types';
import { CategoriesPanel, CouponsPanel, ProductsPanel } from '../components/admin/AdminCatalogPanels';
import {
  CustomersPanel,
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
  | 'customers'
  | 'products'
  | 'reviews'
  | 'categories'
  | 'coupons'
  | 'staff'
  | 'settings';
type AuthView = 'login' | 'forgot' | 'resend';

type DataResource =
  | 'products'
  | 'orders'
  | 'customers'
  | 'categories'
  | 'coupons'
  | 'settings'
  | 'website'
  | 'reviews'
  | 'staff';

const NAV_ITEMS: Array<{
  id: AdminTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'website', label: 'Website Editor', icon: LayoutTemplate },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'customers', label: 'Customers', icon: Contact },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  { id: 'categories', label: 'Categories', icon: FolderOpen },
  { id: 'coupons', label: 'Coupons', icon: Tag },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function formatError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function SectionErrorBanner({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-3 text-xs text-[#991b1b]">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        disabled={retrying}
        onClick={onRetry}
        className="inline-flex cursor-pointer items-center gap-1.5 border border-[#991b1b]/40 bg-white px-3 py-1.5 text-xs font-medium text-[#991b1b] hover:bg-[#991b1b] hover:text-white disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
        Retry
      </button>
    </div>
  );
}

export function AdminPage() {
  const { refreshStore, showToast } = useStore();

  const [checking, setChecking] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
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

  // Dashboard state (each resource tracked independently so one failure never blanks the dashboard)
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [website, setWebsite] = useState<WebsiteContent | null>(null);

  const [loadingResources, setLoadingResources] = useState<Partial<Record<DataResource, boolean>>>(
    {}
  );
  const [resourceErrors, setResourceErrors] = useState<Partial<Record<DataResource, string>>>({});
  const [loadedResources, setLoadedResources] = useState<Partial<Record<DataResource, boolean>>>({});

  const handleSessionExpired = useCallback(() => {
    setAuthToken(null);
    setStaff(null);
    setAuthError('Your admin session expired. Please sign in again.');
  }, []);

  const loadDashboardData = useCallback(
    async (member: StaffMember, targets?: DataResource[]) => {
      const allTargets: DataResource[] = targets ?? [
        'products',
        'orders',
        'customers',
        'categories',
        'coupons',
        'settings',
        'website',
        'reviews',
        ...(member.role === 'admin' ? (['staff'] as DataResource[]) : []),
      ];

      setLoadingResources((prev) => {
        const next = { ...prev };
        for (const r of allTargets) next[r] = true;
        return next;
      });

      const loaders: Array<{ key: DataResource; run: () => Promise<void> }> = [];

      if (allTargets.includes('products')) {
        loaders.push({
          key: 'products',
          run: async () => {
            const res = await fetchStore(true);
            setProducts(res.products);
          },
        });
      }
      if (allTargets.includes('orders')) {
        loaders.push({
          key: 'orders',
          run: async () => {
            const res = await fetchAdminOrders();
            setOrders(res.orders);
          },
        });
      }
      if (allTargets.includes('customers')) {
        loaders.push({
          key: 'customers',
          run: async () => {
            const res = await fetchAdminCustomers();
            setCustomers(res.customers);
          },
        });
      }
      if (allTargets.includes('categories')) {
        loaders.push({
          key: 'categories',
          run: async () => {
            const res = await fetchAdminCategories();
            setCategories(res.categories);
          },
        });
      }
      if (allTargets.includes('coupons')) {
        loaders.push({
          key: 'coupons',
          run: async () => {
            const res = await fetchAdminCoupons();
            setCoupons(res.coupons);
          },
        });
      }
      if (allTargets.includes('settings')) {
        loaders.push({
          key: 'settings',
          run: async () => {
            const res = await fetchAdminSettings();
            setSettings(res.settings);
            setMailConfigured(res.mailConfigured);
          },
        });
      }
      if (allTargets.includes('website')) {
        loaders.push({
          key: 'website',
          run: async () => {
            const res = await fetchAdminWebsite();
            setWebsite(res.website);
          },
        });
      }
      if (allTargets.includes('reviews')) {
        loaders.push({
          key: 'reviews',
          run: async () => {
            const res = await fetchAdminReviews();
            setReviews(res.reviews);
          },
        });
      }
      if (allTargets.includes('staff') && member.role === 'admin') {
        loaders.push({
          key: 'staff',
          run: async () => {
            const res = await fetchAdminStaff();
            setStaffList(res.staff);
          },
        });
      }

      const settled = await Promise.allSettled(loaders.map((l) => l.run()));

      let unauthorized = false;
      const nextErrors: Partial<Record<DataResource, string>> = {};
      const nextLoaded: Partial<Record<DataResource, boolean>> = {};

      settled.forEach((result, idx) => {
        const key = loaders[idx].key;
        if (result.status === 'fulfilled') {
          nextLoaded[key] = true;
          nextErrors[key] = undefined;
        } else {
          const reason = result.reason;
          if (reason instanceof ApiError && reason.status === 401) {
            unauthorized = true;
          }
          nextErrors[key] = formatError(reason, `Unable to load ${key}.`);
        }
      });

      setLoadingResources((prev) => {
        const next = { ...prev };
        for (const r of allTargets) next[r] = false;
        return next;
      });
      setLoadedResources((prev) => ({ ...prev, ...nextLoaded }));
      setResourceErrors((prev) => ({ ...prev, ...nextErrors }));

      if (unauthorized) {
        handleSessionExpired();
      }
    },
    [handleSessionExpired]
  );

  const bootstrap = useCallback(async () => {
    setChecking(true);
    setBootstrapError(null);
    try {
      const status = await fetchAuthStatus();
      setNeedsSetup(status.needsSetup);
      setMailConfigured(status.mailConfigured);
      if (!status.needsSetup) {
        try {
          const me = await fetchCurrentStaff();
          setStaff(me.staff);
          await loadDashboardData(me.staff);
        } catch (err) {
          if (err instanceof ApiError && err.status === 503) {
            setBootstrapError(err.message);
          }
          setStaff(null);
        }
      }
    } catch (err) {
      setBootstrapError(
        formatError(
          err,
          'Could not connect to the store database. Check your Neon DATABASE_URL environment variable.'
        )
      );
    } finally {
      setChecking(false);
    }
  }, [loadDashboardData]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleRefreshAll = useCallback(async () => {
    if (!staff) return;
    await Promise.allSettled([loadDashboardData(staff), refreshStore()]);
  }, [loadDashboardData, refreshStore, staff]);

  const retryResources = useCallback(
    (resources: DataResource[]) => {
      if (!staff) return;
      void loadDashboardData(staff, resources);
    },
    [loadDashboardData, staff]
  );

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
      setAuthError(formatError(err, 'Setup failed.'));
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
      setAuthError(formatError(err, 'Sign in failed.'));
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
      setAuthError(formatError(err, 'Unable to request reset.'));
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
      setAuthError(formatError(err, 'Unable to resend verification.'));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logoutStaff().catch(() => {});
    setAuthToken(null);
    setStaff(null);
    setPassword('');
    setResourceErrors({});
    setLoadedResources({});
    showToast('Signed out.');
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f1ea] text-sm text-[#57534e]">
        Loading studio workspace…
      </div>
    );
  }

  // Unauthenticated / First-run setup / Database unavailable screens
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

            {bootstrapError ? (
              <div className="mt-4 space-y-4">
                <h1 className="font-serif text-2xl font-normal text-[#1c1917]">
                  Database Connection Needed
                </h1>
                <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-3.5 py-3 text-xs leading-relaxed text-[#991b1b]">
                  {bootstrapError}
                </div>
                <button
                  type="button"
                  onClick={() => void bootstrap()}
                  className="inline-flex w-full cursor-pointer items-center justify-center gap-2 bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Connection
                </button>
              </div>
            ) : needsSetup ? (
              <>
                <h1 className="mt-2 font-serif text-3xl font-normal text-[#1c1917]">
                  Claim Studio Admin
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-[#57534e]">
                  No staff accounts exist yet. Create the primary administrator account to unlock
                  inventory, orders, Website Editor, and studio settings.
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
  const websiteError = resourceErrors.website || resourceErrors.settings;
  const websiteLoading =
    (Boolean(loadingResources.website) && !website) ||
    (Boolean(loadingResources.settings) && !settings);

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
            <button
              type="button"
              onClick={() => void handleRefreshAll()}
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[#1c1917]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
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
          {activeTab === 'overview' && (
            <>
              {(resourceErrors.orders || resourceErrors.products) && (
                <SectionErrorBanner
                  message={
                    resourceErrors.orders ||
                    resourceErrors.products ||
                    'Some overview records could not be loaded.'
                  }
                  onRetry={() => retryResources(['orders', 'products'])}
                  retrying={Boolean(loadingResources.orders || loadingResources.products)}
                />
              )}
              {(loadingResources.orders || loadingResources.products) &&
              !loadedResources.orders &&
              !loadedResources.products ? (
                <p className="text-sm text-[#78716c]">Loading overview metrics…</p>
              ) : (
                <OverviewPanel
                  orders={orders}
                  products={products}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                />
              )}
            </>
          )}

          {activeTab === 'website' && (
            <>
              {websiteError && (
                <SectionErrorBanner
                  message={`Website Editor data failed to load: ${websiteError}`}
                  onRetry={() => retryResources(['website', 'settings'])}
                  retrying={Boolean(loadingResources.website || loadingResources.settings)}
                />
              )}
              {websiteLoading ? (
                <p className="text-sm text-[#78716c]">Loading Website Editor configuration…</p>
              ) : website && settings ? (
                <WebsiteEditorPanel
                  website={website}
                  settings={settings}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              ) : (
                <div className="border border-[#ded5c8] bg-[#fcf9f5] p-8 text-center">
                  <p className="text-sm text-[#57534e]">
                    Website Editor content could not be retrieved from the database.
                  </p>
                  <button
                    type="button"
                    onClick={() => retryResources(['website', 'settings'])}
                    className="mt-4 inline-flex cursor-pointer items-center gap-2 bg-[#1c1917] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[#f6f1ea]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reload Website Editor
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'orders' && (
            <>
              {resourceErrors.orders && (
                <SectionErrorBanner
                  message={`Orders failed to load: ${resourceErrors.orders}`}
                  onRetry={() => retryResources(['orders'])}
                  retrying={Boolean(loadingResources.orders)}
                />
              )}
              {loadingResources.orders && !loadedResources.orders ? (
                <p className="text-sm text-[#78716c]">Loading orders…</p>
              ) : (
                <OrdersPanel
                  orders={orders}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
            </>
          )}

          {activeTab === 'customers' && (
            <>
              {resourceErrors.customers && (
                <SectionErrorBanner
                  message={`Customers failed to load: ${resourceErrors.customers}`}
                  onRetry={() => retryResources(['customers'])}
                  retrying={Boolean(loadingResources.customers)}
                />
              )}
              {loadingResources.customers && !loadedResources.customers ? (
                <p className="text-sm text-[#78716c]">Loading customer directory…</p>
              ) : (
                <CustomersPanel customers={customers} />
              )}
            </>
          )}

          {activeTab === 'products' && (
            <>
              {(resourceErrors.products || resourceErrors.categories) && (
                <SectionErrorBanner
                  message={
                    resourceErrors.products ||
                    resourceErrors.categories ||
                    'Unable to load catalog records.'
                  }
                  onRetry={() => retryResources(['products', 'categories'])}
                  retrying={Boolean(loadingResources.products || loadingResources.categories)}
                />
              )}
              {loadingResources.products && !loadedResources.products ? (
                <p className="text-sm text-[#78716c]">Loading products…</p>
              ) : (
                <ProductsPanel
                  products={products}
                  categories={categories}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
            </>
          )}

          {activeTab === 'reviews' && (
            <>
              {resourceErrors.reviews && (
                <SectionErrorBanner
                  message={`Reviews failed to load: ${resourceErrors.reviews}`}
                  onRetry={() => retryResources(['reviews', 'products'])}
                  retrying={Boolean(loadingResources.reviews)}
                />
              )}
              {loadingResources.reviews && !loadedResources.reviews ? (
                <p className="text-sm text-[#78716c]">Loading reviews…</p>
              ) : (
                <ReviewsPanel
                  reviews={reviews}
                  products={products}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
            </>
          )}

          {activeTab === 'categories' && (
            <>
              {resourceErrors.categories && (
                <SectionErrorBanner
                  message={`Categories failed to load: ${resourceErrors.categories}`}
                  onRetry={() => retryResources(['categories', 'products'])}
                  retrying={Boolean(loadingResources.categories)}
                />
              )}
              {loadingResources.categories && !loadedResources.categories ? (
                <p className="text-sm text-[#78716c]">Loading categories…</p>
              ) : (
                <CategoriesPanel
                  categories={categories}
                  products={products}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
            </>
          )}

          {activeTab === 'coupons' && (
            <>
              {resourceErrors.coupons && (
                <SectionErrorBanner
                  message={`Coupons failed to load: ${resourceErrors.coupons}`}
                  onRetry={() => retryResources(['coupons'])}
                  retrying={Boolean(loadingResources.coupons)}
                />
              )}
              {loadingResources.coupons && !loadedResources.coupons ? (
                <p className="text-sm text-[#78716c]">Loading coupons…</p>
              ) : (
                <CouponsPanel
                  coupons={coupons}
                  role={staff.role}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
            </>
          )}

          {activeTab === 'staff' && (
            <>
              {resourceErrors.staff && (
                <SectionErrorBanner
                  message={`Staff directory failed to load: ${resourceErrors.staff}`}
                  onRetry={() => retryResources(['staff'])}
                  retrying={Boolean(loadingResources.staff)}
                />
              )}
              {loadingResources.staff && !loadedResources.staff && staff.role === 'admin' ? (
                <p className="text-sm text-[#78716c]">Loading staff accounts…</p>
              ) : (
                <StaffPanel
                  currentStaff={staff}
                  staffList={staffList}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              )}
            </>
          )}

          {activeTab === 'settings' && (
            <>
              {resourceErrors.settings && (
                <SectionErrorBanner
                  message={`Store settings failed to load: ${resourceErrors.settings}`}
                  onRetry={() => retryResources(['settings'])}
                  retrying={Boolean(loadingResources.settings)}
                />
              )}
              {loadingResources.settings && !settings ? (
                <p className="text-sm text-[#78716c]">Loading store settings…</p>
              ) : settings ? (
                <SettingsPanel
                  settings={settings}
                  mailConfigured={mailConfigured}
                  role={staff.role}
                  staffEmail={staff.email}
                  onRefresh={handleRefreshAll}
                  onNotice={showToast}
                />
              ) : (
                <div className="border border-[#ded5c8] bg-[#fcf9f5] p-8 text-center">
                  <p className="text-sm text-[#57534e]">
                    Store settings could not be loaded from the database.
                  </p>
                  <button
                    type="button"
                    onClick={() => retryResources(['settings'])}
                    className="mt-4 inline-flex cursor-pointer items-center gap-2 bg-[#1c1917] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[#f6f1ea]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry Settings
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

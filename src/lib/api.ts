import type {
  AuthStatus,
  Category,
  Coupon,
  CustomerSummary,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ProductMedia,
  ProductOption,
  ProductReview,
  PublicOrderLookup,
  StaffMember,
  StaffRole,
  StorePayload,
  StoreSettings,
  WebsiteContent,
} from '../shared/types';

// Keep staff bearer token strictly in memory (never localStorage/sessionStorage)
let memoryAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryAuthToken = token;
}

export function getAuthToken(): string | null {
  return memoryAuthToken;
}

export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;

  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryAuthToken) {
    headers.set('Authorization', `Bearer ${memoryAuthToken}`);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

// --- Public Storefront & Orders ---

export function fetchStore(includeArchived = false): Promise<StorePayload> {
  const qs = includeArchived ? '?includeArchived=true' : '';
  return request<StorePayload>(`/api/store${qs}`);
}

export function submitOrder(body: {
  customer: Order['customer'];
  paymentMethod: PaymentMethod;
  items: Array<{ slug: string; quantity: number; selectedOptions: Record<string, string> }>;
  couponCode?: string | null;
  note?: string;
}): Promise<{ order: Order }> {
  return request<{ order: Order }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function lookupOrder(reference: string): Promise<{ order: PublicOrderLookup }> {
  return request<{ order: PublicOrderLookup }>(
    `/api/orders/${encodeURIComponent(reference.trim())}`
  );
}

export interface ProductReviewsPayload {
  reviews: ProductReview[];
  average: number;
  count: number;
  distribution: Record<number, number>;
}

export function fetchProductReviews(slug: string): Promise<ProductReviewsPayload> {
  return request<ProductReviewsPayload>(`/api/products/${encodeURIComponent(slug)}/reviews`);
}

export function submitProductReview(
  slug: string,
  body: {
    authorName: string;
    rating: number;
    title: string;
    comment: string;
    orderReference?: string;
  }
): Promise<{ review: ProductReview }> {
  return request<{ review: ProductReview }>(`/api/products/${encodeURIComponent(slug)}/reviews`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function subscribeNewsletter(email: string): Promise<{
  ok: boolean;
  alreadySubscribed: boolean;
  message: string;
}> {
  return request('/api/newsletter', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// --- Auth ---

export function fetchAuthStatus(): Promise<AuthStatus> {
  return request<AuthStatus>('/api/auth/status');
}

export function setupFirstAdmin(body: {
  name: string;
  email: string;
  password: string;
}): Promise<{ staff: StaffMember; token: string }> {
  return request<{ staff: StaffMember; token: string }>('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function loginStaff(body: {
  email: string;
  password: string;
}): Promise<{ staff: StaffMember; token: string }> {
  return request<{ staff: StaffMember; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function logoutStaff(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function fetchCurrentStaff(): Promise<{ staff: StaffMember }> {
  return request<{ staff: StaffMember }>('/api/auth/me');
}

export function verifyStaffEmail(token: string): Promise<{ ok: boolean; email: string }> {
  return request<{ ok: boolean; email: string }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function requestPasswordReset(email: string): Promise<{
  ok: boolean;
  mailSent?: boolean;
  message: string;
  previewLink?: string;
}> {
  return request('/api/auth/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function completePasswordReset(
  token: string,
  password: string
): Promise<{ ok: boolean; email: string }> {
  return request('/api/auth/reset', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function resendVerificationEmail(email: string): Promise<{
  ok: boolean;
  mailSent?: boolean;
  message: string;
  previewLink?: string;
}> {
  return request('/api/auth/resend', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// --- Admin ---

export function fetchAdminOrders(): Promise<{ orders: Order[] }> {
  return request('/api/admin/orders');
}

export function fetchAdminCustomers(): Promise<{ customers: CustomerSummary[] }> {
  return request('/api/admin/customers');
}

export function patchAdminOrderStatus(
  reference: string,
  status: OrderStatus
): Promise<{ order: Order }> {
  return request(`/api/admin/orders/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function fetchAdminCategories(): Promise<{ categories: Category[] }> {
  return request('/api/admin/categories');
}

export function createAdminCategory(body: {
  name: string;
  slug?: string;
  description: string;
}): Promise<{ category: Category }> {
  return request('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAdminCategory(
  slug: string,
  body: { name: string; description: string }
): Promise<{ category: Category }> {
  return request(`/api/admin/categories/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteAdminCategory(slug: string): Promise<{ ok: boolean }> {
  return request(`/api/admin/categories/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}

export function uploadProductMedia(body: {
  mimeType: string;
  dataBase64: string;
  alt: string;
}): Promise<{ media: ProductMedia }> {
  return request('/api/admin/products/media-uploads', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cleanupProductMedia(urls: string[]): Promise<{ ok: boolean }> {
  return request('/api/admin/products/media-cleanup', {
    method: 'POST',
    body: JSON.stringify({ urls }),
  });
}

export interface ProductSaveInput {
  slug?: string;
  sku?: string;
  title: string;
  subtitle: string;
  category: string;
  priceInr: number;
  stock: number;
  editionNote: string;
  description: string;
  materials: string;
  dimensions: string;
  care: string;
  options: ProductOption[];
  media: ProductMedia[];
  featured: boolean;
}

export function createAdminProduct(body: ProductSaveInput): Promise<{ product: Product }> {
  return request('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAdminProduct(
  slug: string,
  body: ProductSaveInput
): Promise<{ product: Product }> {
  return request(`/api/admin/products/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function patchAdminProductQuick(
  slug: string,
  body: { priceInr?: number; stock?: number }
): Promise<{ product: Product }> {
  return request(`/api/admin/products/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function toggleAdminProductArchive(
  slug: string,
  archived: boolean
): Promise<{ product: Product }> {
  return request(`/api/admin/products/${encodeURIComponent(slug)}/archive`, {
    method: 'PATCH',
    body: JSON.stringify({ archived }),
  });
}

export function deleteOrResetAdminProduct(
  slug: string
): Promise<{ ok: boolean; action: 'deleted' | 'reset' }> {
  return request(`/api/admin/products/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  });
}

export function fetchAdminCoupons(): Promise<{ coupons: Coupon[] }> {
  return request('/api/admin/coupons');
}

export function createAdminCoupon(body: {
  code: string;
  kind: Coupon['kind'];
  value: number;
  minSubtotalInr: number;
  description: string;
}): Promise<{ coupon: Coupon }> {
  return request('/api/admin/coupons', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteAdminCoupon(code: string): Promise<{ ok: boolean }> {
  return request(`/api/admin/coupons/${encodeURIComponent(code)}`, {
    method: 'DELETE',
  });
}

export function fetchAdminStaff(): Promise<{ staff: StaffMember[] }> {
  return request('/api/admin/staff');
}

export function createAdminStaff(body: {
  name: string;
  email: string;
  role: StaffRole;
  password: string;
}): Promise<{ staff: StaffMember; mailSent: boolean; verifyLink?: string }> {
  return request('/api/admin/staff', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function resendStaffVerificationAdmin(
  id: string
): Promise<{ ok: boolean; mailSent: boolean; verifyLink?: string }> {
  return request(`/api/admin/staff/${encodeURIComponent(id)}/verification`, {
    method: 'POST',
  });
}

export function deleteAdminStaff(id: string): Promise<{ ok: boolean }> {
  return request(`/api/admin/staff/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function changeOwnPassword(body: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean }> {
  return request('/api/admin/password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchAdminSettings(): Promise<{
  settings: StoreSettings;
  mailConfigured: boolean;
}> {
  return request('/api/admin/settings');
}

export function saveAdminSettings(settings: StoreSettings): Promise<{ settings: StoreSettings }> {
  return request('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export function fetchAdminWebsite(): Promise<{ website: WebsiteContent }> {
  return request('/api/admin/website');
}

export function saveAdminWebsite(website: WebsiteContent): Promise<{ website: WebsiteContent }> {
  return request('/api/admin/website', {
    method: 'PUT',
    body: JSON.stringify(website),
  });
}

export function resetAdminWebsite(): Promise<{ website: WebsiteContent }> {
  return request('/api/admin/website/reset', {
    method: 'POST',
  });
}

export function sendAdminTestMail(to?: string): Promise<{
  ok: boolean;
  provider: 'resend' | 'fallback';
  to: string;
  message: string;
}> {
  return request('/api/admin/mail-test', {
    method: 'POST',
    body: JSON.stringify({ to }),
  });
}

export function fetchAdminReviews(): Promise<{ reviews: ProductReview[] }> {
  return request('/api/admin/reviews');
}

export function deleteAdminReview(id: string): Promise<{ ok: boolean }> {
  return request(`/api/admin/reviews/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export type MediaKind = 'image' | 'video';

export interface ProductMedia {
  id: string;
  kind: MediaKind;
  url: string;
  alt: string;
}

export interface ProductOption {
  label: string;
  values: string[];
}

export interface Product {
  slug: string;
  sku: string;
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
  featured?: boolean;
  archived?: boolean;
  isCustom?: boolean;
  hasOverride?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  slug: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

export type CouponKind = 'percent' | 'flat' | 'shipping';

export interface Coupon {
  code: string;
  kind: CouponKind;
  value: number;
  minSubtotalInr: number;
  description: string;
  active: boolean;
  isDefault?: boolean;
}

export type OrderStatus =
  | 'confirmed'
  | 'packed'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'upi' | 'card' | 'cod';

export interface OrderItem {
  slug: string;
  sku: string;
  title: string;
  unitPriceInr: number;
  quantity: number;
  selectedOptions: Record<string, string>;
  imageUrl: string;
}

export interface OrderCustomer {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  pincode: string;
  orderCount: number;
  totalSpentInr: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface Order {
  reference: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customer: OrderCustomer;
  items: OrderItem[];
  subtotalInr: number;
  discountInr: number;
  shippingInr: number;
  totalInr: number;
  couponCode: string | null;
  note?: string;
}

export interface PublicOrderLookup {
  reference: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  maskedEmail: string;
  customerFirstName: string;
  city: string;
  state: string;
  items: OrderItem[];
  subtotalInr: number;
  discountInr: number;
  shippingInr: number;
  totalInr: number;
  couponCode: string | null;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  studioAddress: string;
  supportEmail: string;
  supportPhone: string;
  freeShippingThresholdInr: number;
  flatShippingInr: number;
  dispatchWindow: string;
  announcement: string;
}

export type StaffRole = 'admin' | 'staff';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface WebsiteHighlight {
  title: string;
  description: string;
}

export interface WebsiteTheme {
  bgColor: string;
  surfaceColor: string;
  inkColor: string;
  accentColor: string;
}

export interface WebsiteContent {
  theme: WebsiteTheme;
  showAnnouncement: boolean;
  header: {
    shopLabel: string;
    aboutLabel: string;
    trackLabel: string;
    bagLabel: string;
  };
  hero: {
    visible: boolean;
    eyebrow: string;
    headline: string;
    subheadline: string;
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
    imageUrl: string;
    imageAlt: string;
  };
  collection: {
    eyebrow: string;
    heading: string;
    searchPlaceholder: string;
    showSearch: boolean;
    showCategoryTabs: boolean;
  };
  about: {
    visible: boolean;
    eyebrow: string;
    heading: string;
    body: string;
    imageUrl: string;
    imageAlt: string;
    highlights: WebsiteHighlight[];
  };
  footer: {
    linksHeading: string;
    shippingHeading: string;
    copyrightNote: string;
    showFreeShippingNote: boolean;
  };
}

export interface ProductReview {
  id: string;
  slug: string;
  authorName: string;
  rating: number;
  title: string;
  comment: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  average: number;
  count: number;
}

export interface StorePayload {
  products: Product[];
  categories: Category[];
  coupons: Coupon[];
  settings: StoreSettings;
  website: WebsiteContent;
  reviewStats: Record<string, ReviewSummary>;
}

export interface AuthStatus {
  needsSetup: boolean;
  mailConfigured: boolean;
}

export interface CartItem {
  key: string;
  slug: string;
  sku: string;
  title: string;
  priceInr: number;
  quantity: number;
  maxStock: number;
  selectedOptions: Record<string, string>;
  imageUrl: string;
}

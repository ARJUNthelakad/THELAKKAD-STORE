import type { OrderStatus } from '../shared/types';

export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function sanitizeMediaUrl(url: string | undefined | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/src/assets/images/') || trimmed.startsWith('/uploads/')) {
    return trimmed.includes('..') ? '' : trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return '';
  }
  return '';
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; step: number; toneClass: string }
> = {
  confirmed: { label: 'Confirmed', step: 1, toneClass: 'text-[#8c4a2f]' },
  packed: { label: 'Packed & Ready', step: 2, toneClass: 'text-[#6b5633]' },
  dispatched: { label: 'Dispatched', step: 3, toneClass: 'text-[#2e4a3d]' },
  delivered: { label: 'Delivered', step: 4, toneClass: 'text-[#1c1917]' },
  cancelled: { label: 'Cancelled', step: 0, toneClass: 'text-[#991b1b]' },
};

export const PAYMENT_METHOD_LABELS: Record<'upi' | 'card' | 'cod', string> = {
  upi: 'UPI / Instant Pay',
  card: 'Debit or Credit Card',
  cod: 'Cash on Delivery',
};

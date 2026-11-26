import React, { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { lookupOrder } from '../lib/api';
import {
  formatDateTime,
  formatInr,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { useRouter } from '../lib/router';
import type { OrderStatus, PublicOrderLookup } from '../shared/types';
import { SafeImage } from '../components/SafeImage';

const TIMELINE_STEPS: OrderStatus[] = ['confirmed', 'packed', 'dispatched', 'delivered'];

export function OrderLookupPage({ initialReference }: { initialReference?: string }) {
  const { navigate } = useRouter();
  const [referenceInput, setReferenceInput] = useState(initialReference || '');
  const [order, setOrder] = useState<PublicOrderLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runLookup = useCallback(async (ref: string) => {
    const clean = ref.trim().toUpperCase();
    if (!clean) return;
    setLoading(true);
    setError(null);
    try {
      const res = await lookupOrder(clean);
      setOrder(res.order);
    } catch (err) {
      setOrder(null);
      setError(err instanceof Error ? err.message : 'Order not found.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialReference) {
      setReferenceInput(initialReference);
      void runLookup(initialReference);
    }
  }, [initialReference, runLookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = referenceInput.trim().toUpperCase();
    if (!clean) return;
    navigate(`/orders/${encodeURIComponent(clean)}`);
    void runLookup(clean);
  };

  const currentStep = order ? ORDER_STATUS_META[order.status].step : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
        Order Lookup
      </p>
      <h1 className="mt-2 font-serif text-3xl font-normal text-[#1c1917] sm:text-4xl">
        Track Your Order
      </h1>
      <p className="mt-3 text-sm text-[#57534e]">
        Enter your order reference from checkout to view live packing and delivery updates.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#78716c]"
            aria-hidden="true"
          />
          <input
            type="text"
            value={referenceInput}
            onChange={(e) => setReferenceInput(e.target.value)}
            placeholder="e.g. THL-24091"
            aria-label="Order reference"
            className="w-full border border-[#ded5c8] bg-[#fcf9f5] py-3 pr-4 pl-10 font-mono text-sm uppercase text-[#1c1917] placeholder:normal-case placeholder:text-[#78716c] focus:border-[#1c1917] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="cursor-pointer bg-[#1c1917] px-6 py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c] disabled:opacity-60"
        >
          {loading ? 'Checking…' : 'Look Up Order'}
        </button>
      </form>

      <p className="mt-3 text-xs text-[#78716c]">
        Sample studio references to try:{' '}
        <button
          type="button"
          onClick={() => {
            setReferenceInput('THL-24091');
            navigate('/orders/THL-24091');
            void runLookup('THL-24091');
          }}
          className="cursor-pointer font-mono underline decoration-[#ded5c8] underline-offset-2 hover:text-[#1c1917]"
        >
          THL-24091
        </button>
        {' · '}
        <button
          type="button"
          onClick={() => {
            setReferenceInput('THL-24092');
            navigate('/orders/THL-24092');
            void runLookup('THL-24092');
          }}
          className="cursor-pointer font-mono underline decoration-[#ded5c8] underline-offset-2 hover:text-[#1c1917]"
        >
          THL-24092
        </button>
      </p>

      {error && (
        <div className="mt-8 border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-3 text-sm text-[#991b1b]">
          {error}
        </div>
      )}

      {order && (
        <section className="mt-10 border border-[#ded5c8] bg-[#fcf9f5] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 border-b border-[#ded5c8] pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-xs tracking-wider uppercase text-[#78716c]">
                Reference {order.reference}
              </p>
              <h2 className="mt-1 font-serif text-2xl font-normal text-[#1c1917]">
                <span className={ORDER_STATUS_META[order.status].toneClass}>
                  {ORDER_STATUS_META[order.status].label}
                </span>
              </h2>
            </div>
            <div className="text-xs text-[#57534e] sm:text-right">
              <p>Placed {formatDateTime(order.createdAt)}</p>
              <p className="mt-0.5">
                {order.customerFirstName} · {order.maskedEmail}
              </p>
            </div>
          </div>

          {order.status !== 'cancelled' && (
            <div className="mt-6 grid grid-cols-4 gap-2 border-b border-[#ded5c8] pb-6">
              {TIMELINE_STEPS.map((st) => {
                const meta = ORDER_STATUS_META[st];
                const reached = currentStep >= meta.step;
                return (
                  <div key={st}>
                    <div
                      className={`h-1 w-full ${reached ? 'bg-[#1c1917]' : 'bg-[#ded5c8]'}`}
                    />
                    <p
                      className={`mt-2 text-xs ${
                        reached ? 'font-medium text-[#1c1917]' : 'text-[#78716c]'
                      }`}
                    >
                      {meta.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 border-b border-[#ded5c8] pb-6 text-xs text-[#57534e] sm:grid-cols-3">
            <div>
              <p className="uppercase tracking-wider text-[#78716c]">Destination</p>
              <p className="mt-1 text-sm text-[#1c1917]">
                {order.city}, {order.state}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-[#78716c]">Payment</p>
              <p className="mt-1 text-sm text-[#1c1917]">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </p>
            </div>
            <div>
              <p className="uppercase tracking-wider text-[#78716c]">Last Updated</p>
              <p className="mt-1 text-sm text-[#1c1917]">{formatDateTime(order.updatedAt)}</p>
            </div>
          </div>

          <ul className="divide-y divide-[#ded5c8]">
            {order.items.map((item, idx) => (
              <li key={`${item.slug}-${idx}`} className="flex items-center gap-4 py-4">
                <SafeImage
                  src={item.imageUrl}
                  alt={item.title}
                  className="h-16 w-20 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1c1917]">{item.title}</p>
                  <p className="mt-0.5 text-xs text-[#78716c]">
                    Qty {item.quantity}
                    {Object.values(item.selectedOptions).length > 0
                      ? ` · ${Object.values(item.selectedOptions).join(' · ')}`
                      : ''}
                  </p>
                </div>
                <p className="font-mono text-sm text-[#1c1917] tabular-nums">
                  {formatInr(item.unitPriceInr * item.quantity)}
                </p>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-[#ded5c8] pt-4 text-sm">
            <div className="flex justify-between text-[#57534e]">
              <dt>Subtotal</dt>
              <dd className="font-mono tabular-nums">{formatInr(order.subtotalInr)}</dd>
            </div>
            {order.discountInr > 0 && (
              <div className="flex justify-between text-[#2e4a3d]">
                <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt>
                <dd className="font-mono tabular-nums">−{formatInr(order.discountInr)}</dd>
              </div>
            )}
            <div className="flex justify-between text-[#57534e]">
              <dt>Shipping</dt>
              <dd className="font-mono tabular-nums">
                {order.shippingInr === 0 ? 'Complimentary' : formatInr(order.shippingInr)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-[#ded5c8] pt-2.5 font-medium text-[#1c1917]">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{formatInr(order.totalInr)}</dd>
            </div>
          </dl>
        </section>
      )}
    </main>
  );
}

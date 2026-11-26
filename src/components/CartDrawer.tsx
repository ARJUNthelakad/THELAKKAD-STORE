import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { submitOrder } from '../lib/api';
import { formatInr, PAYMENT_METHOD_LABELS } from '../lib/format';
import { useRouter } from '../lib/router';
import type { Order, PaymentMethod } from '../shared/types';
import { SafeImage } from './SafeImage';

type DrawerStep = 'bag' | 'checkout' | 'confirmed';

export function CartDrawer() {
  const { navigate } = useRouter();
  const {
    cart,
    cartSubtotal,
    cartOpen,
    setCartOpen,
    updateCartQuantity,
    removeCartItem,
    clearCart,
    coupons,
    settings,
    refreshStore,
    showToast,
  } = useStore();

  const [step, setStep] = useState<DrawerStep>('bag');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [stateName, setStateName] = useState('Maharashtra');
  const [pincode, setPincode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);

  const pricing = useMemo(() => {
    let discountInr = 0;
    let shippingInr =
      cartSubtotal >= settings.freeShippingThresholdInr || cartSubtotal === 0
        ? 0
        : settings.flatShippingInr;

    const activeCoupon = appliedCouponCode
      ? coupons.find((c) => c.code === appliedCouponCode && c.active)
      : undefined;

    if (activeCoupon && cartSubtotal >= activeCoupon.minSubtotalInr) {
      if (activeCoupon.kind === 'percent') {
        discountInr = Math.round((cartSubtotal * activeCoupon.value) / 100);
      } else if (activeCoupon.kind === 'flat') {
        discountInr = Math.min(cartSubtotal, activeCoupon.value);
      } else if (activeCoupon.kind === 'shipping') {
        shippingInr = 0;
      }
    }

    const totalInr = Math.max(0, cartSubtotal - discountInr + shippingInr);
    return { discountInr, shippingInr, totalInr, activeCoupon };
  }, [appliedCouponCode, cartSubtotal, coupons, settings]);

  if (!cartOpen) return null;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setAppliedCouponCode(null);
      setCouponFeedback(null);
      return;
    }
    const found = coupons.find((c) => c.code === code && c.active);
    if (!found) {
      setCouponFeedback('Code not recognised.');
      return;
    }
    if (cartSubtotal < found.minSubtotalInr) {
      setCouponFeedback(
        `Add ${formatInr(found.minSubtotalInr - cartSubtotal)} more to use ${found.code}.`
      );
      return;
    }
    setAppliedCouponCode(found.code);
    setCouponFeedback(`${found.code} applied — ${found.description}`);
  };

  const handleClose = () => {
    setCartOpen(false);
    if (step === 'confirmed') {
      setStep('bag');
      setConfirmedOrder(null);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    setSubmitting(true);
    try {
      const { order } = await submitOrder({
        customer: {
          name,
          email,
          phone,
          addressLine1,
          addressLine2,
          city,
          state: stateName,
          pincode,
        },
        paymentMethod,
        items: cart.map((item) => ({
          slug: item.slug,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
        })),
        couponCode: pricing.activeCoupon ? pricing.activeCoupon.code : null,
        note,
      });
      setConfirmedOrder(order);
      clearCart();
      setAppliedCouponCode(null);
      setCouponInput('');
      setCouponFeedback(null);
      setStep('confirmed');
      await refreshStore();
      showToast(`Order ${order.reference} confirmed.`);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Unable to complete order.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyRef = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 1800);
    } catch {
      showToast(`Reference: ${ref}`);
    }
  };

  const remainingForFreeShip = Math.max(0, settings.freeShippingThresholdInr - cartSubtotal);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Shopping Bag">
      <div
        className="fixed inset-0 bg-[#1c1917]/40 backdrop-blur-[1px]"
        onClick={handleClose}
      />

      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[#ded5c8] bg-[#fcf9f5]">
        <div className="flex items-center justify-between border-b border-[#ded5c8] px-6 py-4">
          <div className="flex items-center gap-3">
            {step === 'checkout' && (
              <button
                type="button"
                onClick={() => setStep('bag')}
                className="cursor-pointer text-[#57534e] hover:text-[#1c1917]"
                aria-label="Back to bag"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="font-serif text-2xl font-medium text-[#1c1917]">
              {step === 'bag' && 'Your Bag'}
              {step === 'checkout' && 'Checkout'}
              {step === 'confirmed' && 'Order Confirmed'}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close bag"
            className="flex h-8 w-8 cursor-pointer items-center justify-center text-[#57534e] hover:text-[#1c1917]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 'bag' && (
          <>
            {cart.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <ShoppingBag className="h-8 w-8 stroke-[1.25] text-[#78716c]" />
                <p className="mt-4 font-serif text-xl text-[#1c1917]">Your bag is empty</p>
                <p className="mt-2 text-sm text-[#57534e]">
                  Explore kitchen appliances, contemporary dresses, tailored fashion, and leather accessories.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    navigate('/#collection');
                  }}
                  className="mt-6 cursor-pointer border border-[#1c1917] px-5 py-2.5 text-xs font-medium tracking-wider uppercase text-[#1c1917] transition-colors hover:bg-[#1c1917] hover:text-[#f6f1ea]"
                >
                  Browse Store
                </button>
              </div>
            ) : (
              <>
                <div className="border-b border-[#ded5c8] bg-[#f6f1ea] px-6 py-2.5 text-xs text-[#57534e] tabular-nums">
                  {remainingForFreeShip > 0
                    ? `Add ${formatInr(remainingForFreeShip)} more for complimentary studio courier.`
                    : 'Your order qualifies for complimentary studio courier across India.'}
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  <ul className="divide-y divide-[#ded5c8]">
                    {cart.map((item) => {
                      const optSummary = Object.entries(item.selectedOptions)
                        .map(([, val]) => val)
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li key={item.key} className="flex gap-4 py-4">
                          <SafeImage
                            src={item.imageUrl}
                            alt={item.title}
                            className="h-20 w-24 shrink-0 object-cover"
                          />
                          <div className="flex min-w-0 flex-1 flex-col justify-between">
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-[#1c1917]">{item.title}</p>
                                <button
                                  type="button"
                                  onClick={() => removeCartItem(item.key)}
                                  aria-label={`Remove ${item.title}`}
                                  className="cursor-pointer text-[#78716c] hover:text-[#1c1917]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {optSummary && (
                                <p className="mt-0.5 text-xs text-[#78716c]">{optSummary}</p>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-between">
                              <div className="inline-flex items-center border border-[#ded5c8] bg-[#f6f1ea]">
                                <button
                                  type="button"
                                  onClick={() => updateCartQuantity(item.key, item.quantity - 1)}
                                  aria-label="Decrease quantity"
                                  className="flex h-7 w-7 cursor-pointer items-center justify-center text-[#1c1917] hover:bg-[#ebe3d7]"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-8 text-center font-mono text-xs tabular-nums">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  disabled={item.quantity >= item.maxStock}
                                  onClick={() => updateCartQuantity(item.key, item.quantity + 1)}
                                  aria-label="Increase quantity"
                                  className="flex h-7 w-7 cursor-pointer items-center justify-center text-[#1c1917] hover:bg-[#ebe3d7] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                              <p className="font-mono text-sm text-[#1c1917] tabular-nums">
                                {formatInr(item.priceInr * item.quantity)}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <form onSubmit={handleApplyCoupon} className="mt-4 border-t border-[#ded5c8] pt-4">
                    <label
                      htmlFor="bag-coupon"
                      className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
                    >
                      Promo Code
                    </label>
                    <div className="mt-2 flex gap-2">
                      <input
                        id="bag-coupon"
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value)}
                        placeholder="e.g. WELCOME10"
                        className="flex-1 border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-xs uppercase text-[#1c1917] placeholder:normal-case placeholder:text-[#78716c] focus:border-[#1c1917] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="cursor-pointer border border-[#1c1917] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[#1c1917] hover:bg-[#1c1917] hover:text-[#f6f1ea]"
                      >
                        Apply
                      </button>
                    </div>
                    {couponFeedback && (
                      <p className="mt-1.5 text-xs text-[#57534e]">{couponFeedback}</p>
                    )}
                  </form>
                </div>

                <div className="border-t border-[#ded5c8] bg-[#f6f1ea] px-6 py-5">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between text-[#57534e]">
                      <dt>Subtotal</dt>
                      <dd className="font-mono tabular-nums">{formatInr(cartSubtotal)}</dd>
                    </div>
                    {pricing.discountInr > 0 && (
                      <div className="flex justify-between text-[#2e4a3d]">
                        <dt>Discount ({pricing.activeCoupon?.code})</dt>
                        <dd className="font-mono tabular-nums">−{formatInr(pricing.discountInr)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between text-[#57534e]">
                      <dt>Insured Courier</dt>
                      <dd className="font-mono tabular-nums">
                        {pricing.shippingInr === 0 ? 'Complimentary' : formatInr(pricing.shippingInr)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-[#ded5c8] pt-2.5 text-base font-medium text-[#1c1917]">
                      <dt>Total</dt>
                      <dd className="font-mono tabular-nums">{formatInr(pricing.totalInr)}</dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    onClick={() => setStep('checkout')}
                    className="mt-5 w-full cursor-pointer bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] transition-colors hover:bg-[#352f2c]"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'checkout' && (
          <form onSubmit={handlePlaceOrder} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {checkoutError && (
                <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-3.5 py-2.5 text-xs text-[#991b1b]">
                  {checkoutError}
                </div>
              )}

              <div>
                <p className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Contact & Delivery
                </p>
                <div className="mt-3 space-y-3">
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                    <input
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone (+91 ...)"
                      className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                  <input
                    required
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Street address, apartment or house no."
                    className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                  />
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Landmark (optional)"
                    className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2.5">
                    <input
                      required
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                    <input
                      required
                      type="text"
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      placeholder="State"
                      className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                    <input
                      required
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="Pincode"
                      className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 font-mono text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Payment Method
                </p>
                <div className="mt-2.5 grid grid-cols-1 gap-2">
                  {(['upi', 'card', 'cod'] as PaymentMethod[]).map((method) => (
                    <label
                      key={method}
                      className={`flex cursor-pointer items-center justify-between border px-3.5 py-2.5 text-sm transition-colors ${
                        paymentMethod === method
                          ? 'border-[#1c1917] bg-[#f6f1ea] text-[#1c1917]'
                          : 'border-[#ded5c8] bg-transparent text-[#57534e]'
                      }`}
                    >
                      <span>{PAYMENT_METHOD_LABELS[method]}</span>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method}
                        checked={paymentMethod === method}
                        onChange={() => setPaymentMethod(method)}
                        className="accent-[#1c1917]"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="checkout-note"
                  className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
                >
                  Studio Note (optional)
                </label>
                <textarea
                  id="checkout-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Gift message or delivery preference"
                  className="mt-2 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-[#ded5c8] bg-[#f6f1ea] px-6 py-4">
              <div className="mb-3 flex items-baseline justify-between text-sm">
                <span className="text-[#57534e]">Total payable</span>
                <span className="font-mono text-base font-medium text-[#1c1917] tabular-nums">
                  {formatInr(pricing.totalInr)}
                </span>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full cursor-pointer bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] transition-colors hover:bg-[#352f2c] disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? 'Placing Order…' : 'Place Order'}
              </button>
            </div>
          </form>
        )}

        {step === 'confirmed' && confirmedOrder && (
          <div className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-8">
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-[#2e4a3d]">
                Order Confirmed
              </p>
              <h3 className="mt-2 font-serif text-3xl font-medium text-[#1c1917]">
                Thank you, {confirmedOrder.customer.name.split(' ')[0]}.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#57534e]">
                Your items are reserved and being prepared for dispatch. Save your reference number
                to track packing and delivery updates anytime.
              </p>

              <div className="mt-6 border border-[#ded5c8] bg-[#f6f1ea] p-4">
                <p className="text-xs tracking-wider uppercase text-[#78716c]">Order Reference</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="font-mono text-xl font-medium text-[#1c1917] tabular-nums">
                    {confirmedOrder.reference}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyRef(confirmedOrder.reference)}
                    className="inline-flex cursor-pointer items-center gap-1.5 border border-[#ded5c8] bg-[#fcf9f5] px-3 py-1.5 text-xs text-[#1c1917] hover:border-[#1c1917]"
                  >
                    {copiedRef ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedRef ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <dl className="mt-6 space-y-2 border-t border-[#ded5c8] pt-4 text-sm">
                <div className="flex justify-between text-[#57534e]">
                  <dt>Items</dt>
                  <dd className="tabular-nums">
                    {confirmedOrder.items.reduce((s, i) => s + i.quantity, 0)} piece(s)
                  </dd>
                </div>
                <div className="flex justify-between text-[#57534e]">
                  <dt>Payment</dt>
                  <dd>{PAYMENT_METHOD_LABELS[confirmedOrder.paymentMethod]}</dd>
                </div>
                <div className="flex justify-between font-medium text-[#1c1917]">
                  <dt>Total</dt>
                  <dd className="font-mono tabular-nums">{formatInr(confirmedOrder.totalInr)}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-8 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  const ref = confirmedOrder.reference;
                  handleClose();
                  navigate(`/orders/${encodeURIComponent(ref)}`);
                }}
                className="w-full cursor-pointer bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
              >
                Track This Order
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="w-full cursor-pointer border border-[#ded5c8] py-3 text-xs font-medium tracking-wider uppercase text-[#1c1917] hover:border-[#1c1917]"
              >
                Continue Exploring
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

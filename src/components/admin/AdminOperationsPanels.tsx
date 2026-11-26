import React, { useMemo, useState } from 'react';
import { Check, Copy, Mail, Send, Star, Trash2 } from 'lucide-react';
import {
  changeOwnPassword,
  createAdminStaff,
  deleteAdminReview,
  deleteAdminStaff,
  patchAdminOrderStatus,
  resendStaffVerificationAdmin,
  saveAdminSettings,
  sendAdminTestMail,
} from '../../lib/api';
import {
  formatDateTime,
  formatInr,
  formatShortDate,
  ORDER_STATUS_META,
  PAYMENT_METHOD_LABELS,
} from '../../lib/format';
import type {
  Order,
  OrderStatus,
  Product,
  ProductReview,
  StaffMember,
  StaffRole,
  StoreSettings,
} from '../../shared/types';

export function OverviewPanel({
  orders,
  products,
  onNavigateTab,
}: {
  orders: Order[];
  products: Product[];
  onNavigateTab: (tab: 'orders' | 'products') => void;
}) {
  const nonCancelled = orders.filter((o) => o.status !== 'cancelled');
  const totalRevenue = nonCancelled.reduce((sum, o) => sum + o.totalInr, 0);
  const activeProducts = products.filter((p) => !p.archived);
  const lowStock = activeProducts.filter((p) => p.stock <= 4);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-[#ded5c8] bg-[#fcf9f5] p-5">
          <p className="text-xs tracking-wider uppercase text-[#78716c]">Studio Revenue</p>
          <p className="mt-2 font-mono text-2xl font-medium text-[#1c1917] tabular-nums">
            {formatInr(totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-[#78716c]">
            Across {nonCancelled.length} active order(s)
          </p>
        </div>
        <div className="border border-[#ded5c8] bg-[#fcf9f5] p-5">
          <p className="text-xs tracking-wider uppercase text-[#78716c]">Total Orders</p>
          <p className="mt-2 font-mono text-2xl font-medium text-[#1c1917] tabular-nums">
            {orders.length}
          </p>
          <p className="mt-1 text-xs text-[#78716c]">
            {orders.filter((o) => o.status === 'confirmed' || o.status === 'packed').length}{' '}
            awaiting dispatch
          </p>
        </div>
        <div className="border border-[#ded5c8] bg-[#fcf9f5] p-5">
          <p className="text-xs tracking-wider uppercase text-[#78716c]">Live Pieces</p>
          <p className="mt-2 font-mono text-2xl font-medium text-[#1c1917] tabular-nums">
            {activeProducts.length}
          </p>
          <p className="mt-1 text-xs text-[#78716c]">
            {products.filter((p) => p.archived).length} archived
          </p>
        </div>
        <div className="border border-[#ded5c8] bg-[#fcf9f5] p-5">
          <p className="text-xs tracking-wider uppercase text-[#78716c]">Low Stock (≤ 4)</p>
          <p className="mt-2 font-mono text-2xl font-medium text-[#8c4a2f] tabular-nums">
            {lowStock.length}
          </p>
          <p className="mt-1 text-xs text-[#78716c]">Pieces nearing batch end</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="border border-[#ded5c8] bg-[#fcf9f5] lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#ded5c8] px-5 py-3.5">
            <h3 className="font-serif text-lg text-[#1c1917]">Recent Orders</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('orders')}
              className="cursor-pointer text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[#1c1917]"
            >
              Manage All
            </button>
          </div>
          <div className="divide-y divide-[#ded5c8]">
            {orders.slice(0, 6).map((o) => (
              <div key={o.reference} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
                <div>
                  <p className="font-mono text-xs font-medium text-[#1c1917]">{o.reference}</p>
                  <p className="text-xs text-[#57534e]">
                    {o.customer.name} · {o.customer.city}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs font-medium text-[#1c1917] tabular-nums">
                    {formatInr(o.totalInr)}
                  </p>
                  <p className={`text-xs ${ORDER_STATUS_META[o.status].toneClass}`}>
                    {ORDER_STATUS_META[o.status].label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#ded5c8] bg-[#fcf9f5] lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#ded5c8] px-5 py-3.5">
            <h3 className="font-serif text-lg text-[#1c1917]">Low Stock Watch</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('products')}
              className="cursor-pointer text-xs font-medium tracking-wider uppercase text-[#57534e] hover:text-[#1c1917]"
            >
              Inventory
            </button>
          </div>
          {lowStock.length === 0 ? (
            <p className="px-5 py-8 text-xs text-[#78716c]">All active pieces have healthy stock.</p>
          ) : (
            <div className="divide-y divide-[#ded5c8]">
              {lowStock.map((p) => (
                <div key={p.slug} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div>
                    <p className="text-[#1c1917]">{p.title}</p>
                    <p className="font-mono text-xs text-[#78716c]">{p.sku}</p>
                  </div>
                  <span className="font-mono text-xs font-medium text-[#8c4a2f] tabular-nums">
                    {p.stock} left
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrdersPanel({
  orders,
  onRefresh,
  onNotice,
}: {
  orders: Order[];
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [search, setSearch] = useState('');
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [updatingRef, setUpdatingRef] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.reference.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.email.toLowerCase().includes(q) ||
        o.customer.city.toLowerCase().includes(q)
      );
    });
  }, [orders, statusFilter, search]);

  const handleStatusChange = async (reference: string, status: OrderStatus) => {
    setUpdatingRef(reference);
    try {
      await patchAdminOrderStatus(reference, status);
      await onRefresh();
      onNotice(`Order ${reference} marked as ${ORDER_STATUS_META[status].label}.`);
    } finally {
      setUpdatingRef(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference, customer, city…"
          className="w-64 border border-[#ded5c8] bg-[#fcf9f5] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
          className="border border-[#ded5c8] bg-[#fcf9f5] px-3 py-2 text-xs text-[#1c1917]"
        >
          <option value="all">All Statuses</option>
          {(['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'] as OrderStatus[]).map(
            (st) => (
              <option key={st} value={st}>
                {ORDER_STATUS_META[st].label}
              </option>
            )
          )}
        </select>
      </div>

      <div className="divide-y divide-[#ded5c8] border border-[#ded5c8] bg-[#fcf9f5]">
        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-[#78716c]">No matching orders.</p>
        ) : (
          filtered.map((o) => {
            const expanded = expandedRef === o.reference;
            return (
              <div key={o.reference} className="p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => setExpandedRef(expanded ? null : o.reference)}
                    className="cursor-pointer text-left"
                  >
                    <p className="font-mono text-sm font-medium text-[#1c1917]">
                      {o.reference}{' '}
                      <span className="font-sans text-xs font-normal text-[#78716c]">
                        · {formatDateTime(o.createdAt)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-[#57534e]">
                      {o.customer.name} ({o.customer.email}) · {o.customer.city}, {o.customer.state}
                    </p>
                  </button>

                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-medium text-[#1c1917] tabular-nums">
                      {formatInr(o.totalInr)}
                    </span>
                    <select
                      disabled={updatingRef === o.reference}
                      value={o.status}
                      onChange={(e) =>
                        void handleStatusChange(o.reference, e.target.value as OrderStatus)
                      }
                      aria-label={`Status for ${o.reference}`}
                      className="border border-[#ded5c8] bg-[#f6f1ea] px-2.5 py-1.5 text-xs text-[#1c1917]"
                    >
                      {(
                        ['confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'] as OrderStatus[]
                      ).map((st) => (
                        <option key={st} value={st}>
                          {ORDER_STATUS_META[st].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-4 grid grid-cols-1 gap-6 border-t border-[#ded5c8] pt-4 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-medium tracking-wider uppercase text-[#78716c]">
                        Shipping Address
                      </p>
                      <p className="mt-1.5 text-[#1c1917]">{o.customer.name}</p>
                      <p className="text-[#57534e]">{o.customer.addressLine1}</p>
                      {o.customer.addressLine2 && (
                        <p className="text-[#57534e]">{o.customer.addressLine2}</p>
                      )}
                      <p className="text-[#57534e]">
                        {o.customer.city}, {o.customer.state} {o.customer.pincode}
                      </p>
                      <p className="mt-1 font-mono text-[#78716c]">{o.customer.phone}</p>
                      <p className="mt-2 text-[#57534e]">
                        Payment: {PAYMENT_METHOD_LABELS[o.paymentMethod]}
                        {o.couponCode ? ` · Code ${o.couponCode}` : ''}
                      </p>
                      {o.note && <p className="mt-2 text-[#1c1917]">Note: {o.note}</p>}
                    </div>
                    <div>
                      <p className="font-medium tracking-wider uppercase text-[#78716c]">Items</p>
                      <ul className="mt-1.5 space-y-1.5">
                        {o.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between gap-2 text-[#1c1917]">
                            <span>
                              {item.quantity} × {item.title}
                            </span>
                            <span className="font-mono tabular-nums">
                              {formatInr(item.unitPriceInr * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function StaffPanel({
  currentStaff,
  staffList,
  onRefresh,
  onNotice,
}: {
  currentStaff: StaffMember;
  staffList: StaffMember[];
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('staff');
  const [password, setPassword] = useState('');
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerifyLink(null);
    setSaving(true);
    try {
      const res = await createAdminStaff({ name, email, role, password });
      setName('');
      setEmail('');
      setPassword('');
      if (res.verifyLink) {
        setVerifyLink(res.verifyLink);
      }
      await onRefresh();
      onNotice(
        res.mailSent
          ? `Invitation sent to ${res.staff.email}.`
          : `Staff added. Share the verification link below with ${res.staff.email}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add staff.');
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async (member: StaffMember) => {
    setError(null);
    setVerifyLink(null);
    try {
      const res = await resendStaffVerificationAdmin(member.id);
      if (res.verifyLink) setVerifyLink(res.verifyLink);
      onNotice(
        res.mailSent
          ? `Verification email re-sent to ${member.email}.`
          : `Fresh verification link ready for ${member.email}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification.');
    }
  };

  const handleDelete = async (member: StaffMember) => {
    setError(null);
    try {
      await deleteAdminStaff(member.id);
      await onRefresh();
      onNotice(`Removed ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove staff.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);
    setError(null);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPwMessage('Your password has been updated.');
      onNotice('Password updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password.');
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-2.5 text-xs text-[#991b1b]">
          {error}
        </div>
      )}

      {verifyLink && (
        <div className="border border-[#2e4a3d]/40 bg-[#fcf9f5] p-4">
          <p className="text-xs font-medium tracking-wider uppercase text-[#2e4a3d]">
            Verification Link (Copy & Share)
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={verifyLink}
              className="flex-1 border border-[#ded5c8] bg-[#f6f1ea] px-3 py-1.5 font-mono text-xs text-[#1c1917]"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(verifyLink).catch(() => {});
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 bg-[#1c1917] px-3 py-1.5 text-xs text-[#f6f1ea]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          {currentStaff.role === 'admin' && (
            <div className="divide-y divide-[#ded5c8] border border-[#ded5c8] bg-[#fcf9f5]">
              {staffList.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-medium text-[#1c1917]">
                      {member.name}{' '}
                      <span className="font-mono text-xs font-normal uppercase text-[#78716c]">
                        · {member.role}
                      </span>
                    </p>
                    <p className="text-xs text-[#57534e]">
                      {member.email} · {member.verified ? 'Verified' : 'Pending verification'} ·
                      Joined {formatShortDate(member.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!member.verified && (
                      <button
                        type="button"
                        onClick={() => void handleResend(member)}
                        className="inline-flex cursor-pointer items-center gap-1 border border-[#ded5c8] px-2.5 py-1 text-xs text-[#1c1917] hover:border-[#1c1917]"
                      >
                        <Mail className="h-3 w-3" />
                        Verify Link
                      </button>
                    )}
                    {member.id !== currentStaff.id && (
                      <button
                        type="button"
                        onClick={() => void handleDelete(member)}
                        aria-label={`Remove ${member.email}`}
                        className="cursor-pointer border border-[#ded5c8] p-1.5 text-[#991b1b] hover:border-[#991b1b]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleChangePassword}
            className="space-y-4 border border-[#ded5c8] bg-[#fcf9f5] p-6"
          >
            <h3 className="font-serif text-xl font-normal text-[#1c1917]">Change Your Password</h3>
            {pwMessage && <p className="text-xs text-[#2e4a3d]">{pwMessage}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
              />
              <input
                required
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 8 chars)"
                className="border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
              />
            </div>
            <button
              type="submit"
              className="cursor-pointer border border-[#1c1917] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[#1c1917] hover:bg-[#1c1917] hover:text-[#f6f1ea]"
            >
              Update Password
            </button>
          </form>
        </div>

        {currentStaff.role === 'admin' && (
          <form
            onSubmit={handleAddStaff}
            className="h-fit space-y-4 border border-[#ded5c8] bg-[#fcf9f5] p-6 lg:col-span-5"
          >
            <h3 className="font-serif text-xl font-normal text-[#1c1917]">Invite Studio Staff</h3>
            <div>
              <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Name
              </label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
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
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as StaffRole)}
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
              >
                <option value="staff">Studio Staff</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Initial Password (min 8 chars)
              </label>
              <input
                required
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full cursor-pointer bg-[#1c1917] py-2.5 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
            >
              Add Staff Member
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function SettingsPanel({
  settings,
  mailConfigured,
  role,
  staffEmail,
  onRefresh,
  onNotice,
}: {
  settings: StoreSettings;
  mailConfigured: boolean;
  role: StaffRole;
  staffEmail: string;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [form, setForm] = useState<StoreSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [testingMail, setTestingMail] = useState(false);
  const [mailStatus, setMailStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await saveAdminSettings(form);
      await onRefresh();
      onNotice('Store settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestMail = async () => {
    setTestingMail(true);
    setMailStatus(null);
    try {
      const res = await sendAdminTestMail(staffEmail);
      setMailStatus(res.message);
    } catch (err) {
      setMailStatus(err instanceof Error ? err.message : 'Email diagnostic failed.');
    } finally {
      setTestingMail(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <form
        onSubmit={handleSave}
        className="space-y-4 border border-[#ded5c8] bg-[#fcf9f5] p-6 lg:col-span-8"
      >
        <h3 className="font-serif text-xl font-normal text-[#1c1917]">Studio Details & Shipping</h3>
        {error && (
          <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-3.5 py-2 text-xs text-[#991b1b]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Store Name
            </label>
            <input
              type="text"
              disabled={role !== 'admin'}
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Support Email
            </label>
            <input
              type="email"
              disabled={role !== 'admin'}
              value={form.supportEmail}
              onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Support Phone
            </label>
            <input
              type="text"
              disabled={role !== 'admin'}
              value={form.supportPhone}
              onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Free Shipping Above (INR)
            </label>
            <input
              type="number"
              disabled={role !== 'admin'}
              value={form.freeShippingThresholdInr}
              onChange={(e) =>
                setForm({ ...form, freeShippingThresholdInr: Number(e.target.value) })
              }
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Flat Courier Fee (INR)
            </label>
            <input
              type="number"
              disabled={role !== 'admin'}
              value={form.flatShippingInr}
              onChange={(e) => setForm({ ...form, flatShippingInr: Number(e.target.value) })}
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Studio Address
            </label>
            <input
              type="text"
              disabled={role !== 'admin'}
              value={form.studioAddress}
              onChange={(e) => setForm({ ...form, studioAddress: e.target.value })}
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
            Storefront Announcement
          </label>
          <input
            type="text"
            disabled={role !== 'admin'}
            value={form.announcement}
            onChange={(e) => setForm({ ...form, announcement: e.target.value })}
            className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
            Dispatch Window Copy
          </label>
          <input
            type="text"
            disabled={role !== 'admin'}
            value={form.dispatchWindow}
            onChange={(e) => setForm({ ...form, dispatchWindow: e.target.value })}
            className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
          />
        </div>

        {role === 'admin' && (
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer bg-[#1c1917] px-5 py-2.5 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
          >
            {saving ? 'Saving…' : 'Save Store Settings'}
          </button>
        )}
      </form>

      <div className="h-fit space-y-4 border border-[#ded5c8] bg-[#fcf9f5] p-6 lg:col-span-4">
        <h3 className="font-serif text-xl font-normal text-[#1c1917]">Transactional Email</h3>
        <p className="text-xs leading-relaxed text-[#57534e]">
          {mailConfigured
            ? 'Resend API key detected. Staff verification and password-reset links send directly via Resend.'
            : 'RESEND_API_KEY is not set. Verification and password-reset links appear inline in the admin UI as copyable links.'}
        </p>

        {role === 'admin' && (
          <button
            type="button"
            disabled={testingMail}
            onClick={() => void handleTestMail()}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 border border-[#1c1917] py-2.5 text-xs font-medium tracking-wider uppercase text-[#1c1917] hover:bg-[#1c1917] hover:text-[#f6f1ea] disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {testingMail ? 'Testing…' : 'Send Test Email'}
          </button>
        )}

        {mailStatus && (
          <p className="border border-[#ded5c8] bg-[#f6f1ea] p-3 text-xs text-[#1c1917]">
            {mailStatus}
          </p>
        )}
      </div>
    </div>
  );
}

export function ReviewsPanel({
  reviews,
  products,
  role,
  onRefresh,
  onNotice,
}: {
  reviews: ProductReview[];
  products: Product[];
  role: StaffRole;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | number>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const titleBySlug = useMemo(
    () => new Map(products.map((p) => [p.slug, p.title])),
    [products]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (ratingFilter !== 'all' && r.rating !== ratingFilter) return false;
      if (!q) return true;
      const productTitle = titleBySlug.get(r.slug) ?? r.slug;
      return (
        r.authorName.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        productTitle.toLowerCase().includes(q)
      );
    });
  }, [reviews, ratingFilter, search, titleBySlug]);

  const handleDelete = async (review: ProductReview) => {
    setError(null);
    setDeletingId(review.id);
    try {
      await deleteAdminReview(review.id);
      await onRefresh();
      onNotice(`Removed review by ${review.authorName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete review.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-2.5 text-xs text-[#991b1b]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, reviewer, or text…"
          className="w-64 border border-[#ded5c8] bg-[#fcf9f5] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
        />
        <select
          value={String(ratingFilter)}
          onChange={(e) =>
            setRatingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
          className="border border-[#ded5c8] bg-[#fcf9f5] px-3 py-2 text-xs text-[#1c1917]"
        >
          <option value="all">All Ratings ({reviews.length})</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={String(n)}>
              {n} Stars
            </option>
          ))}
        </select>
      </div>

      <div className="divide-y divide-[#ded5c8] border border-[#ded5c8] bg-[#fcf9f5]">
        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-[#78716c]">No matching reviews.</p>
        ) : (
          filtered.map((rev) => (
            <div key={rev.id} className="flex items-start justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#78716c]">
                  <span className="inline-flex items-center gap-0.5 text-[#8c4a2f]">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-3 w-3 ${
                          s <= rev.rating ? 'fill-current' : 'fill-transparent text-[#c8beb0]'
                        }`}
                      />
                    ))}
                  </span>
                  <span className="font-medium text-[#1c1917]">{rev.authorName}</span>
                  <span>·</span>
                  <span>{titleBySlug.get(rev.slug) ?? rev.slug}</span>
                  {rev.verifiedPurchase && (
                    <>
                      <span>·</span>
                      <span className="text-[#2e4a3d]">Verified Purchase</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{formatShortDate(rev.createdAt)}</span>
                </div>
                {rev.title && (
                  <p className="mt-1.5 text-sm font-medium text-[#1c1917]">{rev.title}</p>
                )}
                <p className="mt-1 text-xs leading-relaxed text-[#57534e]">{rev.comment}</p>
              </div>

              {role === 'admin' && (
                <button
                  type="button"
                  disabled={deletingId === rev.id}
                  onClick={() => void handleDelete(rev)}
                  aria-label={`Delete review by ${rev.authorName}`}
                  className="shrink-0 cursor-pointer border border-[#ded5c8] p-1.5 text-[#991b1b] hover:border-[#991b1b] disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

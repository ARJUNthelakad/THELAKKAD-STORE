import React, { useMemo, useState } from 'react';
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  createAdminCategory,
  createAdminCoupon,
  deleteAdminCategory,
  deleteAdminCoupon,
  deleteOrResetAdminProduct,
  patchAdminProductQuick,
  toggleAdminProductArchive,
  updateAdminCategory,
} from '../../lib/api';
import { formatInr } from '../../lib/format';
import type { Category, Coupon, CouponKind, Product, StaffRole } from '../../shared/types';
import { SafeImage } from '../SafeImage';
import { ProductEditorModal } from './ProductEditorModal';

interface ProductsPanelProps {
  products: Product[];
  categories: Category[];
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}

export function ProductsPanel({
  products,
  categories,
  onRefresh,
  onNotice,
}: ProductsPanelProps) {
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, { price: string; stock: string }>>(
    {}
  );
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.slug, c.name])), [categories]);

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showArchived && p.archived) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [products, search, showArchived]);

  const getDraft = (p: Product) =>
    inlineDrafts[p.slug] ?? { price: String(p.priceInr), stock: String(p.stock) };

  const handleInlineSave = async (p: Product) => {
    const draft = getDraft(p);
    setBusySlug(p.slug);
    setError(null);
    try {
      await patchAdminProductQuick(p.slug, {
        priceInr: Number(draft.price),
        stock: Number(draft.stock),
      });
      setInlineDrafts((prev) => {
        const next = { ...prev };
        delete next[p.slug];
        return next;
      });
      await onRefresh();
      onNotice(`Updated ${p.title}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setBusySlug(null);
    }
  };

  const handleToggleArchive = async (p: Product) => {
    setBusySlug(p.slug);
    setError(null);
    try {
      await toggleAdminProductArchive(p.slug, !p.archived);
      await onRefresh();
      onNotice(p.archived ? `Restored ${p.title}.` : `Archived ${p.title}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update archive status.');
    } finally {
      setBusySlug(null);
    }
  };

  const handleResetOrDelete = async (p: Product) => {
    setBusySlug(p.slug);
    setError(null);
    try {
      const res = await deleteOrResetAdminProduct(p.slug);
      await onRefresh();
      onNotice(
        res.action === 'deleted'
          ? `Deleted custom product "${p.title}".`
          : `Reset "${p.title}" to studio defaults.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusySlug(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title or SKU…"
            className="w-60 border border-[#ded5c8] bg-[#fcf9f5] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
          />
          <label className="flex items-center gap-2 text-xs text-[#57534e]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-[#1c1917]"
            />
            Show archived
          </label>
        </div>

        <button
          type="button"
          onClick={() => setCreatingProduct(true)}
          className="inline-flex cursor-pointer items-center gap-2 bg-[#1c1917] px-4 py-2.5 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Product
        </button>
      </div>

      {error && (
        <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-2.5 text-xs text-[#991b1b]">
          {error}
        </div>
      )}

      <div className="overflow-x-auto border border-[#ded5c8] bg-[#fcf9f5]">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead>
            <tr className="border-b border-[#ded5c8] bg-[#f6f1ea] text-xs tracking-wider uppercase text-[#78716c]">
              <th className="px-4 py-3 font-medium">Piece</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Price (INR)</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ded5c8]">
            {visibleProducts.map((p) => {
              const draft = getDraft(p);
              const dirty = draft.price !== String(p.priceInr) || draft.stock !== String(p.stock);
              const thumb = p.media.find((m) => m.kind === 'image')?.url ?? '';

              return (
                <tr key={p.slug} className={p.archived ? 'opacity-60' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <SafeImage src={thumb} alt={p.title} className="h-10 w-12 shrink-0 object-cover" />
                      <div>
                        <p className="font-medium text-[#1c1917]">{p.title}</p>
                        <p className="font-mono text-xs text-[#78716c]">{p.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#57534e]">
                    {categoryMap.get(p.category) ?? p.category}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={100}
                      max={500000}
                      value={draft.price}
                      onChange={(e) =>
                        setInlineDrafts((prev) => ({
                          ...prev,
                          [p.slug]: { ...draft, price: e.target.value },
                        }))
                      }
                      aria-label={`Price for ${p.title}`}
                      className="w-24 border border-[#ded5c8] bg-[#f6f1ea] px-2 py-1 font-mono text-xs text-[#1c1917] tabular-nums focus:border-[#1c1917] focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      value={draft.stock}
                      onChange={(e) =>
                        setInlineDrafts((prev) => ({
                          ...prev,
                          [p.slug]: { ...draft, stock: e.target.value },
                        }))
                      }
                      aria-label={`Stock for ${p.title}`}
                      className="w-16 border border-[#ded5c8] bg-[#f6f1ea] px-2 py-1 font-mono text-xs text-[#1c1917] tabular-nums focus:border-[#1c1917] focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-[#57534e]">
                    {p.archived
                      ? 'Archived'
                      : p.isCustom
                        ? 'Custom'
                        : p.hasOverride
                          ? 'Modified'
                          : 'Studio Default'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {dirty && (
                        <button
                          type="button"
                          disabled={busySlug === p.slug}
                          onClick={() => void handleInlineSave(p)}
                          className="cursor-pointer bg-[#1c1917] px-2.5 py-1 text-xs font-medium text-[#f6f1ea] hover:bg-[#352f2c]"
                        >
                          Save
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingProduct(p)}
                        title="Edit full product"
                        className="cursor-pointer border border-[#ded5c8] p-1.5 text-[#57534e] hover:border-[#1c1917] hover:text-[#1c1917]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busySlug === p.slug}
                        onClick={() => void handleToggleArchive(p)}
                        title={p.archived ? 'Restore product' : 'Archive product'}
                        className="cursor-pointer border border-[#ded5c8] p-1.5 text-[#57534e] hover:border-[#1c1917] hover:text-[#1c1917]"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      {(p.isCustom || p.hasOverride) && (
                        <button
                          type="button"
                          disabled={busySlug === p.slug}
                          onClick={() => void handleResetOrDelete(p)}
                          title={p.isCustom ? 'Delete custom product' : 'Reset overrides'}
                          className="cursor-pointer border border-[#ded5c8] p-1.5 text-[#991b1b] hover:border-[#991b1b]"
                        >
                          {p.isCustom ? (
                            <Trash2 className="h-3.5 w-3.5" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(creatingProduct || editingProduct) && (
        <ProductEditorModal
          product={editingProduct}
          categories={categories}
          onClose={() => {
            setCreatingProduct(false);
            setEditingProduct(null);
          }}
          onSaved={async () => {
            await onRefresh();
            onNotice(editingProduct ? 'Product updated.' : 'New studio product created.');
          }}
        />
      )}
    </div>
  );
}

interface CategoriesPanelProps {
  categories: Category[];
  products: Product[];
  role: StaffRole;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}

export function CategoriesPanel({
  categories,
  products,
  role,
  onRefresh,
  onNotice,
}: CategoriesPanelProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createAdminCategory({ name, description });
      setName('');
      setDescription('');
      await onRefresh();
      onNotice('Category added.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add category.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (slug: string) => {
    setError(null);
    setSaving(true);
    try {
      await updateAdminCategory(slug, { name: editName, description: editDesc });
      setEditingSlug(null);
      await onRefresh();
      onNotice('Category saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slug: string) => {
    setError(null);
    try {
      await deleteAdminCategory(slug);
      await onRefresh();
      onNotice('Category removed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete category.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="lg:col-span-7">
        {error && (
          <div className="mb-4 border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-2.5 text-xs text-[#991b1b]">
            {error}
          </div>
        )}
        <div className="divide-y divide-[#ded5c8] border border-[#ded5c8] bg-[#fcf9f5]">
          {categories.map((cat) => {
            const count = products.filter((p) => p.category === cat.slug).length;
            const isEditing = editingSlug === cat.slug;
            return (
              <div key={cat.slug} className="p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-1.5 text-sm text-[#1c1917]"
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-1.5 text-xs text-[#1c1917]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleUpdate(cat.slug)}
                        className="cursor-pointer bg-[#1c1917] px-3 py-1.5 text-xs text-[#f6f1ea]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingSlug(null)}
                        className="cursor-pointer border border-[#ded5c8] px-3 py-1.5 text-xs text-[#57534e]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-[#1c1917]">
                        {cat.name}{' '}
                        <span className="font-mono text-xs font-normal text-[#78716c]">
                          /{cat.slug} · {count} piece(s)
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-[#57534e]">{cat.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSlug(cat.slug);
                          setEditName(cat.name);
                          setEditDesc(cat.description);
                        }}
                        className="cursor-pointer border border-[#ded5c8] p-1.5 text-[#57534e] hover:border-[#1c1917] hover:text-[#1c1917]"
                        aria-label={`Edit ${cat.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(cat.slug)}
                          className="cursor-pointer border border-[#ded5c8] p-1.5 text-[#991b1b] hover:border-[#991b1b]"
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={handleCreate}
        className="h-fit space-y-4 border border-[#ded5c8] bg-[#fcf9f5] p-6 lg:col-span-5"
      >
        <h3 className="font-serif text-xl font-normal text-[#1c1917]">Add Category</h3>
        <div>
          <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
            Name
          </label>
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tableware"
            className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
            Description
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short studio description"
            className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full cursor-pointer bg-[#1c1917] py-2.5 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
        >
          Create Category
        </button>
      </form>
    </div>
  );
}

interface CouponsPanelProps {
  coupons: Coupon[];
  role: StaffRole;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}

export function CouponsPanel({ coupons, role, onRefresh, onNotice }: CouponsPanelProps) {
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<CouponKind>('percent');
  const [value, setValue] = useState('10');
  const [minSubtotalInr, setMinSubtotalInr] = useState('2500');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await createAdminCoupon({
        code,
        kind,
        value: kind === 'shipping' ? 0 : Number(value),
        minSubtotalInr: Number(minSubtotalInr),
        description,
      });
      setCode('');
      setDescription('');
      await onRefresh();
      onNotice('Coupon created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create coupon.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetCode: string) => {
    setError(null);
    try {
      await deleteAdminCoupon(targetCode);
      await onRefresh();
      onNotice(`Removed coupon ${targetCode}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete coupon.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="lg:col-span-7">
        {error && (
          <div className="mb-4 border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-2.5 text-xs text-[#991b1b]">
            {error}
          </div>
        )}
        <div className="divide-y divide-[#ded5c8] border border-[#ded5c8] bg-[#fcf9f5]">
          {coupons.map((c) => (
            <div key={c.code} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-mono text-sm font-medium text-[#1c1917]">
                  {c.code}{' '}
                  <span className="font-sans text-xs font-normal text-[#57534e]">
                    ·{' '}
                    {c.kind === 'percent'
                      ? `${c.value}% off`
                      : c.kind === 'flat'
                        ? `${formatInr(c.value)} off`
                        : 'Free shipping'}
                    {c.minSubtotalInr > 0 ? ` · Min ${formatInr(c.minSubtotalInr)}` : ''}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#78716c]">{c.description}</p>
              </div>
              {role === 'admin' && (
                <button
                  type="button"
                  onClick={() => void handleDelete(c.code)}
                  aria-label={`Delete ${c.code}`}
                  className="cursor-pointer border border-[#ded5c8] p-1.5 text-[#991b1b] hover:border-[#991b1b]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {role === 'admin' && (
        <form
          onSubmit={handleCreate}
          className="h-fit space-y-4 border border-[#ded5c8] bg-[#fcf9f5] p-6 lg:col-span-5"
        >
          <h3 className="font-serif text-xl font-normal text-[#1c1917]">New Studio Coupon</h3>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Code
            </label>
            <input
              required
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="MONSOON15"
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm uppercase text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Type
              </label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CouponKind)}
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
              >
                <option value="percent">Percent (%)</option>
                <option value="flat">Flat INR (₹)</option>
                <option value="shipping">Free Shipping</option>
              </select>
            </div>
            {kind !== 'shipping' && (
              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Value
                </label>
                <input
                  required
                  type="number"
                  min={1}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917]"
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Minimum Subtotal (INR)
            </label>
            <input
              type="number"
              min={0}
              value={minSubtotalInr}
              onChange={(e) => setMinSubtotalInr(e.target.value)}
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Seasonal studio offer"
              className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full cursor-pointer bg-[#1c1917] py-2.5 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
          >
            Create Coupon
          </button>
        </form>
      )}
    </div>
  );
}

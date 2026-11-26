import React, { useRef, useState } from 'react';
import { Film, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  cleanupProductMedia,
  createAdminProduct,
  updateAdminProduct,
  uploadProductMedia,
} from '../../lib/api';
import { sanitizeMediaUrl } from '../../lib/format';
import type { Category, Product, ProductMedia, ProductOption } from '../../shared/types';
import { SafeImage } from '../SafeImage';

interface ProductEditorModalProps {
  product: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read file.'));
      }
    };
    reader.onerror = () => reject(new Error('File read failed.'));
    reader.readAsDataURL(file);
  });
}

export function ProductEditorModal({
  product,
  categories,
  onClose,
  onSaved,
}: ProductEditorModalProps) {
  const isEditing = Boolean(product);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(product?.title ?? '');
  const [subtitle, setSubtitle] = useState(product?.subtitle ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [category, setCategory] = useState(
    product?.category ?? categories[0]?.slug ?? 'kitchen-appliances'
  );
  const [priceInr, setPriceInr] = useState(String(product?.priceInr ?? 4490));
  const [stock, setStock] = useState(String(product?.stock ?? 10));
  const [editionNote, setEditionNote] = useState(product?.editionNote ?? 'New Season Arrival');
  const [description, setDescription] = useState(product?.description ?? '');
  const [materials, setMaterials] = useState(product?.materials ?? '');
  const [dimensions, setDimensions] = useState(product?.dimensions ?? '');
  const [care, setCare] = useState(product?.care ?? '');
  const [featured, setFeatured] = useState(Boolean(product?.featured));

  const [media, setMedia] = useState<ProductMedia[]>(
    product?.media ?? [
      {
        id: 'm-default',
        kind: 'image',
        url: '/src/assets/images/prod_espresso_maker_1795715868210.jpg',
        alt: 'Thelakkad Store product',
      },
    ]
  );
  const [uploadedSessionUrls, setUploadedSessionUrls] = useState<string[]>([]);
  const [optionsText, setOptionsText] = useState(
    (product?.options ?? [])
      .map((o) => `${o.label}: ${o.values.join(', ')}`)
      .join('\n')
  );

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageCount = media.filter((m) => m.kind === 'image').length;
  const videoCount = media.filter((m) => m.kind === 'video').length;

  const handleCancel = async () => {
    if (uploadedSessionUrls.length > 0) {
      await cleanupProductMedia(uploadedSessionUrls).catch(() => {});
    }
    onClose();
  };

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);
    setUploading(true);

    try {
      const nextMedia: ProductMedia[] = [];
      const newlyUploaded: string[] = [];

      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const currentImages = imageCount + nextMedia.filter((m) => m.kind === 'image').length;
        const currentVideos = videoCount + nextMedia.filter((m) => m.kind === 'video').length;

        if (!isVideo && currentImages >= 8) {
          throw new Error('Maximum of 8 photos per product.');
        }
        if (isVideo && currentVideos >= 2) {
          throw new Error('Maximum of 2 videos per product.');
        }

        const dataBase64 = await readFileAsBase64(file);
        const res = await uploadProductMedia({
          mimeType: file.type,
          dataBase64,
          alt: title.trim() || file.name.replace(/\.[^.]+$/, ''),
        });
        nextMedia.push(res.media);
        newlyUploaded.push(res.media.url);
      }

      setMedia((prev) => [...prev, ...nextMedia]);
      setUploadedSessionUrls((prev) => [...prev, ...newlyUploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Media upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveMedia = (id: string) => {
    setMedia((prev) => prev.filter((m) => m.id !== id));
  };

  const parseOptions = (): ProductOption[] => {
    return optionsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return null;
        const label = line.slice(0, colonIdx).trim();
        const values = line
          .slice(colonIdx + 1)
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        return label && values.length > 0 ? { label, values } : null;
      })
      .filter((x): x is ProductOption => x !== null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (media.filter((m) => m.kind === 'image').length < 1) {
      setError('Include at least 1 product photo.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        slug: isEditing ? product!.slug : slug.trim() || undefined,
        sku: sku.trim() || undefined,
        title: title.trim(),
        subtitle: subtitle.trim(),
        category,
        priceInr: Number(priceInr),
        stock: Number(stock),
        editionNote: editionNote.trim(),
        description: description.trim(),
        materials: materials.trim(),
        dimensions: dimensions.trim(),
        care: care.trim(),
        options: parseOptions(),
        media,
        featured,
      };

      if (isEditing && product) {
        await updateAdminProduct(product.slug, payload);
      } else {
        await createAdminProduct(payload);
      }

      // Clean up any session-uploaded files that were removed before saving
      const keptUrls = new Set(media.map((m) => m.url));
      const orphans = uploadedSessionUrls.filter((u) => !keptUrls.has(u));
      if (orphans.length > 0) {
        await cleanupProductMedia(orphans).catch(() => {});
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-[#1c1917]/45" onClick={() => void handleCancel()} />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col border border-[#ded5c8] bg-[#fcf9f5]">
        <div className="flex items-center justify-between border-b border-[#ded5c8] px-6 py-4">
          <h2 className="font-serif text-2xl font-normal text-[#1c1917]">
            {isEditing ? `Edit ${product?.title}` : 'Add Studio Product'}
          </h2>
          <button
            type="button"
            onClick={() => void handleCancel()}
            aria-label="Close product editor"
            className="cursor-pointer text-[#57534e] hover:text-[#1c1917]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {error && (
              <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-3.5 py-2.5 text-xs text-[#991b1b]">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Title
                </label>
                <input
                  required
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                >
                  {categories.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Edition Note
                </label>
                <input
                  type="text"
                  value={editionNote}
                  onChange={(e) => setEditionNote(e.target.value)}
                  placeholder="2-Year Warranty · New Season"
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Price (INR)
                </label>
                <input
                  required
                  type="number"
                  min={100}
                  max={500000}
                  value={priceInr}
                  onChange={(e) => setPriceInr(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Stock
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  max={5000}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>

              {!isEditing && (
                <>
                  <div>
                    <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      URL Slug (optional)
                    </label>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="auto-generated-from-title"
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-xs text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      SKU (optional)
                    </label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="THL-STW-09"
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-xs uppercase text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Materials
                </label>
                <input
                  type="text"
                  value={materials}
                  onChange={(e) => setMaterials(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-xs text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Dimensions
                </label>
                <input
                  type="text"
                  value={dimensions}
                  onChange={(e) => setDimensions(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-xs text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Care
                </label>
                <input
                  type="text"
                  value={care}
                  onChange={(e) => setCare(e.target.value)}
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-xs text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                Variants / Options (one per line: Label: Value 1, Value 2)
              </label>
                <textarea
                  rows={2}
                  value={optionsText}
                  onChange={(e) => setOptionsText(e.target.value)}
                  placeholder="Size: XS, S, M, L, XL"
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-xs text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                />
            </div>

            {/* Media Gallery Uploader */}
            <div className="border-t border-[#ded5c8] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Photos & Videos ({imageCount}/8 photos · {videoCount}/2 videos)
                  </p>
                  <p className="mt-0.5 text-xs text-[#78716c]">
                    JPEG, PNG, WebP up to 4 MB · MP4, WebM up to 25 MB
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  onChange={(e) => void handleFileSelection(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex cursor-pointer items-center gap-2 border border-[#1c1917] bg-[#f6f1ea] px-3.5 py-2 text-xs font-medium tracking-wider uppercase text-[#1c1917] hover:bg-[#1c1917] hover:text-[#f6f1ea] disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading…' : 'Upload Media'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="group relative aspect-[4/3] overflow-hidden border border-[#ded5c8] bg-[#ebe3d7]"
                  >
                    {m.kind === 'video' ? (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-[#1c1917] text-[#f6f1ea]">
                        <Film className="h-5 w-5" />
                        <span className="mt-1 font-mono text-[10px] uppercase">Video</span>
                        <video
                          src={sanitizeMediaUrl(m.url)}
                          className="sr-only"
                          muted
                        />
                      </div>
                    ) : (
                      <SafeImage src={m.url} alt={m.alt} className="h-full w-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveMedia(m.id)}
                      aria-label="Remove media item"
                      className="absolute top-1.5 right-1.5 flex h-6 w-6 cursor-pointer items-center justify-center bg-[#1c1917]/80 text-[#f6f1ea] hover:bg-[#991b1b]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center border border-dashed border-[#ded5c8] text-xs text-[#78716c] hover:border-[#1c1917] hover:text-[#1c1917]"
                >
                  <Plus className="h-4 w-4" />
                  <span className="mt-1">Add file</span>
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#57534e]">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="accent-[#1c1917]"
              />
              Mark as featured studio piece
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-[#ded5c8] bg-[#f6f1ea] px-6 py-4">
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="cursor-pointer border border-[#ded5c8] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[#1c1917] hover:border-[#1c1917]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="cursor-pointer bg-[#1c1917] px-5 py-2 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c] disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

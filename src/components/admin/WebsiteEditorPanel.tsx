import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import {
  resetAdminWebsite,
  saveAdminSettings,
  saveAdminWebsite,
  uploadProductMedia,
} from '../../lib/api';
import { Link } from '../../lib/router';
import {
  CRAFT_IMAGE_URL,
  HERO_IMAGE_URL,
  WEBSITE_THEME_PRESETS,
} from '../../shared/catalog';
import type { StaffRole, StoreSettings, WebsiteContent } from '../../shared/types';
import { SafeImage } from '../SafeImage';

type EditorSection = 'theme' | 'header' | 'hero' | 'collection' | 'about' | 'footer';

const SECTION_TABS: Array<{ id: EditorSection; label: string }> = [
  { id: 'theme', label: 'Theme & Brand' },
  { id: 'header', label: 'Header' },
  { id: 'hero', label: 'Hero Banner' },
  { id: 'collection', label: 'Collection' },
  { id: 'about', label: 'About Section' },
  { id: 'footer', label: 'Footer' },
];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

interface WebsiteEditorPanelProps {
  website: WebsiteContent;
  settings: StoreSettings;
  role: StaffRole;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
}

export function WebsiteEditorPanel({
  website,
  settings,
  role,
  onRefresh,
  onNotice,
}: WebsiteEditorPanelProps) {
  const [section, setSection] = useState<EditorSection>('theme');
  const [draft, setDraft] = useState<WebsiteContent>(website);
  const [brandDraft, setBrandDraft] = useState<StoreSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<'hero' | 'about' | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroFileRef = useRef<HTMLInputElement | null>(null);
  const aboutFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(website);
  }, [website]);

  useEffect(() => {
    setBrandDraft(settings);
  }, [settings]);

  const isAdmin = role === 'admin';

  const handleImageUpload = async (slot: 'hero' | 'about', file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    setError(null);
    setUploadingSlot(slot);
    try {
      const dataBase64 = await readFileAsBase64(file);
      const res = await uploadProductMedia({
        mimeType: file.type,
        dataBase64,
        alt: slot === 'hero' ? draft.hero.imageAlt : draft.about.imageAlt,
      });
      if (slot === 'hero') {
        setDraft((prev) => ({
          ...prev,
          hero: { ...prev.hero, imageUrl: res.media.url },
        }));
      } else {
        setDraft((prev) => ({
          ...prev,
          about: { ...prev.about, imageUrl: res.media.url },
        }));
      }
      onNotice('Banner image uploaded. Click "Publish Website Changes" to make it live.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload image.');
    } finally {
      setUploadingSlot(null);
      if (heroFileRef.current) heroFileRef.current.value = '';
      if (aboutFileRef.current) aboutFileRef.current.value = '';
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setError(null);
    setSaving(true);
    try {
      await Promise.all([saveAdminWebsite(draft), saveAdminSettings(brandDraft)]);
      await onRefresh();
      onNotice('Storefront website updated and published live.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish website changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!isAdmin) return;
    setError(null);
    setSaving(true);
    try {
      const res = await resetAdminWebsite();
      setDraft(res.website);
      setConfirmingReset(false);
      await onRefresh();
      onNotice('Website content and theme restored to defaults.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset website.');
    } finally {
      setSaving(false);
    }
  };

  const updateHighlight = (index: number, field: 'title' | 'description', value: string) => {
    setDraft((prev) => ({
      ...prev,
      about: {
        ...prev.about,
        highlights: prev.about.highlights.map((h, i) =>
          i === index ? { ...h, [field]: value } : h
        ),
      },
    }));
  };

  const addHighlight = () => {
    if (draft.about.highlights.length >= 4) return;
    setDraft((prev) => ({
      ...prev,
      about: {
        ...prev.about,
        highlights: [...prev.about.highlights, { title: 'New Highlight', description: '' }],
      },
    }));
  };

  const removeHighlight = (index: number) => {
    if (draft.about.highlights.length <= 1) return;
    setDraft((prev) => ({
      ...prev,
      about: {
        ...prev.about,
        highlights: prev.about.highlights.filter((_, i) => i !== index),
      },
    }));
  };

  return (
    <form onSubmit={handlePublish} className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col justify-between gap-4 border border-[#ded5c8] bg-[#fcf9f5] p-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-[#1c1917]">Full Storefront Website Editor</p>
          <p className="text-xs text-[#57534e]">
            Edit colors, header navigation, hero banner, images, sections, and footer copy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 border border-[#ded5c8] bg-[#f6f1ea] px-3.5 py-2 text-xs font-medium tracking-wider uppercase text-[#1c1917] hover:border-[#1c1917]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Live Site
          </Link>

          {isAdmin && !confirmingReset && (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-[#ded5c8] px-3.5 py-2 text-xs font-medium tracking-wider uppercase text-[#57534e] hover:border-[#1c1917] hover:text-[#1c1917]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
          )}

          {isAdmin && confirmingReset && (
            <div className="flex items-center gap-2 border border-[#991b1b]/40 bg-[#fef2f2] px-2.5 py-1.5">
              <span className="text-xs text-[#991b1b]">Reset all edits?</span>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleReset()}
                className="cursor-pointer bg-[#991b1b] px-2.5 py-1 text-xs font-medium text-white"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="cursor-pointer px-2 py-1 text-xs text-[#57534e]"
              >
                Cancel
              </button>
            </div>
          )}

          {isAdmin && (
            <button
              type="submit"
              disabled={saving || uploadingSlot !== null}
              className="inline-flex cursor-pointer items-center gap-2 bg-[#1c1917] px-4 py-2 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Publishing…' : 'Publish Website Changes'}
            </button>
          )}
        </div>
      </div>

      {!isAdmin && (
        <div className="border border-[#ded5c8] bg-[#fcf9f5] px-4 py-3 text-xs text-[#57534e]">
          You are viewing in read-only staff mode. Administrator privileges are required to publish
          website changes.
        </div>
      )}

      {error && (
        <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-4 py-2.5 text-xs text-[#991b1b]">
          {error}
        </div>
      )}

      {/* Section Sub-Navigation */}
      <div
        role="tablist"
        aria-label="Website editor sections"
        className="flex flex-wrap items-center gap-1 border-b border-[#ded5c8]"
      >
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            onClick={() => setSection(tab.id)}
            className={`cursor-pointer border-b-2 px-4 py-2.5 text-xs font-medium tracking-wider uppercase transition-colors ${
              section === tab.id
                ? 'border-[#1c1917] text-[#1c1917]'
                : 'border-transparent text-[#78716c] hover:text-[#1c1917]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Editor Controls */}
        <div className="space-y-5 border border-[#ded5c8] bg-[#fcf9f5] p-6 lg:col-span-7">
          {section === 'theme' && (
            <>
              <div>
                <h3 className="font-serif text-xl font-normal text-[#1c1917]">Brand Identity</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      Storefront Title / Logo Text
                    </label>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={brandDraft.storeName}
                      onChange={(e) =>
                        setBrandDraft((prev) => ({ ...prev, storeName: e.target.value }))
                      }
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                      Store Tagline (Footer & Meta)
                    </label>
                    <textarea
                      rows={2}
                      disabled={!isAdmin}
                      value={brandDraft.tagline}
                      onChange={(e) =>
                        setBrandDraft((prev) => ({ ...prev, tagline: e.target.value }))
                      }
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                        Announcement Banner Line
                      </label>
                      <label className="flex items-center gap-2 text-xs text-[#57534e]">
                        <input
                          type="checkbox"
                          disabled={!isAdmin}
                          checked={draft.showAnnouncement}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, showAnnouncement: e.target.checked }))
                          }
                          className="accent-[#1c1917]"
                        />
                        Show on homepage
                      </label>
                    </div>
                    <input
                      type="text"
                      disabled={!isAdmin}
                      value={brandDraft.announcement}
                      onChange={(e) =>
                        setBrandDraft((prev) => ({ ...prev, announcement: e.target.value }))
                      }
                      className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-[#ded5c8] pt-5">
                <h3 className="font-serif text-xl font-normal text-[#1c1917]">Color Palette</h3>
                <p className="mt-1 text-xs text-[#78716c]">
                  Pick a curated retail theme or fine-tune individual hex swatches.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {WEBSITE_THEME_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        setDraft((prev) => ({ ...prev, theme: { ...preset.theme } }))
                      }
                      className="cursor-pointer border border-[#ded5c8] bg-[#f6f1ea] p-2.5 text-left transition-colors hover:border-[#1c1917]"
                    >
                      <div className="flex gap-1">
                        <span
                          className="h-4 w-4 border border-black/15"
                          style={{ backgroundColor: preset.theme.bgColor }}
                        />
                        <span
                          className="h-4 w-4 border border-black/15"
                          style={{ backgroundColor: preset.theme.surfaceColor }}
                        />
                        <span
                          className="h-4 w-4 border border-black/15"
                          style={{ backgroundColor: preset.theme.inkColor }}
                        />
                        <span
                          className="h-4 w-4 border border-black/15"
                          style={{ backgroundColor: preset.theme.accentColor }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-medium text-[#1c1917]">{preset.name}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {(
                    [
                      { key: 'bgColor', label: 'Page Background' },
                      { key: 'surfaceColor', label: 'Card & Surface' },
                      { key: 'inkColor', label: 'Primary Text & Buttons' },
                      { key: 'accentColor', label: 'Hover Accent' },
                    ] as const
                  ).map((item) => (
                    <div key={item.key}>
                      <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                        {item.label}
                      </label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="color"
                          disabled={!isAdmin}
                          value={draft.theme[item.key]}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              theme: { ...prev.theme, [item.key]: e.target.value },
                            }))
                          }
                          className="h-9 w-11 cursor-pointer border border-[#ded5c8] bg-transparent p-0.5"
                        />
                        <input
                          type="text"
                          disabled={!isAdmin}
                          value={draft.theme[item.key]}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              theme: { ...prev.theme, [item.key]: e.target.value },
                            }))
                          }
                          className="flex-1 border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-xs text-[#1c1917]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {section === 'header' && (
            <div className="space-y-4">
              <h3 className="font-serif text-xl font-normal text-[#1c1917]">
                Top Navigation Labels
              </h3>
              <p className="text-xs text-[#78716c]">
                Keep navigation labels short (1–2 words) so the single-row top bar stays balanced.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Shop Link Label
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.header.shopLabel}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        header: { ...prev.header, shopLabel: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    About Link Label
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.header.aboutLabel}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        header: { ...prev.header, aboutLabel: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Order Tracking Label
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.header.trackLabel}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        header: { ...prev.header, trackLabel: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Cart Button Label
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.header.bagLabel}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        header: { ...prev.header, bagLabel: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
              </div>
            </div>
          )}

          {section === 'hero' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-xl font-normal text-[#1c1917]">Hero Banner</h3>
                <label className="flex items-center gap-2 text-xs text-[#57534e]">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={draft.hero.visible}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, visible: e.target.checked },
                      }))
                    }
                    className="accent-[#1c1917]"
                  />
                  Show hero section
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Kicker / Eyebrow
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.hero.eyebrow}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      hero: { ...prev.hero, eyebrow: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Main Headline
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.hero.headline}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      hero: { ...prev.hero, headline: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-serif text-lg text-[#1c1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Subheadline
                </label>
                <textarea
                  rows={2}
                  disabled={!isAdmin}
                  value={draft.hero.subheadline}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      hero: { ...prev.hero, subheadline: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Primary CTA Button
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.hero.primaryCtaLabel}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, primaryCtaLabel: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Secondary Link Label
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.hero.secondaryCtaLabel}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, secondaryCtaLabel: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
              </div>

              <div className="border-t border-[#ded5c8] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Hero Banner Image
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={heroFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleImageUpload('hero', e.target.files?.[0])}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={!isAdmin || uploadingSlot === 'hero'}
                      onClick={() => heroFileRef.current?.click()}
                      className="inline-flex cursor-pointer items-center gap-1.5 border border-[#1c1917] px-3 py-1.5 text-xs text-[#1c1917] hover:bg-[#1c1917] hover:text-[#f6f1ea]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingSlot === 'hero' ? 'Uploading…' : 'Upload Photo'}
                    </button>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, imageUrl: HERO_IMAGE_URL },
                        }))
                      }
                      className="cursor-pointer text-xs text-[#57534e] underline hover:text-[#1c1917]"
                    >
                      Default Photo
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.hero.imageUrl}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      hero: { ...prev.hero, imageUrl: e.target.value },
                    }))
                  }
                  placeholder="/uploads/... or https://..."
                  className="mt-2 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-xs text-[#1c1917]"
                />
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.hero.imageAlt}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      hero: { ...prev.hero, imageAlt: e.target.value },
                    }))
                  }
                  placeholder="Image description (alt text)"
                  className="mt-2 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-xs text-[#1c1917]"
                />
              </div>
            </div>
          )}

          {section === 'collection' && (
            <div className="space-y-4">
              <h3 className="font-serif text-xl font-normal text-[#1c1917]">
                Product Collection Section
              </h3>
              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Section Eyebrow
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.collection.eyebrow}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      collection: { ...prev.collection, eyebrow: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Section Heading
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.collection.heading}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      collection: { ...prev.collection, heading: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Search Box Placeholder
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.collection.searchPlaceholder}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      collection: { ...prev.collection, searchPlaceholder: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>
              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs text-[#57534e]">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={draft.collection.showSearch}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        collection: { ...prev.collection, showSearch: e.target.checked },
                      }))
                    }
                    className="accent-[#1c1917]"
                  />
                  Show search bar
                </label>
                <label className="flex items-center gap-2 text-xs text-[#57534e]">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={draft.collection.showCategoryTabs}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        collection: { ...prev.collection, showCategoryTabs: e.target.checked },
                      }))
                    }
                    className="accent-[#1c1917]"
                  />
                  Show department filter tabs
                </label>
              </div>
            </div>
          )}

          {section === 'about' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-xl font-normal text-[#1c1917]">
                  About / Editorial Story
                </h3>
                <label className="flex items-center gap-2 text-xs text-[#57534e]">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={draft.about.visible}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        about: { ...prev.about, visible: e.target.checked },
                      }))
                    }
                    className="accent-[#1c1917]"
                  />
                  Show about section
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Eyebrow
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.about.eyebrow}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      about: { ...prev.about, eyebrow: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Heading
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.about.heading}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      about: { ...prev.about, heading: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Story Paragraph
                </label>
                <textarea
                  rows={3}
                  disabled={!isAdmin}
                  value={draft.about.body}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      about: { ...prev.about, body: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>

              <div className="border-t border-[#ded5c8] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Editorial Image
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={aboutFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleImageUpload('about', e.target.files?.[0])}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={!isAdmin || uploadingSlot === 'about'}
                      onClick={() => aboutFileRef.current?.click()}
                      className="inline-flex cursor-pointer items-center gap-1.5 border border-[#1c1917] px-3 py-1.5 text-xs text-[#1c1917] hover:bg-[#1c1917] hover:text-[#f6f1ea]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingSlot === 'about' ? 'Uploading…' : 'Upload Photo'}
                    </button>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          about: { ...prev.about, imageUrl: CRAFT_IMAGE_URL },
                        }))
                      }
                      className="cursor-pointer text-xs text-[#57534e] underline hover:text-[#1c1917]"
                    >
                      Default Photo
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.about.imageUrl}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      about: { ...prev.about, imageUrl: e.target.value },
                    }))
                  }
                  className="mt-2 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-xs text-[#1c1917]"
                />
              </div>

              <div className="border-t border-[#ded5c8] pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Store Highlights ({draft.about.highlights.length}/4)
                  </p>
                  {isAdmin && draft.about.highlights.length < 4 && (
                    <button
                      type="button"
                      onClick={addHighlight}
                      className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[#1c1917] hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Pillar
                    </button>
                  )}
                </div>

                <div className="mt-3 space-y-3">
                  {draft.about.highlights.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 gap-2 border border-[#ded5c8] bg-[#f6f1ea] p-3 sm:grid-cols-12"
                    >
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={item.title}
                        onChange={(e) => updateHighlight(idx, 'title', e.target.value)}
                        placeholder="Title"
                        className="border border-[#ded5c8] bg-[#fcf9f5] px-2.5 py-1.5 font-mono text-xs uppercase text-[#1c1917] sm:col-span-4"
                      />
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={item.description}
                        onChange={(e) => updateHighlight(idx, 'description', e.target.value)}
                        placeholder="Description"
                        className="border border-[#ded5c8] bg-[#fcf9f5] px-2.5 py-1.5 text-xs text-[#1c1917] sm:col-span-7"
                      />
                      <div className="flex items-center justify-end sm:col-span-1">
                        {isAdmin && draft.about.highlights.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeHighlight(idx)}
                            aria-label="Remove highlight"
                            className="cursor-pointer p-1 text-[#991b1b] hover:opacity-75"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {section === 'footer' && (
            <div className="space-y-4">
              <h3 className="font-serif text-xl font-normal text-[#1c1917]">Footer & Contact</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Links Column Heading
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.footer.linksHeading}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        footer: { ...prev.footer, linksHeading: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Shipping Column Heading
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={draft.footer.shippingHeading}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        footer: { ...prev.footer, shippingHeading: e.target.value },
                      }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Copyright Suffix
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draft.footer.copyrightNote}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      footer: { ...prev.footer, copyrightNote: e.target.value },
                    }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                  Showroom / Store Address
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={brandDraft.studioAddress}
                  onChange={(e) =>
                    setBrandDraft((prev) => ({ ...prev, studioAddress: e.target.value }))
                  }
                  className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Support Email
                  </label>
                  <input
                    type="email"
                    disabled={!isAdmin}
                    value={brandDraft.supportEmail}
                    onChange={(e) =>
                      setBrandDraft((prev) => ({ ...prev, supportEmail: e.target.value }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 text-sm text-[#1c1917]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wider uppercase text-[#78716c]">
                    Support Phone
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    value={brandDraft.supportPhone}
                    onChange={(e) =>
                      setBrandDraft((prev) => ({ ...prev, supportPhone: e.target.value }))
                    }
                    className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2 font-mono text-sm text-[#1c1917]"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-2 text-xs text-[#57534e]">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={draft.footer.showFreeShippingNote}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      footer: { ...prev.footer, showFreeShippingNote: e.target.checked },
                    }))
                  }
                  className="accent-[#1c1917]"
                />
                Show complimentary shipping threshold in footer bar
              </label>
            </div>
          )}
        </div>

        {/* Right Live Preview Pane */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 border border-[#ded5c8] bg-[#fcf9f5]">
            <div className="flex items-center justify-between border-b border-[#ded5c8] px-4 py-2.5 text-xs text-[#78716c]">
              <span className="font-medium tracking-wider uppercase">Live Storefront Preview</span>
              <span className="font-mono">{brandDraft.storeName}</span>
            </div>

            <div
              className="space-y-4 p-4 transition-colors"
              style={{
                backgroundColor: draft.theme.bgColor,
                color: draft.theme.inkColor,
              }}
            >
              {/* Mini Header Preview */}
              <div className="flex items-center justify-between border-b border-black/10 pb-3">
                <span className="font-serif text-base font-medium">{brandDraft.storeName}</span>
                <div className="flex items-center gap-3 text-[10px] opacity-75">
                  <span>{draft.header.shopLabel}</span>
                  {draft.about.visible && <span>{draft.header.aboutLabel}</span>}
                  <span>{draft.header.trackLabel}</span>
                  <span
                    className="px-2 py-0.5 text-[9px] uppercase"
                    style={{
                      backgroundColor: draft.theme.inkColor,
                      color: draft.theme.bgColor,
                    }}
                  >
                    {draft.header.bagLabel} (0)
                  </span>
                </div>
              </div>

              {/* Mini Hero Preview */}
              {draft.hero.visible ? (
                <div className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-6 space-y-1.5">
                    {draft.hero.eyebrow && (
                      <p className="text-[9px] tracking-widest uppercase opacity-65">
                        {draft.hero.eyebrow}
                      </p>
                    )}
                    <p className="font-serif text-lg leading-tight">{draft.hero.headline}</p>
                    <p className="line-clamp-2 text-[10px] opacity-75">{draft.hero.subheadline}</p>
                    <div className="pt-1">
                      <span
                        className="inline-block px-2.5 py-1 text-[9px] tracking-wider uppercase"
                        style={{
                          backgroundColor: draft.theme.inkColor,
                          color: draft.theme.bgColor,
                        }}
                      >
                        {draft.hero.primaryCtaLabel}
                      </span>
                    </div>
                  </div>
                  <div className="col-span-6 aspect-[16/10] overflow-hidden bg-black/5">
                    <SafeImage
                      src={draft.hero.imageUrl}
                      alt={draft.hero.imageAlt}
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              ) : (
                <p className="border border-dashed border-black/15 py-4 text-center text-[10px] opacity-60">
                  Hero banner hidden
                </p>
              )}

              {draft.showAnnouncement && brandDraft.announcement && (
                <p className="border-t border-black/10 pt-2 text-[10px] opacity-75">
                  {brandDraft.announcement}
                </p>
              )}

              {/* Mini Collection Heading Preview */}
              <div
                className="border border-black/10 p-3"
                style={{ backgroundColor: draft.theme.surfaceColor }}
              >
                <p className="text-[9px] tracking-widest uppercase opacity-60">
                  {draft.collection.eyebrow}
                </p>
                <div className="mt-0.5 flex items-center justify-between">
                  <p className="font-serif text-sm">{draft.collection.heading}</p>
                  {draft.collection.showSearch && (
                    <span className="border border-black/15 px-2 py-0.5 text-[9px] opacity-60">
                      {draft.collection.searchPlaceholder.slice(0, 18)}…
                    </span>
                  )}
                </div>
              </div>

              {/* Mini About Preview */}
              {draft.about.visible && (
                <div
                  className="grid grid-cols-12 items-center gap-3 border border-black/10 p-3"
                  style={{ backgroundColor: draft.theme.surfaceColor }}
                >
                  <div className="col-span-5 aspect-[4/3] overflow-hidden bg-black/5">
                    <SafeImage
                      src={draft.about.imageUrl}
                      alt={draft.about.imageAlt}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="col-span-7 space-y-1">
                    <p className="text-[9px] tracking-widest uppercase opacity-60">
                      {draft.about.eyebrow}
                    </p>
                    <p className="font-serif text-sm leading-snug">{draft.about.heading}</p>
                    <p
                      className="text-[9px] font-medium"
                      style={{ color: draft.theme.accentColor }}
                    >
                      {draft.about.highlights.map((h) => h.title).join(' · ')}
                    </p>
                  </div>
                </div>
              )}

              {/* Mini Footer Preview */}
              <div className="flex items-center justify-between border-t border-black/10 pt-2.5 text-[9px] opacity-70">
                <span>
                  © {new Date().getFullYear()} {brandDraft.storeName}
                </span>
                <span>{draft.footer.shippingHeading}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

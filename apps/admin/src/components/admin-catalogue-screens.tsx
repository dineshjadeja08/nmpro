"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bold,
  Check,
  Droplets,
  Filter,
  Heading2,
  Heading3,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Tv,
  Underline,
  Upload,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { api, base, uploadCategoryImage, uploadImage } from "../lib/api";
import { AdminErrorState } from "./admin/admin-error-state";

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  short_description?: string;
  image_url: string;
  banner_image?: string;
  banner_image_url?: string;
  banner_title?: string;
  banner_subtitle?: string;
  banner_button_text?: string;
  banner_button_link?: string;
  banner_is_active?: boolean;
  sub_service_count?: number;
  sort_order: number;
  is_active: boolean;
};

export type AdminServiceImageItem = {
  id: string;
  url: string;
  alt_text?: string;
  sort_order?: number;
  is_active?: boolean;
};

export type FAQItem = {
  question: string;
  answer: string;
};

export type AdminService = {
  id: string;
  category_id: string;
  category_name?: string;
  category_slug?: string;
  slug: string;
  name: string;
  summary: string;
  description: string;
  starting_price_paise: number | null;
  price_note?: string;
  training_fee_paise?: number | null;
  important_notes?: string;
  features?: string[];
  inclusions?: string[];
  exclusions?: string[];
  faqs?: FAQItem[];
  seo_title?: string;
  seo_description?: string;
  banner_title?: string;
  banner_subtitle?: string;
  banner_button_text?: string;
  banner_button_link?: string;
  banner_is_active?: boolean;
  main_image?: string;
  banner_image?: string;
  cover_image?: string;
  landing_thumbnail?: string;
  cover_image_url?: string;
  landing_thumbnail_url?: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  images: AdminServiceImageItem[];
};

function resolveMediaSrc(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

function slugify(val: string): string {
  return val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function formatInr(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "Not set";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function CategoryGlyph({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes("ac") || n.includes("cool") || n.includes("air") || n.includes("fan")) {
    return <Wind className="h-4 w-4" />;
  }
  if (n.includes("wash")) return <RefreshCw className="h-4 w-4" />;
  if (n.includes("heater") || n.includes("geyser") || n.includes("inverter") || n.includes("electric")) {
    return <Zap className="h-4 w-4" />;
  }
  if (n.includes("tv") || n.includes("television")) return <Tv className="h-4 w-4" />;
  if (n.includes("water") || n.includes("tank") || n.includes("purifier")) {
    return <Droplets className="h-4 w-4" />;
  }
  return <Package className="h-4 w-4" />;
}

function ServiceGlyph({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes("inspect") || n.includes("diagnos")) return <Search className="h-4 w-4" />;
  if (n.includes("install") || n.includes("mount") || n.includes("setup")) return <Settings className="h-4 w-4" />;
  if (n.includes("clean") || n.includes("jet") || n.includes("wash") || n.includes("foam")) return <Wind className="h-4 w-4" />;
  return <Package className="h-4 w-4" />;
}

/**
 * Viewport-fitted popup dialog: pinned header + independently scrollable body + pinned footer.
 */
function FittedModal({
  title,
  subtitle,
  onClose,
  maxWidth = "max-w-2xl",
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  maxWidth?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-[1px] sm:p-5"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`flex max-h-[86vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-[#e7e5df] bg-white shadow-2xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#efede8] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-slate-900 sm:text-lg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#efede8] bg-[#faf9f6] px-5 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function RichTextEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [sourceMode, setSourceMode] = useState(false);

  useEffect(() => {
    if (!sourceMode && editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value, sourceMode]);

  const exec = (cmd: string, arg?: string) => {
    if (disabled || sourceMode) return;
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(editorRef.current?.innerHTML ?? "");
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-[#efede8] bg-[#faf9f6] px-2.5 py-1.5">
        <button type="button" onClick={() => exec("bold")} disabled={disabled || sourceMode} className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40" title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("italic")} disabled={disabled || sourceMode} className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40" title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("underline")} disabled={disabled || sourceMode} className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40" title="Underline">
          <Underline className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <button type="button" onClick={() => exec("formatBlock", "<h2>")} disabled={disabled || sourceMode} className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40" title="Heading 2">
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("formatBlock", "<h3>")} disabled={disabled || sourceMode} className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40" title="Heading 3">
          <Heading3 className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <button type="button" onClick={() => exec("insertUnorderedList")} disabled={disabled || sourceMode} className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40" title="Bullet list">
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("insertOrderedList")} disabled={disabled || sourceMode} className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40" title="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const href = window.prompt("Enter URL");
            if (href) exec("createLink", href);
          }}
          disabled={disabled || sourceMode}
          className="rounded p-1.5 text-slate-700 hover:bg-slate-200 disabled:opacity-40"
          title="Insert link"
        >
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setSourceMode((v) => !v)}
          className="ml-auto rounded border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
        >
          {sourceMode ? "Visual" : "HTML"}
        </button>
      </div>
      {sourceMode ? (
        <textarea
          rows={5}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full p-3 font-mono text-xs text-slate-800 outline-none"
          placeholder="<p>Enter rich description...</p>"
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
          className="min-h-[120px] p-3 text-sm leading-relaxed text-slate-800 outline-none [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      )}
    </div>
  );
}

function ImageUploadSlotBox({
  title,
  recommendedSize,
  imageUrl,
  disabled,
  uploading,
  aspectClass = "aspect-[16/10]",
  onUpload,
  onClear,
}: {
  title: string;
  recommendedSize: string;
  imageUrl?: string | null;
  disabled?: boolean;
  uploading?: boolean;
  aspectClass?: string;
  onUpload: (file: File) => void;
  onClear?: () => void;
}) {
  const fullSrc = resolveMediaSrc(imageUrl);
  return (
    <div className="space-y-3">
      {fullSrc ? (
        <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white ${aspectClass}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fullSrc} alt={title} className="h-full w-full object-cover" />
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center rounded-xl bg-[#dce6ec] px-4 text-center ${aspectClass}`}
        >
          <ImageIcon className="h-6 w-6 text-[#3d5b73]" />
          <p className="mt-2 text-xs font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">{recommendedSize} · JPG, PNG, WebP</p>
        </div>
      )}

      {!disabled && (
        <div className="space-y-2">
          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2c5270]" /> : <Upload className="h-3.5 w-3.5 text-slate-600" />}
            <span>{uploading ? "Uploading..." : fullSrc ? "Replace image" : "Upload image"}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
                e.target.value = "";
              }}
            />
          </label>
          {fullSrc && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-semibold text-red-700 hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove image
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PillListEditor({
  label,
  placeholder,
  items,
  onChange,
  disabled,
}: {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const clean = draft.trim();
    if (!clean) return;
    onChange([...items, clean]);
    setDraft("");
  };
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      {items.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 rounded-lg bg-[#efede8] px-3 py-2 text-xs font-medium text-slate-800"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Check className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                <span className="truncate">{item}</span>
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  className="shrink-0 text-slate-400 hover:text-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#2c5270]"
          />
          <button
            type="button"
            onClick={add}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminServicesScreen({
  canEdit,
  routeCategorySlug,
  routeServiceSlug,
  onNavigate,
}: {
  canEdit: boolean;
  routeCategorySlug?: string;
  routeServiceSlug?: string;
  onNavigate?: (path: string) => void;
}) {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");

  // Navigation slugs
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>(routeCategorySlug ?? "");
  const [activeServiceSlug, setActiveServiceSlug] = useState<string>(routeServiceSlug ?? "");

  // Fitted Popups
  const [catEditTarget, setCatEditTarget] = useState<AdminCategory | "new" | null>(null);
  const [catBannerTarget, setCatBannerTarget] = useState<AdminCategory | null>(null);
  const [previewBannerCat, setPreviewBannerCat] = useState<AdminCategory | null>(null);
  const [newSubModalCatId, setNewSubModalCatId] = useState<string | null>(null);

  const [catForm, setCatForm] = useState({
    name: "",
    slug: "",
    description: "",
    banner_title: "",
    banner_subtitle: "",
    banner_button_text: "",
    banner_button_link: "",
    banner_is_active: true,
    sort_order: "0",
    is_active: true,
  });

  const [bannerForm, setBannerForm] = useState({
    banner_title: "",
    banner_subtitle: "",
    banner_button_text: "",
    banner_button_link: "",
    banner_is_active: true,
  });

  const [newSubForm, setNewSubForm] = useState({
    category_id: "",
    name: "",
    slug: "",
    summary: "",
    price_rupees: "",
    price_note: "",
    sort_order: "0",
    is_active: true,
  });

  const [svcForm, setSvcForm] = useState<{
    id: string;
    category_id: string;
    name: string;
    slug: string;
    summary: string;
    description: string;
    price_rupees: string;
    price_note: string;
    banner_title: string;
    banner_subtitle: string;
    banner_button_text: string;
    banner_button_link: string;
    banner_is_active: boolean;
    features: string[];
    inclusions: string[];
    exclusions: string[];
    faqs: FAQItem[];
    seo_title: string;
    seo_description: string;
    sort_order: string;
    is_active: boolean;
  } | null>(null);

  useEffect(() => {
    setActiveCategorySlug(routeCategorySlug ?? "");
    setActiveServiceSlug(routeServiceSlug ?? "");
    setSearch("");
    setStatusFilter("");
    setShowFilterRow(false);
  }, [routeCategorySlug, routeServiceSlug]);

  const navigateTo = useCallback(
    (url: string, catSlug = "", svcSlug = "") => {
      if (onNavigate) {
        onNavigate(url);
      } else {
        setActiveCategorySlug(catSlug);
        setActiveServiceSlug(svcSlug);
      }
    },
    [onNavigate]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [catRes, svcRes] = await Promise.all([
        api<{ results?: AdminCategory[] }>("/admin/categories/?page_size=200"),
        api<{ results?: AdminService[] }>("/admin/services/?page_size=500"),
      ]);
      setCategories(catRes.results ?? []);
      setServices(svcRes.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.slug === activeCategorySlug) ?? null,
    [categories, activeCategorySlug]
  );

  const selectedService = useMemo(() => {
    if (!activeServiceSlug) return null;
    if (selectedCategory) {
      return (
        services.find(
          (s) =>
            s.category_id === selectedCategory.id &&
            (s.slug === activeServiceSlug || s.slug === `${selectedCategory.slug}-${activeServiceSlug}`)
        ) ?? null
      );
    }
    return services.find((s) => s.slug === activeServiceSlug) ?? null;
  }, [services, selectedCategory, activeServiceSlug]);

  const resetServiceForm = useCallback((svc: AdminService | null) => {
    if (!svc) {
      setSvcForm(null);
      return;
    }
    setSvcForm({
      id: svc.id,
      category_id: svc.category_id,
      name: svc.name,
      slug: svc.slug,
      summary: svc.summary || "",
      description: svc.description || "",
      price_rupees:
        svc.starting_price_paise !== null && svc.starting_price_paise !== undefined
          ? String(svc.starting_price_paise / 100)
          : "",
      price_note: svc.price_note || "",
      banner_title: svc.banner_title || "",
      banner_subtitle: svc.banner_subtitle || "",
      banner_button_text: svc.banner_button_text || "",
      banner_button_link: svc.banner_button_link || "",
      banner_is_active: svc.banner_is_active ?? true,
      features: svc.features ?? [],
      inclusions: svc.inclusions ?? [],
      exclusions: svc.exclusions ?? [],
      faqs: svc.faqs ?? [],
      seo_title: svc.seo_title || "",
      seo_description: svc.seo_description || "",
      sort_order: String(svc.sort_order ?? 0),
      is_active: svc.is_active,
    });
  }, []);

  useEffect(() => {
    resetServiceForm(selectedService);
  }, [selectedService, resetServiceForm]);

  const openCategoryEditor = (target: AdminCategory | "new") => {
    if (target === "new") {
      setCatForm({
        name: "",
        slug: "",
        description: "",
        banner_title: "",
        banner_subtitle: "",
        banner_button_text: "",
        banner_button_link: "",
        banner_is_active: true,
        sort_order: String(categories.length + 1),
        is_active: true,
      });
    } else {
      setCatForm({
        name: target.name,
        slug: target.slug,
        description: target.description || "",
        banner_title: target.banner_title || "",
        banner_subtitle: target.banner_subtitle || "",
        banner_button_text: target.banner_button_text || "",
        banner_button_link: target.banner_button_link || "",
        banner_is_active: target.banner_is_active ?? true,
        sort_order: String(target.sort_order ?? 0),
        is_active: target.is_active,
      });
    }
    setCatEditTarget(target);
  };

  const openBannerEditor = (cat: AdminCategory) => {
    setBannerForm({
      banner_title: cat.banner_title || "",
      banner_subtitle: cat.banner_subtitle || "",
      banner_button_text: cat.banner_button_text || "",
      banner_button_link: cat.banner_button_link || "",
      banner_is_active: cat.banner_is_active ?? true,
    });
    setCatBannerTarget(cat);
  };

  const openNewSubServiceModal = (defaultCatId?: string) => {
    setNewSubForm({
      category_id: defaultCatId || selectedCategory?.id || categories[0]?.id || "",
      name: "",
      slug: "",
      summary: "",
      price_rupees: "",
      price_note: "",
      sort_order: "0",
      is_active: true,
    });
    setNewSubModalCatId(defaultCatId || selectedCategory?.id || categories[0]?.id || "");
  };

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!catEditTarget) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        name: catForm.name.trim(),
        slug: (catForm.slug.trim() || slugify(catForm.name)).slice(0, 50),
        description: catForm.description.trim(),
        banner_title: catForm.banner_title.trim(),
        banner_subtitle: catForm.banner_subtitle.trim(),
        banner_button_text: catForm.banner_button_text.trim(),
        banner_button_link: catForm.banner_button_link.trim(),
        banner_is_active: catForm.banner_is_active,
        sort_order: Math.max(0, Number(catForm.sort_order) || 0),
        is_active: catForm.is_active,
      };
      if (catEditTarget === "new") {
        await api("/admin/categories/", "POST", payload);
        setNotice("Category added.");
      } else {
        await api(`/admin/categories/${catEditTarget.id}/`, "PATCH", payload);
        setNotice("Category updated.");
      }
      setCatEditTarget(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCategoryBanner = async (e: FormEvent) => {
    e.preventDefault();
    if (!catBannerTarget) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/categories/${catBannerTarget.id}/`, "PATCH", {
        banner_title: bannerForm.banner_title.trim(),
        banner_subtitle: bannerForm.banner_subtitle.trim(),
        banner_button_text: bannerForm.banner_button_text.trim(),
        banner_button_link: bannerForm.banner_button_link.trim(),
        banner_is_active: bannerForm.banner_is_active,
      });
      setCatBannerTarget(null);
      setNotice("Category banner saved.");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save banner.");
    } finally {
      setBusy(false);
    }
  };

  const handleCategoryImageUpload = async (categoryId: string, file: File, slot: "card" | "banner") => {
    setUploadingSlot(`cat_${categoryId}_${slot}`);
    setError("");
    try {
      await uploadCategoryImage(categoryId, file, slot);
      await loadAll();
      if (catBannerTarget?.id === categoryId) {
        setCatBannerTarget(await api<AdminCategory>(`/admin/categories/${categoryId}/`));
      }
      if (catEditTarget && catEditTarget !== "new" && catEditTarget.id === categoryId) {
        setCatEditTarget(await api<AdminCategory>(`/admin/categories/${categoryId}/`));
      }
      setNotice("Image uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingSlot("");
    }
  };

  const handleCategoryImageClear = async (categoryId: string, slot: "card" | "banner") => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/categories/${categoryId}/images/?slot=${slot}`, "DELETE");
      await loadAll();
      if (catBannerTarget?.id === categoryId) {
        setCatBannerTarget(await api<AdminCategory>(`/admin/categories/${categoryId}/`));
      }
      if (catEditTarget && catEditTarget !== "new" && catEditTarget.id === categoryId) {
        setCatEditTarget(await api<AdminCategory>(`/admin/categories/${categoryId}/`));
      }
      setNotice("Image removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove image.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCategory = async (cat: AdminCategory) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/categories/${cat.id}/`, "DELETE");
      setNotice("Category deleted.");
      navigateTo("/services", "", "");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete category.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSubService = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const cat = categories.find((c) => c.id === newSubForm.category_id);
      const pricePaise =
        newSubForm.price_rupees.trim() !== "" ? Math.round(Number(newSubForm.price_rupees) * 100) : null;
      const created = await api<AdminService>("/admin/services/", "POST", {
        category_id: newSubForm.category_id,
        name: newSubForm.name.trim(),
        slug: (newSubForm.slug.trim() || slugify(newSubForm.name)).slice(0, 50),
        summary: newSubForm.summary.trim(),
        starting_price_paise: pricePaise,
        price_note: newSubForm.price_note.trim(),
        sort_order: Math.max(0, Number(newSubForm.sort_order) || 0),
        is_active: newSubForm.is_active,
      });
      setNewSubModalCatId(null);
      setNotice("Service added.");
      await loadAll();
      if (cat) {
        navigateTo(`/services/${cat.slug}/${created.slug}`, cat.slug, created.slug);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add service.");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSubService = async (e: FormEvent) => {
    e.preventDefault();
    if (!svcForm) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const pricePaise =
        svcForm.price_rupees.trim() !== "" ? Math.round(Number(svcForm.price_rupees) * 100) : null;
      const updated = await api<AdminService>(`/admin/services/${svcForm.id}/`, "PATCH", {
        category_id: svcForm.category_id,
        name: svcForm.name.trim(),
        slug: (svcForm.slug.trim() || slugify(svcForm.name)).slice(0, 50),
        summary: svcForm.summary.trim(),
        description: svcForm.description,
        starting_price_paise: pricePaise,
        price_note: svcForm.price_note.trim(),
        banner_title: svcForm.banner_title.trim(),
        banner_subtitle: svcForm.banner_subtitle.trim(),
        banner_button_text: svcForm.banner_button_text.trim(),
        banner_button_link: svcForm.banner_button_link.trim(),
        banner_is_active: svcForm.banner_is_active,
        features: svcForm.features.filter(Boolean),
        inclusions: svcForm.inclusions.filter(Boolean),
        exclusions: svcForm.exclusions.filter(Boolean),
        faqs: svcForm.faqs.filter((f) => f.question.trim() && f.answer.trim()),
        seo_title: svcForm.seo_title.trim(),
        seo_description: svcForm.seo_description.trim(),
        sort_order: Math.max(0, Number(svcForm.sort_order) || 0),
        is_active: svcForm.is_active,
      });
      setNotice("Changes saved.");
      await loadAll();
      if (
        updated.category_slug &&
        (updated.slug !== activeServiceSlug || updated.category_slug !== activeCategorySlug)
      ) {
        navigateTo(`/services/${updated.category_slug}/${updated.slug}`, updated.category_slug, updated.slug);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSubService = async (svc: AdminService) => {
    if (!window.confirm(`Delete "${svc.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/services/${svc.id}/`, "DELETE");
      setNotice("Service deleted.");
      const catSlug = svc.category_slug || activeCategorySlug;
      navigateTo(catSlug ? `/services/${catSlug}` : "/services", catSlug, "");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete service.");
    } finally {
      setBusy(false);
    }
  };

  const handleServiceImageUpload = async (serviceId: string, file: File, slot: string) => {
    setUploadingSlot(`svc_${slot}`);
    setError("");
    try {
      await uploadImage(serviceId, file, slot);
      await loadAll();
      setNotice("Image uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingSlot("");
    }
  };

  const handleGalleryUpload = async (serviceId: string, files: FileList) => {
    setUploadingSlot("svc_gallery");
    setError("");
    try {
      for (const file of Array.from(files)) {
        await uploadImage(serviceId, file, "gallery", { alt_text: svcForm?.name || "" });
      }
      await loadAll();
      setNotice("Gallery updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gallery upload failed.");
    } finally {
      setUploadingSlot("");
    }
  };

  const handleServiceImageClear = async (serviceId: string, slot: string) => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/services/${serviceId}/images/?slot=${slot}`, "DELETE");
      await loadAll();
      setNotice("Image removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove image.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGalleryItem = async (serviceId: string, imageId: string) => {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/services/${serviceId}/images/${imageId}/`, "DELETE");
      await loadAll();
      setNotice("Gallery photo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo.");
    } finally {
      setBusy(false);
    }
  };

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((c) => {
      if (statusFilter === "active" && !c.is_active) return false;
      if (statusFilter === "inactive" && c.is_active) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
    });
  }, [categories, search, statusFilter]);

  const categorySubServices = useMemo(() => {
    if (!selectedCategory) return [];
    const q = search.trim().toLowerCase();
    return services
      .filter((s) => s.category_id === selectedCategory.id)
      .filter((s) => {
        if (statusFilter === "active" && !s.is_active) return false;
        if (statusFilter === "inactive" && s.is_active) return false;
        if (!q) return true;
        return s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q);
      });
  }, [services, selectedCategory, search, statusFilter]);

  if (loading && categories.length === 0) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#2c5270]" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] rounded-2xl bg-[#f7f6f2] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        {error && <AdminErrorState message={error} onRetry={() => void loadAll()} />}
        {notice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* SCREEN 3: SERVICE EDITOR (Image 2 exact layout)                   */}
        {/* ================================================================= */}
        {selectedService && svcForm ? (
          <form id="subservice-edit-form" onSubmit={handleSaveSubService} className="space-y-5">
            {/* Breadcrumb & Header */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <nav className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-500">
                  <button type="button" onClick={() => navigateTo("/services", "", "")} className="hover:text-slate-900">
                    Categories
                  </button>
                  <span>→</span>
                  <button
                    type="button"
                    onClick={() =>
                      navigateTo(
                        `/services/${selectedCategory?.slug || selectedService.category_slug || ""}`,
                        selectedCategory?.slug || selectedService.category_slug || "",
                        ""
                      )
                    }
                    className="hover:text-slate-900"
                  >
                    {selectedCategory?.name || selectedService.category_name || "Category"} Services
                  </button>
                  <span>→</span>
                  <span className="font-semibold text-slate-900">{selectedService.name}</span>
                </nav>
                <p className="mt-2.5 text-xs font-medium text-slate-500">Service editor</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  {selectedService.name}
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Update the customer-facing service details and image assets.
                </p>
              </div>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleDeleteSubService(selectedService)}
                    className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => resetServiceForm(selectedService)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-[#2c5270] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#23425b] disabled:opacity-50"
                  >
                    {busy ? "Saving..." : "Save changes"}
                  </button>
                </div>
              )}
            </div>

            {/* 2-Column Workspace: Left "Service details" Card | Right "Images" Card */}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.9fr)] lg:items-start">
              {/* LEFT: Service details */}
              <div className="space-y-5">
                <section className="overflow-hidden rounded-2xl border border-[#e7e5df] bg-white shadow-xs">
                  <div className="border-b border-[#efede8] px-6 py-4">
                    <h2 className="text-base font-bold text-slate-900">Service details</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Information shown to customers during booking.
                    </p>
                  </div>

                  {/* Row 1: Service Name & Customer Summary */}
                  <div className="grid gap-4 border-b border-[#efede8] px-6 py-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Service name
                      </label>
                      <input
                        required
                        disabled={!canEdit}
                        value={svcForm.name}
                        onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })}
                        className="w-full rounded-lg border border-transparent bg-transparent py-1 text-sm font-semibold text-slate-900 outline-none hover:border-slate-200 focus:border-[#2c5270] focus:bg-white focus:px-2"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Customer summary
                      </label>
                      <input
                        disabled={!canEdit}
                        value={svcForm.summary}
                        onChange={(e) => setSvcForm({ ...svcForm, summary: e.target.value })}
                        placeholder="Short description..."
                        className="w-full rounded-lg border border-transparent bg-transparent py-1 text-sm text-slate-700 outline-none hover:border-slate-200 focus:border-[#2c5270] focus:bg-white focus:px-2"
                      />
                    </div>
                  </div>

                  {/* Row 2: Category / Slug / Starting Price / Status */}
                  <div className="grid gap-4 border-b border-[#efede8] px-6 py-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Category & URL slug
                      </label>
                      <select
                        disabled={!canEdit}
                        value={svcForm.category_id}
                        onChange={(e) => setSvcForm({ ...svcForm, category_id: e.target.value })}
                        className="mb-1.5 w-full rounded-lg border border-slate-200 bg-[#faf9f6] px-2.5 py-1 text-xs font-semibold text-slate-800"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        required
                        disabled={!canEdit}
                        value={svcForm.slug}
                        onChange={(e) => setSvcForm({ ...svcForm, slug: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-0.5 font-mono text-[11px] text-slate-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Starting price (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!canEdit}
                        value={svcForm.price_rupees}
                        onChange={(e) => setSvcForm({ ...svcForm, price_rupees: e.target.value })}
                        placeholder="299"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-sm font-bold text-slate-900"
                      />
                      <input
                        type="text"
                        disabled={!canEdit}
                        value={svcForm.price_note}
                        onChange={(e) => setSvcForm({ ...svcForm, price_note: e.target.value })}
                        placeholder="Price note (optional)"
                        className="mt-1.5 w-full rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Status & order
                      </label>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setSvcForm({ ...svcForm, is_active: !svcForm.is_active })}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          svcForm.is_active
                            ? "bg-[#e3edf3] text-[#2c5270]"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {svcForm.is_active ? "Active" : "Inactive"}
                      </button>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span>Order:</span>
                        <input
                          type="number"
                          min={0}
                          disabled={!canEdit}
                          value={svcForm.sort_order}
                          onChange={(e) => setSvcForm({ ...svcForm, sort_order: e.target.value })}
                          className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-800"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 3: Included tasks / Features / Excluded tasks pills */}
                  <div className="space-y-4 border-b border-[#efede8] px-6 py-4">
                    <PillListEditor
                      label="Included tasks"
                      placeholder="e.g. Visual unit inspection"
                      items={svcForm.inclusions}
                      onChange={(inclusions) => setSvcForm({ ...svcForm, inclusions })}
                      disabled={!canEdit}
                    />
                    <PillListEditor
                      label="Features"
                      placeholder="Add service feature..."
                      items={svcForm.features}
                      onChange={(features) => setSvcForm({ ...svcForm, features })}
                      disabled={!canEdit}
                    />
                    <PillListEditor
                      label="Excluded items"
                      placeholder="Add excluded item..."
                      items={svcForm.exclusions}
                      onChange={(exclusions) => setSvcForm({ ...svcForm, exclusions })}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Row 4: Full Rich Description */}
                  <div className="space-y-2 border-b border-[#efede8] px-6 py-4">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Full description
                    </label>
                    <RichTextEditor
                      value={svcForm.description}
                      onChange={(description) => setSvcForm({ ...svcForm, description })}
                      disabled={!canEdit}
                    />
                  </div>

                  {/* Row 5: FAQs & SEO */}
                  <div className="space-y-4 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        FAQs & SEO metadata
                      </span>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            setSvcForm({
                              ...svcForm,
                              faqs: [...svcForm.faqs, { question: "", answer: "" }],
                            })
                          }
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          + Add FAQ
                        </button>
                      )}
                    </div>
                    {svcForm.faqs.map((faq, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 bg-[#faf9f6] p-3 space-y-2">
                        <div className="flex justify-between text-[11px] font-bold text-slate-500">
                          <span>FAQ #{i + 1}</span>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() =>
                                setSvcForm({ ...svcForm, faqs: svcForm.faqs.filter((_, idx) => idx !== i) })
                              }
                              className="text-red-600 hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          disabled={!canEdit}
                          value={faq.question}
                          onChange={(e) => {
                            const next = [...svcForm.faqs];
                            next[i] = { ...next[i], question: e.target.value };
                            setSvcForm({ ...svcForm, faqs: next });
                          }}
                          placeholder="Question"
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
                        />
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={faq.answer}
                          onChange={(e) => {
                            const next = [...svcForm.faqs];
                            next[i] = { ...next[i], answer: e.target.value };
                            setSvcForm({ ...svcForm, faqs: next });
                          }}
                          placeholder="Answer"
                          className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs"
                        />
                      </div>
                    ))}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        disabled={!canEdit}
                        value={svcForm.seo_title}
                        onChange={(e) => setSvcForm({ ...svcForm, seo_title: e.target.value })}
                        placeholder="SEO title"
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs"
                      />
                      <input
                        disabled={!canEdit}
                        value={svcForm.seo_description}
                        onChange={(e) => setSvcForm({ ...svcForm, seo_description: e.target.value })}
                        placeholder="SEO description"
                        className="h-9 rounded-lg border border-slate-200 px-3 text-xs"
                      />
                    </div>
                  </div>
                </section>
              </div>

              {/* RIGHT: Images Card (matching Image 2 exactly!) */}
              <aside className="space-y-5">
                <section className="overflow-hidden rounded-2xl border border-[#e7e5df] bg-white shadow-xs">
                  <div className="border-b border-[#efede8] px-5 py-4">
                    <h2 className="text-base font-bold text-slate-900">Images</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {(selectedService.main_image ? 1 : 0) +
                        (selectedService.banner_image ? 1 : 0) +
                        selectedService.images.length}{" "}
                      service asset(s)
                    </p>
                  </div>

                  <div className="space-y-5 p-5">
                    <ImageUploadSlotBox
                      title="Service main image"
                      recommendedSize="900 × 600 px"
                      imageUrl={selectedService.main_image || selectedService.cover_image}
                      disabled={!canEdit}
                      uploading={uploadingSlot === "svc_main_image"}
                      onUpload={(f) => void handleServiceImageUpload(selectedService.id, f, "main_image")}
                      onClear={() => void handleServiceImageClear(selectedService.id, "main_image")}
                    />

                    <div className="border-t border-[#efede8] pt-4">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Sub-service banner (1920 × 600 px)
                      </p>
                      <ImageUploadSlotBox
                        title="Sub-service banner"
                        recommendedSize="1920 × 600 px"
                        imageUrl={selectedService.banner_image || selectedService.landing_thumbnail}
                        disabled={!canEdit}
                        uploading={uploadingSlot === "svc_banner_image"}
                        aspectClass="aspect-[16/5]"
                        onUpload={(f) => void handleServiceImageUpload(selectedService.id, f, "banner_image")}
                        onClear={() => void handleServiceImageClear(selectedService.id, "banner_image")}
                      />
                      <div className="mt-3 grid gap-2">
                        <input
                          disabled={!canEdit}
                          value={svcForm.banner_title}
                          onChange={(e) => setSvcForm({ ...svcForm, banner_title: e.target.value })}
                          placeholder="Banner title"
                          className="h-9 rounded-lg border border-slate-200 px-3 text-xs"
                        />
                        <input
                          disabled={!canEdit}
                          value={svcForm.banner_subtitle}
                          onChange={(e) => setSvcForm({ ...svcForm, banner_subtitle: e.target.value })}
                          placeholder="Banner subtitle"
                          className="h-9 rounded-lg border border-slate-200 px-3 text-xs"
                        />
                      </div>
                    </div>

                    <div className="border-t border-[#efede8] pt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Gallery photos
                          </p>
                          <p className="text-[11px] text-slate-400">1200 × 900 px · JPG, PNG, WebP</p>
                        </div>
                        {canEdit && (
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            <ImagePlus className="h-3.5 w-3.5" /> Add
                            <input
                              type="file"
                              multiple
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files?.length) void handleGalleryUpload(selectedService.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {selectedService.images.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {selectedService.images.map((img) => (
                            <div key={img.id} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={resolveMediaSrc(img.url)} alt={img.alt_text || selectedService.name} className="h-full w-full object-cover" />
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteGalleryItem(selectedService.id, img.id)}
                                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-red-600 shadow-xs hover:bg-white"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </form>
        ) : selectedCategory ? (
          /* ================================================================= */
          /* SCREEN 2: CATEGORY SERVICES LIST (Image 3 exact layout)           */
          /* ================================================================= */
          <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <button type="button" onClick={() => navigateTo("/services", "", "")} className="hover:text-slate-900">
                    Categories
                  </button>
                  <span>→</span>
                  <span className="font-semibold text-slate-900">{selectedCategory.name}</span>
                </nav>
                <p className="mt-2.5 text-xs font-medium text-slate-500">Category services</p>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {selectedCategory.name} Services
                  </h1>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openBannerEditor(selectedCategory)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-[#2c5270] hover:bg-slate-50"
                    >
                      Edit Banner
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Maintain the bookable {selectedCategory.name} services and their shared category presentation.
                </p>
              </div>

              {canEdit && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openCategoryEditor(selectedCategory)}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="inline h-3.5 w-3.5 mr-1" /> Edit category
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewSubServiceModal(selectedCategory.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#2c5270] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#23425b]"
                  >
                    <Plus className="h-4 w-4" /> Add service
                  </button>
                </div>
              )}
            </div>

            <section className="overflow-hidden rounded-2xl border border-[#e7e5df] bg-white shadow-xs">
              {/* Top Soft Ice-Blue Common Banner Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-[#dfe9ef] px-5 py-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#2c5270] text-white">
                    {selectedCategory.banner_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveMediaSrc(selectedCategory.banner_image)}
                        alt={selectedCategory.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-sm font-bold text-slate-900">Common banner</strong>
                    <p className="text-xs text-slate-600 truncate">
                      {selectedCategory.banner_title || `Used across the ${selectedCategory.name} category landing experience`}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewBannerCat(selectedCategory)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Preview
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openBannerEditor(selectedCategory)}
                      className="rounded-xl bg-[#2c5270] px-4 py-2 text-xs font-bold text-white hover:bg-[#23425b]"
                    >
                      Manage banner
                    </button>
                  )}
                </div>
              </div>

              {/* Services Section Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efede8] px-5 py-3.5">
                <h2 className="text-sm font-bold text-slate-900">Services</h2>
                <button
                  type="button"
                  onClick={() => setShowFilterRow((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Filter className="h-3.5 w-3.5" /> Filter
                </button>
              </div>

              {showFilterRow && (
                <div className="flex flex-wrap items-center gap-2 border-b border-[#efede8] bg-[#faf9f6] px-5 py-3">
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search services..."
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:border-[#2c5270]"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700"
                  >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              )}

              {/* Service Rows */}
              <div className="divide-y divide-[#efede8]">
                {categorySubServices.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-400">
                    No services in {selectedCategory.name} yet.
                  </div>
                ) : (
                  categorySubServices.map((svc) => {
                    const thumb = resolveMediaSrc(svc.main_image || svc.cover_image);
                    return (
                      <div
                        key={svc.id}
                        onClick={() =>
                          navigateTo(`/services/${selectedCategory.slug}/${svc.slug}`, selectedCategory.slug, svc.slug)
                        }
                        className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-[#faf9f6]"
                      >
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#eeeeea] text-slate-600">
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt={svc.name} className="h-full w-full object-cover" />
                            ) : (
                              <ServiceGlyph name={svc.name} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{svc.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500 truncate">
                              {[svc.summary || null, svc.price_note || null, formatInr(svc.starting_price_paise)]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                              svc.is_active
                                ? "bg-[#e3edf3] text-[#2c5270]"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {svc.is_active ? "Active" : "Inactive"}
                          </span>
                          <ArrowRight className="h-4 w-4 text-slate-500" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        ) : (
          /* ================================================================= */
          /* SCREEN 1: SERVICE CATEGORIES (Image 1 exact layout)               */
          /* ================================================================= */
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Catalog</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Service categories
                </h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Choose a category to manage the service options customers can book.
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => openCategoryEditor("new")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#2c5270] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#23425b]"
                >
                  <Plus className="h-4 w-4" /> Add category
                </button>
              )}
            </div>

            <section className="overflow-hidden rounded-2xl border border-[#e7e5df] bg-white shadow-xs">
              {/* Top Search & Count Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efede8] px-5 py-4">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search categories"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-[#faf9f6] pl-10 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-[#2c5270] focus:bg-white"
                  />
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {filteredCategories.length} categories
                </span>
              </div>

              {/* Clean Category Rows */}
              <div className="divide-y divide-[#efede8]">
                {filteredCategories.length === 0 ? (
                  <div className="p-10 text-center text-xs text-slate-400">
                    No service categories match your search.
                  </div>
                ) : (
                  filteredCategories.map((cat, idx) => {
                    const count =
                      cat.sub_service_count ?? services.filter((s) => s.category_id === cat.id).length;
                    const cardImg = resolveMediaSrc(cat.image_url);
                    return (
                      <div
                        key={cat.id}
                        onClick={() => navigateTo(`/services/${cat.slug}`, cat.slug, "")}
                        className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#faf9f6]"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div
                            className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-slate-600 ${
                              idx === 0 ? "bg-[#e3ecf2] text-[#2c5270]" : "bg-[#eeeeea]"
                            }`}
                          >
                            {cardImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={cardImg} alt={cat.name} className="h-full w-full object-cover" />
                            ) : (
                              <CategoryGlyph name={cat.name} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900">{cat.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {count} {count === 1 ? "active service" : "active services"}
                            </p>
                          </div>
                        </div>

                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* FITTED POPUP: ADD / EDIT CATEGORY                                   */}
      {/* =================================================================== */}
      {catEditTarget && (
        <FittedModal
          title={catEditTarget === "new" ? "Add category" : `Edit category — ${catEditTarget.name}`}
          subtitle="Category details, card artwork (800 × 600 px), and banner settings."
          onClose={() => setCatEditTarget(null)}
          footer={
            <div className="flex w-full items-center justify-between">
              {catEditTarget !== "new" ? (
                <button
                  type="button"
                  onClick={() => void handleDeleteCategory(catEditTarget)}
                  className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatEditTarget(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="cat-edit-form"
                  disabled={busy}
                  className="rounded-xl bg-[#2c5270] px-5 py-2 text-xs font-bold text-white hover:bg-[#23425b] disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Save category"}
                </button>
              </div>
            </div>
          }
        >
          <form id="cat-edit-form" onSubmit={handleSaveCategory} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Category name *</label>
                <input
                  required
                  value={catForm.name}
                  onChange={(e) =>
                    setCatForm({
                      ...catForm,
                      name: e.target.value,
                      slug: catEditTarget === "new" ? slugify(e.target.value) : catForm.slug,
                    })
                  }
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">URL slug *</label>
                <input
                  required
                  value={catForm.slug}
                  onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-700">Short description</label>
                <input
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Display order</label>
                <input
                  type="number"
                  min={0}
                  value={catForm.sort_order}
                  onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={catForm.is_active}
                    onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })}
                  />
                  Active category
                </label>
              </div>
            </div>

            {catEditTarget !== "new" && (
              <div className="grid gap-4 border-t border-[#efede8] pt-4 sm:grid-cols-2">
                <ImageUploadSlotBox
                  title="Category card image"
                  recommendedSize="800 × 600 px"
                  imageUrl={catEditTarget.image_url}
                  uploading={uploadingSlot === `cat_${catEditTarget.id}_card`}
                  aspectClass="aspect-[4/3]"
                  onUpload={(f) => void handleCategoryImageUpload(catEditTarget.id, f, "card")}
                  onClear={() => void handleCategoryImageClear(catEditTarget.id, "card")}
                />
                <ImageUploadSlotBox
                  title="Category banner image"
                  recommendedSize="1920 × 600 px"
                  imageUrl={catEditTarget.banner_image}
                  uploading={uploadingSlot === `cat_${catEditTarget.id}_banner`}
                  aspectClass="aspect-[16/5]"
                  onUpload={(f) => void handleCategoryImageUpload(catEditTarget.id, f, "banner")}
                  onClear={() => void handleCategoryImageClear(catEditTarget.id, "banner")}
                />
              </div>
            )}
          </form>
        </FittedModal>
      )}

      {/* =================================================================== */}
      {/* FITTED POPUP: MANAGE / EDIT BANNER                                  */}
      {/* =================================================================== */}
      {catBannerTarget && (
        <FittedModal
          title={`Manage banner — ${catBannerTarget.name}`}
          subtitle="Recommended size: 1920 × 600 px · JPG, PNG, WebP"
          maxWidth="max-w-xl"
          onClose={() => setCatBannerTarget(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setCatBannerTarget(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="cat-banner-form"
                disabled={busy}
                className="rounded-xl bg-[#2c5270] px-5 py-2 text-xs font-bold text-white hover:bg-[#23425b] disabled:opacity-50"
              >
                {busy ? "Saving..." : "Save banner"}
              </button>
            </>
          }
        >
          <form id="cat-banner-form" onSubmit={handleSaveCategoryBanner} className="space-y-4">
            <ImageUploadSlotBox
              title="Category banner image"
              recommendedSize="1920 × 600 px"
              imageUrl={catBannerTarget.banner_image}
              uploading={uploadingSlot === `cat_${catBannerTarget.id}_banner`}
              aspectClass="aspect-[16/5]"
              onUpload={(f) => void handleCategoryImageUpload(catBannerTarget.id, f, "banner")}
              onClear={() => void handleCategoryImageClear(catBannerTarget.id, "banner")}
            />
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Banner title</label>
              <input
                value={bannerForm.banner_title}
                onChange={(e) => setBannerForm({ ...bannerForm, banner_title: e.target.value })}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Banner subtitle</label>
              <textarea
                rows={2}
                value={bannerForm.banner_subtitle}
                onChange={(e) => setBannerForm({ ...bannerForm, banner_subtitle: e.target.value })}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Button text</label>
                <input
                  value={bannerForm.banner_button_text}
                  onChange={(e) => setBannerForm({ ...bannerForm, banner_button_text: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Button link</label>
                <input
                  value={bannerForm.banner_button_link}
                  onChange={(e) => setBannerForm({ ...bannerForm, banner_button_link: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={bannerForm.banner_is_active}
                onChange={(e) => setBannerForm({ ...bannerForm, banner_is_active: e.target.checked })}
              />
              Banner status active
            </label>
          </form>
        </FittedModal>
      )}

      {/* =================================================================== */}
      {/* FITTED POPUP: BANNER PREVIEW                                        */}
      {/* =================================================================== */}
      {previewBannerCat && (
        <FittedModal
          title={`Preview — ${previewBannerCat.name} banner`}
          maxWidth="max-w-3xl"
          onClose={() => setPreviewBannerCat(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setPreviewBannerCat(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const target = previewBannerCat;
                    setPreviewBannerCat(null);
                    openBannerEditor(target);
                  }}
                  className="rounded-xl bg-[#2c5270] px-4 py-2 text-xs font-bold text-white hover:bg-[#23425b]"
                >
                  Manage banner
                </button>
              )}
            </>
          }
        >
          {previewBannerCat.banner_image ? (
            <div className="relative aspect-[16/5] w-full overflow-hidden rounded-xl bg-slate-900 text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveMediaSrc(previewBannerCat.banner_image)}
                alt={previewBannerCat.banner_title || previewBannerCat.name}
                className="h-full w-full object-cover opacity-85"
              />
              <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-slate-950/80 to-transparent px-6">
                <h3 className="text-xl font-bold">
                  {previewBannerCat.banner_title || `${previewBannerCat.name} Services`}
                </h3>
                {previewBannerCat.banner_subtitle && (
                  <p className="mt-1 max-w-lg text-xs text-slate-200">{previewBannerCat.banner_subtitle}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-[#faf9f6] p-8 text-center text-xs text-slate-500">
              No banner image uploaded for {previewBannerCat.name} yet. Upload one via Manage banner.
            </div>
          )}
        </FittedModal>
      )}

      {/* =================================================================== */}
      {/* FITTED POPUP: ADD SERVICE                                           */}
      {/* =================================================================== */}
      {newSubModalCatId !== null && (
        <FittedModal
          title="Add service"
          subtitle="Create a new sub-service under this category."
          maxWidth="max-w-lg"
          onClose={() => setNewSubModalCatId(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setNewSubModalCatId(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="quick-sub-form"
                disabled={busy}
                className="rounded-xl bg-[#2c5270] px-5 py-2 text-xs font-bold text-white hover:bg-[#23425b] disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create service"}
              </button>
            </>
          }
        >
          <form id="quick-sub-form" onSubmit={handleCreateSubService} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Parent category *</label>
              <select
                required
                value={newSubForm.category_id}
                onChange={(e) => setNewSubForm({ ...newSubForm, category_id: e.target.value })}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Service name *</label>
              <input
                required
                value={newSubForm.name}
                onChange={(e) =>
                  setNewSubForm({
                    ...newSubForm,
                    name: e.target.value,
                    slug: slugify(e.target.value),
                  })
                }
                placeholder="e.g. AC Inspection"
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">URL slug *</label>
              <input
                required
                value={newSubForm.slug}
                onChange={(e) => setNewSubForm({ ...newSubForm, slug: e.target.value })}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Customer summary</label>
              <input
                value={newSubForm.summary}
                onChange={(e) => setNewSubForm({ ...newSubForm, summary: e.target.value })}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Starting price (₹)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newSubForm.price_rupees}
                  onChange={(e) => setNewSubForm({ ...newSubForm, price_rupees: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">Display order</label>
                <input
                  type="number"
                  min={0}
                  value={newSubForm.sort_order}
                  onChange={(e) => setNewSubForm({ ...newSubForm, sort_order: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
            </div>
          </form>
        </FittedModal>
      )}
    </div>
  );
}

export function AdminCategoriesScreen(props: { canEdit: boolean }) {
  return <AdminServicesScreen canEdit={props.canEdit} />;
}

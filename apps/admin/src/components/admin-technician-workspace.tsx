"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { api, base, uploadMultipart, type Row } from "../lib/api";
import { AdminDataTable, type AdminColumn } from "./admin/admin-data-table";
import { AdminErrorState } from "./admin/admin-error-state";
import { AdminPageHeader } from "./admin/admin-page-header";
import { AdminPagination } from "./admin/admin-pagination";
import { AdminStatusBadge } from "./admin/admin-status-badge";

type SupportedService = {
  id: string;
  name: string;
  category: string;
  is_active: boolean;
};

type ServiceAreaItem = {
  id: string;
  name: string;
  city: string;
  postal_code: string;
  is_active: boolean;
};

type TechnicianDoc = {
  id: string;
  kind: string;
  status: string;
  content_type?: string;
  url: string;
  created_at?: string;
};

type TechnicianDetail = {
  id: string;
  employee_code: string;
  name: string;
  display_name: string;
  phone: string;
  virtual_mobile_number: string;
  alternate_phone: string;
  email: string;
  city: string;
  address: string;
  pincode: string;
  service_group: string;
  profile_type: string;
  lead_per_day: number;
  job_per_day: number;
  no_of_teams: number;
  sales_person_assigned_name: string;
  crm_owner_id: string;
  id_proof_number: string;
  technician_type: "PARTNER" | "EMPLOYEE" | "CONTRACT";
  experience_years: number;
  joined_at: string | null;
  languages: string[];
  whatsapp_notifications_enabled: boolean;
  internal_notes: string;
  status: string;
  background_verification_status: string;
  is_active: boolean;
  is_online: boolean;
  profile_photo_url: string;
  supported_services: SupportedService[];
  service_areas: ServiceAreaItem[];
  documents: TechnicianDoc[];
  completed_jobs: number;
  cancelled_jobs: number;
  approved_rating: number | null;
  approved_review_count: number;
};

type CatalogServiceOption = {
  id: string;
  name: string;
  category_name?: string;
  is_active: boolean;
};

type ZoneOption = {
  id: string;
  name: string;
  city: string;
  postal_code: string;
  is_active: boolean;
};

type CompanyUser = {
  id: string;
  user_id: number;
  name: string;
  phone_e164: string;
  role: "OWNER" | "MANAGER" | "TECHNICIAN";
  is_active: boolean;
};

type TechnicianReview = {
  id: string;
  booking_reference: string;
  service: string;
  reviewer_name: string;
  rating: number;
  comment: string;
  is_visible: boolean;
  created_at: string;
};

const tabs = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "services", label: "Services", icon: Wrench },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "users", label: "Users", icon: UsersRound },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "documents", label: "Documents", icon: FileText },
] as const;

type WorkspaceTab = (typeof tabs)[number]["id"];
const inputClass =
  "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-none outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-300/30";

function resolveUrl(pathOrUrl?: string) {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("blob:")) {
    return pathOrUrl;
  }
  return pathOrUrl.startsWith("/") ? `${base}${pathOrUrl}` : `${base}/${pathOrUrl}`;
}

export function AdminTechniciansDirectory({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add technician modal
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("+91");
  const [newCity, setNewCity] = useState("Chennai");
  const [newType, setNewType] = useState<"PARTNER" | "EMPLOYEE" | "CONTRACT">("PARTNER");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ page: String(page) });
      if (search.trim()) q.set("q", search.trim());
      if (statusFilter) q.set("status", statusFilter);
      if (activeFilter) q.set("is_active", activeFilter);
      const res = await api<{ count: number; results: Row[] }>(`/admin/technicians/?${q}`);
      setRows(res.results ?? []);
      setCount(res.count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load technicians.");
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, activeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddTechnician = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await api<{ id: string }>("/admin/technicians/", "POST", {
        display_name: newName.trim(),
        phone: newPhone.trim(),
        city: newCity.trim(),
        technician_type: newType,
      });
      setShowAdd(false);
      window.location.assign(`/technicians/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add technician.");
    } finally {
      setSaving(false);
    }
  };

  const columns: AdminColumn<Row>[] = [
    {
      key: "name",
      header: "Technician",
      render: (t) => (
        <div>
          <a href={`/technicians/${t.id}`} className="font-bold text-slate-900 hover:text-teal-800 hover:underline">
            {String(t.name || "Technician")}
          </a>
          <p className="text-xs text-slate-500">{String(t.employee_code || "NPT")}</p>
          <a className="text-xs text-violet-700 hover:underline" href={`tel:${t.phone}`}>
            {String(t.phone || "—")}
          </a>
        </div>
      ),
    },
    {
      key: "city",
      header: "City",
      render: (t) => <span className="font-medium text-slate-700">{String(t.city || "—")}</span>,
    },
    {
      key: "services",
      header: "Assigned Services",
      render: (t) => {
        const svcs = Array.isArray(t.services) ? (t.services as string[]) : [];
        return (
          <span className="text-xs text-slate-600">
            {svcs.length ? svcs.slice(0, 3).join(", ") + (svcs.length > 3 ? ` +${svcs.length - 3}` : "") : "No services"}
          </span>
        );
      },
    },
    {
      key: "zones",
      header: "Service Areas",
      render: (t) => {
        const zs = Array.isArray(t.zones) ? (t.zones as string[]) : [];
        return (
          <span className="text-xs text-slate-600">
            {zs.length ? zs.slice(0, 3).join(", ") + (zs.length > 3 ? ` +${zs.length - 3}` : "") : "No areas"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <div className="flex flex-wrap gap-1.5">
          <AdminStatusBadge status={t.is_active ? "ACTIVE" : "INACTIVE"} />
          <AdminStatusBadge status={String(t.status || "PENDING")} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (t) => (
        <a
          href={`/technicians/${t.id}`}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-slate-50 transition"
        >
          Manage
        </a>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Technicians"
        description="Manage technician profiles, service coverage, locations, partner users, reviews, and KYC documents."
        action={
          canEdit && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-800 transition"
            >
              <Plus className="h-4 w-4" />
              Add technician
            </button>
          )
        }
      />

      {error && <AdminErrorState message={error} onRetry={() => void load()} />}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name, phone, or employee code"
            className={`${inputClass} pl-9 bg-slate-50`}
          />
        </div>
        <select
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
        >
          <option value="">Active and inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
        >
          <option value="">All verification statuses</option>
          {["PENDING_DOCUMENTS", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"].map((st) => (
            <option key={st} value={st}>
              {st.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="grid min-h-56 place-items-center rounded-xl border border-slate-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
        </div>
      ) : (
        <>
          <AdminDataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => String(r.id)}
            onRowClick={(r) => window.location.assign(`/technicians/${r.id}`)}
            emptyIcon={Wrench}
            emptyTitle="No technicians found"
            emptyMessage="Add a technician or adjust filters."
          />
          <AdminPagination
            count={count}
            page={page}
            pageSize={20}
            hasNext={page * 20 < count}
            hasPrevious={page > 1}
            onPageChange={setPage}
          />
        </>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">Add Technician</h2>
              <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddTechnician} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Technician / Partner Name *</label>
                <input required value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} placeholder="e.g. AS Refrigeration" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number *</label>
                <input required value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={inputClass} placeholder="+919876543210" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                <input value={newCity} onChange={(e) => setNewCity(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Technician Type</label>
                <select value={newType} onChange={(e) => setNewType(e.target.value as typeof newType)} className={inputClass}>
                  <option value="PARTNER">PARTNER</option>
                  <option value="EMPLOYEE">EMPLOYEE</option>
                  <option value="CONTRACT">CONTRACT</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">
                  {saving ? "Adding..." : "Add technician"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminTechnicianWorkspace({ technicianId, canEdit }: { technicianId: string; canEdit: boolean }) {
  const [data, setData] = useState<TechnicianDetail | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("profile");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Modals & options
  const [allServices, setAllServices] = useState<CatalogServiceOption[]>([]);
  const [allZones, setAllZones] = useState<ZoneOption[]>([]);
  const [serviceModal, setServiceModal] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [pendingServiceIds, setPendingServiceIds] = useState<string[]>([]);

  const [locationModal, setLocationModal] = useState(false);
  const [recommendedMode, setRecommendedMode] = useState(false);
  const [areaSearch, setAreaSearch] = useState("");
  const [areaCity, setAreaCity] = useState("");
  const [pendingAreaIds, setPendingAreaIds] = useState<string[]>([]);

  // Company Users state
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyRole, setCompanyRole] = useState<"OWNER" | "MANAGER" | "TECHNICIAN">("TECHNICIAN");

  // Reviews state
  const [reviews, setReviews] = useState<TechnicianReview[]>([]);
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewRating, setReviewRating] = useState("");
  const [reviewVisibility, setReviewVisibility] = useState("");

  // Documents & photo refs
  const photoInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<"IDENTITY" | "ADDRESS" | "CERTIFICATION">("IDENTITY");
  const [previewUrl, setPreviewUrl] = useState("");

  // Profile editor state
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<TechnicianDetail>(`/admin/technicians/${technicianId}/`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load technician profile.");
    } finally {
      setLoading(false);
    }
  }, [technicianId]);

  const loadOptions = useCallback(async () => {
    try {
      const [svcRes, zoneRes] = await Promise.all([
        api<{ results: CatalogServiceOption[] }>("/admin/services/?page=1"),
        api<{ results: ZoneOption[] }>("/admin/zones/?page=1"),
      ]);
      setAllServices(svcRes.results ?? []);
      setAllZones(zoneRes.results ?? []);
    } catch {
      // Options load best-effort
    }
  }, []);

  const loadCompanyUsers = useCallback(async () => {
    try {
      const res = await api<{ results: CompanyUser[] }>(`/admin/technicians/${technicianId}/company-users/`);
      setCompanyUsers(res.results ?? []);
    } catch {
      setCompanyUsers([]);
    }
  }, [technicianId]);

  const loadReviews = useCallback(async () => {
    try {
      const q = new URLSearchParams({ technician: technicianId });
      if (reviewSearch.trim()) q.set("q", reviewSearch.trim());
      if (reviewRating) q.set("rating", reviewRating);
      if (reviewVisibility) q.set("visible", reviewVisibility);
      const res = await api<{ results: TechnicianReview[] }>(`/admin/reviews/?${q}`);
      setReviews(res.results ?? []);
    } catch {
      setReviews([]);
    }
  }, [technicianId, reviewSearch, reviewRating, reviewVisibility]);

  useEffect(() => {
    void loadProfile();
    void loadOptions();
  }, [loadProfile, loadOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncHash = () => {
      const hash = window.location.hash.slice(1) as WorkspaceTab;
      if (tabs.some((t) => t.id === hash)) setTab(hash);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (tab === "users") void loadCompanyUsers();
    if (tab === "reviews") void loadReviews();
  }, [tab, loadCompanyUsers, loadReviews]);

  const openEditor = () => {
    if (!data) return;
    setEditForm({
      display_name: data.display_name,
      city: data.city,
      alternate_phone: data.alternate_phone,
      virtual_mobile_number: data.virtual_mobile_number,
      email: data.email,
      address: data.address,
      pincode: data.pincode,
      service_group: data.service_group,
      profile_type: data.profile_type,
      lead_per_day: data.lead_per_day,
      job_per_day: data.job_per_day,
      no_of_teams: data.no_of_teams,
      sales_person_assigned_name: data.sales_person_assigned_name,
      crm_owner_id: data.crm_owner_id,
      id_proof_number: data.id_proof_number,
      technician_type: data.technician_type,
      experience_years: data.experience_years,
      joined_at: data.joined_at ?? "",
      languages_text: (data.languages ?? []).join(", "),
      whatsapp_notifications_enabled: data.whatsapp_notifications_enabled,
      is_active: data.is_active,
      is_online: data.is_online,
      background_verification_status: data.background_verification_status,
      internal_notes: data.internal_notes,
    });
    setEditing(true);
  };

  const saveProfileEdits = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { languages_text, ...rest } = editForm;
      const langs = String(languages_text ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const payload = { ...rest, languages: langs };
      const updated = await api<TechnicianDetail>(`/admin/technicians/${technicianId}/`, "PATCH", payload);
      setData(updated);
      setEditing(false);
      setNotice("Technician profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  };

  const saveServices = async (nextIds: string[]) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await api<TechnicianDetail>(`/admin/technicians/${technicianId}/`, "PATCH", {
        supported_service_ids: nextIds,
      });
      setData(updated);
      setServiceModal(false);
      setPendingServiceIds([]);
      setNotice("Services updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update services.");
    } finally {
      setBusy(false);
    }
  };

  const saveAreas = async (nextIds: string[]) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await api<TechnicianDetail>(`/admin/technicians/${technicianId}/`, "PATCH", {
        service_area_ids: nextIds,
      });
      setData(updated);
      setLocationModal(false);
      setPendingAreaIds([]);
      setNotice("Locations updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update locations.");
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFile = async (kind: "PROFILE_PHOTO" | "IDENTITY" | "ADDRESS" | "CERTIFICATION", file: File) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      await uploadMultipart(`/admin/technicians/${technicianId}/documents/`, fd);
      setNotice(kind === "PROFILE_PHOTO" ? "Logo / profile image updated." : "Document uploaded.");
      await loadProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : "File upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddCompanyUser = async () => {
    if (!companyPhone.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/admin/technicians/${technicianId}/company-users/`, "POST", {
        phone_number: companyPhone.trim(),
        role: companyRole,
      });
      setCompanyPhone("");
      setNotice("Partner app access enabled.");
      await loadCompanyUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add company user.");
    } finally {
      setBusy(false);
    }
  };

  const categories = useMemo(
    () => [...new Set(allServices.map((s) => s.category_name).filter((x): x is string => Boolean(x)))].sort(),
    [allServices]
  );
  const cities = useMemo(() => [...new Set(allZones.map((z) => z.city).filter(Boolean))].sort(), [allZones]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center bg-[#f3f4f6] text-sm text-slate-500">
        Loading technician workspace…
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="min-h-[60vh] bg-[#f3f4f6] p-8">
        <AdminErrorState message={error} onRetry={() => void loadProfile()} />
      </div>
    );
  }
  if (!data) return null;

  const selectedServiceIds = data.supported_services.map((s) => s.id);
  const selectedAreaIds = data.service_areas.map((a) => a.id);

  const availableServicesToAdd = allServices.filter(
    (s) =>
      s.is_active &&
      !selectedServiceIds.includes(s.id) &&
      s.name.toLowerCase().includes(serviceSearch.toLowerCase()) &&
      (!serviceCategory || s.category_name === serviceCategory)
  );

  const availableZonesToAdd = allZones.filter((z) => {
    if (!z.is_active || selectedAreaIds.includes(z.id)) return false;
    const matchesSearch =
      z.name.toLowerCase().includes(areaSearch.toLowerCase()) ||
      z.postal_code.includes(areaSearch);
    const matchesCity = recommendedMode
      ? z.city.toLowerCase() === (data.city || "").toLowerCase()
      : !areaCity || z.city === areaCity;
    return matchesSearch && matchesCity;
  });

  const title = {
    profile: "Technician Profile",
    services: "Service List",
    locations: "Company Locations",
    users: "Company Users",
    reviews: "Reviews",
    documents: "Document List",
  }[tab];

  return (
    <div className="-mx-4 -my-6 bg-[#f3f4f6] text-[#111827] min-h-[calc(100vh-5rem)] sm:-mx-6 lg:-mx-8">
      <div className="grid lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[205px_minmax(0,1fr)]">
        {/* PurpleSquad Exact Left Inner Workspace Column */}
        <aside className="border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
          <div className="flex h-[112px] items-center justify-center border-b border-slate-200 px-4">
            <div className="grid h-[88px] w-[88px] place-items-center overflow-hidden rounded-full bg-violet-100 text-violet-700 shadow-xs">
              {data.profile_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveUrl(data.profile_photo_url)}
                  alt={`${data.display_name} profile`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserRound className="h-9 w-9" />
              )}
            </div>
          </div>

          <nav aria-label="Technician workspace sections" className="grid">
            {tabs.map(({ id: tabId, label, icon: Icon }) => (
              <a
                key={tabId}
                href={`#${tabId}`}
                onClick={() => {
                  setTab(tabId);
                  setEditing(false);
                }}
                aria-current={tab === tabId ? "page" : undefined}
                className={`flex h-[58px] items-center gap-3 border-t border-slate-200 px-6 text-[13px] font-medium transition-colors ${
                  tab === tabId
                    ? "bg-violet-50 text-violet-700 font-semibold border-l-2 border-l-violet-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </aside>

        {/* Right Main Content Pane */}
        <main className="min-w-0 px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1180px] space-y-4">
            {/* Top breadcrumb + Header + Status pills */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <a href="/technicians" className="text-xs font-bold text-teal-800 hover:underline">
                  ← All Technicians
                </a>
                <h1 className="mt-1 text-[20px] font-bold tracking-tight text-slate-900">{title}</h1>
                {tab === "profile" && (
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    {data.display_name} · {data.employee_code}
                  </p>
                )}
              </div>
              {tab === "profile" && (
                <div className="flex flex-wrap items-center gap-2">
                  <AdminStatusBadge status={data.is_active ? "ACTIVE" : "INACTIVE"} />
                  <AdminStatusBadge status={data.background_verification_status} />
                </div>
              )}
            </div>

            {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">{error}</div>}
            {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{notice}</div>}

            {/* TAB 1: PROFILE */}
            {tab === "profile" && (
              editing ? (
                <form onSubmit={saveProfileEdits} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <h2 className="text-base font-bold text-slate-900">Edit Technician Profile</h2>
                    <button type="button" onClick={() => setEditing(false)} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                      Cancel
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      ["display_name", "Technician / Company Name"],
                      ["city", "City"],
                      ["virtual_mobile_number", "Virtual Mobile Number"],
                      ["alternate_phone", "Alternate Mobile"],
                      ["email", "Email"],
                      ["pincode", "Pincode"],
                      ["service_group", "Service Group"],
                      ["profile_type", "Profile Type"],
                      ["sales_person_assigned_name", "Sales Person Assigned"],
                      ["crm_owner_id", "CRM Owner ID"],
                      ["id_proof_number", "Aadhaar Number"],
                    ].map(([k, lbl]) => (
                      <label key={k} className="grid gap-1 text-xs font-bold text-slate-700">
                        <span>{lbl}</span>
                        <input
                          value={String(editForm[k] ?? "")}
                          onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })}
                          className={inputClass}
                        />
                      </label>
                    ))}
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>Technician Type</span>
                      <select
                        value={String(editForm.technician_type ?? "PARTNER")}
                        onChange={(e) => setEditForm({ ...editForm, technician_type: e.target.value })}
                        className={inputClass}
                      >
                        <option value="PARTNER">PARTNER</option>
                        <option value="EMPLOYEE">EMPLOYEE</option>
                        <option value="CONTRACT">CONTRACT</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>Lead Per Day</span>
                      <input type="number" min="0" value={String(editForm.lead_per_day ?? 0)} onChange={(e) => setEditForm({ ...editForm, lead_per_day: Number(e.target.value) })} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>Job Per Day</span>
                      <input type="number" min="0" value={String(editForm.job_per_day ?? 0)} onChange={(e) => setEditForm({ ...editForm, job_per_day: Number(e.target.value) })} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>No of Teams</span>
                      <input type="number" min="1" value={String(editForm.no_of_teams ?? 1)} onChange={(e) => setEditForm({ ...editForm, no_of_teams: Number(e.target.value) })} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>Experience (years)</span>
                      <input type="number" min="0" value={String(editForm.experience_years ?? 0)} onChange={(e) => setEditForm({ ...editForm, experience_years: Number(e.target.value) })} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>Date Joined</span>
                      <input type="date" value={String(editForm.joined_at ?? "")} onChange={(e) => setEditForm({ ...editForm, joined_at: e.target.value })} className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>Languages (comma-separated)</span>
                      <input value={String(editForm.languages_text ?? "")} onChange={(e) => setEditForm({ ...editForm, languages_text: e.target.value })} placeholder="Tamil, English" className={inputClass} />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      <span>KYC Verification</span>
                      <select
                        value={String(editForm.background_verification_status ?? "PENDING_DOCUMENTS")}
                        onChange={(e) => setEditForm({ ...editForm, background_verification_status: e.target.value })}
                        className={inputClass}
                      >
                        {["REGISTERED", "PENDING_DOCUMENTS", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"].map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700 sm:col-span-2">
                      <span>Address</span>
                      <input value={String(editForm.address ?? "")} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className={inputClass} />
                    </label>
                    <div className="sm:col-span-2 flex flex-wrap gap-6 pt-1 text-xs font-bold text-slate-700">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={Boolean(editForm.is_active)} onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })} className="accent-teal-700" />
                        Active Technician
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={Boolean(editForm.is_online)} onChange={(e) => setEditForm({ ...editForm, is_online: e.target.checked })} className="accent-teal-700" />
                        Available for Bookings (Online)
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={Boolean(editForm.whatsapp_notifications_enabled)} onChange={(e) => setEditForm({ ...editForm, whatsapp_notifications_enabled: e.target.checked })} className="accent-teal-700" />
                        WhatsApp Assignment Alerts
                      </label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                    <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700">
                      Cancel
                    </button>
                    <button type="submit" disabled={busy} className="rounded-lg bg-teal-700 px-5 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50">
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <section className="space-y-4">
                  {/* Card 1: Profile */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-[17px] font-bold text-slate-900">{data.display_name}</h2>
                        <p className="mt-1 text-sm text-slate-500">Technician ID · {data.employee_code}</p>
                      </div>
                      {canEdit && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={openEditor}
                            className="h-9 rounded-full border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                          >
                            Edit
                          </button>
                          <input
                            ref={photoInput}
                            className="sr-only"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (file) void handleUploadFile("PROFILE_PHOTO", file);
                            }}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => photoInput.current?.click()}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50 transition"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            Upload logo
                          </button>
                        </div>
                      )}
                    </div>

                    <dl className="grid min-w-0 gap-x-8 sm:grid-cols-2">
                      {[
                        ["Mobile Number", data.phone],
                        ["Virtual Mobile Number", data.virtual_mobile_number],
                        ["City", data.city],
                        ["Address", data.address],
                        ["Service Group", data.service_group],
                        ["Profile Type", data.profile_type],
                        ["Lead Per Day", String(data.lead_per_day ?? 0)],
                        ["Job Per Day", String(data.job_per_day ?? 0)],
                        ["No of Teams", String(data.no_of_teams ?? 1)],
                        ["Sales Person Assigned", data.sales_person_assigned_name],
                        ["CRM Owner ID", data.crm_owner_id],
                        ["Aadhaar Number", data.id_proof_number ? `•••• •••• ${data.id_proof_number.slice(-4)}` : "—"],
                        ["Alternate Mobile", data.alternate_phone],
                        ["Email", data.email],
                        ["Pincode", data.pincode],
                        ["Technician Type", data.technician_type],
                        ["Primary Service Category", data.supported_services[0]?.category ?? "—"],
                        ["Experience", `${data.experience_years ?? 0}.0 years`],
                        ["Date Joined", data.joined_at ?? "—"],
                        ["Languages", data.languages?.join(", ") || "—"],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="grid min-w-0 grid-cols-[minmax(118px,0.75fr)_minmax(0,1.25fr)] gap-3 border-b border-slate-100 py-2 text-[13px] last:border-0"
                        >
                          <dt className="font-medium text-slate-800">{label}</dt>
                          <dd className="min-w-0 break-words text-slate-600">{value || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* Card 2: Status */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="mb-4 text-[16px] font-bold text-slate-900">Status</h2>
                    <dl className="divide-y divide-slate-200 text-[13px]">
                      {[
                        ["Technician Status", data.is_active ? "ACTIVE" : "INACTIVE"],
                        ["KYC Verification", data.background_verification_status],
                        ["Available for Bookings", data.is_active && data.is_online ? "Yes" : "No"],
                        ["Vendor App Account", "Linked technician account"],
                        ["Suspended", data.background_verification_status === "SUSPENDED" ? "Yes" : "No"],
                        ["Assigned Services Count", String(data.supported_services.length)],
                        ["Assigned Locations Count", String(data.service_areas.length)],
                      ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] gap-4 py-2">
                          <dt className="text-slate-700">{label}</dt>
                          <dd className="font-medium text-slate-800">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  {/* Card 3: Performance */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="mb-4 text-[16px] font-bold text-slate-900">Performance</h2>
                    <dl className="divide-y divide-slate-200 text-[13px]">
                      {[
                        ["Completed Jobs", String(data.completed_jobs ?? 0)],
                        ["Cancelled Jobs", String(data.cancelled_jobs ?? 0)],
                        ["Average Rating", data.approved_rating ? `${data.approved_rating} / 5` : "—"],
                        ["Total Reviews", String(data.approved_review_count ?? 0)],
                      ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] gap-4 py-2">
                          <dt className="text-slate-700">{label}</dt>
                          <dd className="font-medium text-slate-800">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </section>
              )
            )}

            {/* TAB 2: SERVICES (Screenshot 1) */}
            {tab === "services" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
                  <h2 className="text-[16px] font-bold text-slate-900">Service List</h2>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setServiceSearch("");
                        setServiceCategory("");
                        setPendingServiceIds([]);
                        setServiceModal(true);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 transition"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  )}
                </div>

                {data.supported_services.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-[13px]">
                      <thead className="bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Service</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.supported_services.map((svc) => (
                          <tr key={svc.id}>
                            <td className="px-5 py-4 font-medium text-slate-800">
                              {svc.name}
                              <span className="mt-1 block text-[11px] text-slate-500">{svc.category}</span>
                            </td>
                            <td className="px-5 py-4">
                              <AdminStatusBadge status={svc.is_active ? "ACTIVE" : "INACTIVE"} />
                            </td>
                            <td className="px-5 py-4">
                              {canEdit && (
                                <button
                                  type="button"
                                  aria-label={`Remove ${svc.name}`}
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(`Remove ${svc.name} from this technician?`)) {
                                      void saveServices(selectedServiceIds.filter((x) => x !== svc.id));
                                    }
                                  }}
                                  className="rounded p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-16 text-center text-[15px] font-semibold text-slate-700">
                    There are no services assigned to this technician
                  </p>
                )}
              </section>
            )}

            {/* TAB 3: LOCATIONS (Screenshot 2) */}
            {tab === "locations" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <h2 className="text-[16px] font-bold text-slate-900">Company Locations</h2>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRecommendedMode(false);
                          setAreaSearch("");
                          setAreaCity("");
                          setPendingAreaIds([]);
                          setLocationModal(true);
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-teal-700 px-3.5 text-xs font-bold text-white hover:bg-teal-800 transition"
                      >
                        <Plus className="h-4 w-4" />
                        Add Location
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRecommendedMode(true);
                          setAreaSearch("");
                          setAreaCity(data.city ?? "");
                          setPendingAreaIds([]);
                          setLocationModal(true);
                        }}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <MapPin className="h-4 w-4" />
                        Add Recommended Location
                      </button>
                    </div>
                  )}
                </div>

                {data.service_areas.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-[13px]">
                      <thead className="bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Location</th>
                          <th className="px-5 py-3">City</th>
                          <th className="px-5 py-3">Pincode</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {data.service_areas.map((area) => (
                          <tr key={area.id}>
                            <td className="px-5 py-4 font-medium">{area.name}</td>
                            <td className="px-5 py-4">{area.city}</td>
                            <td className="px-5 py-4">{area.postal_code || "—"}</td>
                            <td className="px-5 py-4">
                              <AdminStatusBadge status={area.is_active ? "ACTIVE" : "INACTIVE"} />
                            </td>
                            <td className="px-5 py-4">
                              {canEdit && (
                                <button
                                  type="button"
                                  aria-label={`Remove ${area.name}`}
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(`Remove ${area.name} from this technician?`)) {
                                      void saveAreas(selectedAreaIds.filter((x) => x !== area.id));
                                    }
                                  }}
                                  className="rounded p-2 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-16 text-center text-[15px] font-semibold text-slate-700">
                    There are no locations assigned to this technician
                  </p>
                )}
              </section>
            )}

            {/* TAB 4: COMPANY USERS (Screenshot 3) */}
            {tab === "users" && (
              <section className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-[16px] font-bold text-slate-900">Add partner app user</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Add their mobile number to this company. They can sign in with that number and OTP; removing or deactivating them revokes access.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                    <input
                      type="tel"
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      placeholder="Mobile number (+91...)"
                      className={inputClass}
                    />
                    <select
                      value={companyRole}
                      onChange={(e) => setCompanyRole(e.target.value as CompanyUser["role"])}
                      className={inputClass}
                    >
                      <option value="OWNER">Owner</option>
                      <option value="MANAGER">Manager</option>
                      <option value="TECHNICIAN">Staff</option>
                    </select>
                    <button
                      type="button"
                      disabled={!companyPhone.trim() || busy || !canEdit}
                      onClick={() => void handleAddCompanyUser()}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50 transition"
                    >
                      <Plus className="h-4 w-4" />
                      Enable app access
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-[16px] font-bold text-slate-900">Company Users</h2>
                  </div>
                  {companyUsers.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-[13px]">
                        <thead className="bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
                          <tr>
                            <th className="px-5 py-3">Name</th>
                            <th className="px-5 py-3">Mobile</th>
                            <th className="px-5 py-3">Role</th>
                            <th className="px-5 py-3">Status</th>
                            <th className="px-5 py-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {companyUsers.map((member) => (
                            <tr key={member.id}>
                              <td className="px-5 py-4 font-medium">{member.name}</td>
                              <td className="px-5 py-4">{member.phone_e164}</td>
                              <td className="px-5 py-4">
                                <select
                                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold"
                                  value={member.role}
                                  disabled={!canEdit || busy}
                                  onChange={async (e) => {
                                    await api(`/admin/technicians/${technicianId}/company-users/${member.id}/`, "PATCH", {
                                      role: e.target.value,
                                    });
                                    await loadCompanyUsers();
                                  }}
                                >
                                  <option value="OWNER">Owner</option>
                                  <option value="MANAGER">Manager</option>
                                  <option value="TECHNICIAN">Staff</option>
                                </select>
                              </td>
                              <td className="px-5 py-4">
                                <button
                                  type="button"
                                  disabled={!canEdit || busy}
                                  onClick={async () => {
                                    await api(`/admin/technicians/${technicianId}/company-users/${member.id}/`, "PATCH", {
                                      is_active: !member.is_active,
                                    });
                                    await loadCompanyUsers();
                                  }}
                                >
                                  <AdminStatusBadge status={member.is_active ? "ACTIVE" : "INACTIVE"} />
                                </button>
                              </td>
                              <td className="px-5 py-4">
                                {canEdit && (
                                  <button
                                    type="button"
                                    aria-label={`Remove ${member.name}`}
                                    disabled={busy}
                                    onClick={async () => {
                                      if (!window.confirm(`Remove ${member.name} from this company roster?`)) return;
                                      await api(`/admin/technicians/${technicianId}/company-users/${member.id}/`, "DELETE");
                                      await loadCompanyUsers();
                                    }}
                                    className="rounded p-2 text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-5 py-16 text-center text-sm text-slate-500">
                      No company users have been added.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* TAB 5: REVIEWS (Screenshot 4) */}
            {tab === "reviews" && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="text-[16px] font-bold text-slate-900">Reviews</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Only genuine customer feedback associated with this technician.
                  </p>
                </div>
                <div className="grid gap-2 border-b border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_150px_160px]">
                  <input
                    className={inputClass}
                    value={reviewSearch}
                    onChange={(e) => setReviewSearch(e.target.value)}
                    placeholder="Search reviews"
                  />
                  <select
                    className={inputClass}
                    value={reviewRating}
                    onChange={(e) => setReviewRating(e.target.value)}
                  >
                    <option value="">All ratings</option>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={String(r)}>
                        {r} stars
                      </option>
                    ))}
                  </select>
                  <select
                    className={inputClass}
                    value={reviewVisibility}
                    onChange={(e) => setReviewVisibility(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="true">Published</option>
                    <option value="false">Hidden</option>
                  </select>
                </div>

                {reviews.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-[13px]">
                      <thead className="bg-slate-50 text-left text-[11px] font-semibold text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Created On</th>
                          <th className="px-4 py-3">Booking Ref</th>
                          <th className="px-4 py-3">Reviewed By</th>
                          <th className="px-4 py-3">Rating</th>
                          <th className="px-4 py-3">Comment</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reviews.map((rev) => (
                          <tr key={rev.id}>
                            <td className="px-4 py-4">
                              {new Date(rev.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-4 py-4 font-bold text-slate-800">{rev.booking_reference}</td>
                            <td className="px-4 py-4 font-medium">{rev.reviewer_name}</td>
                            <td className="px-4 py-4 font-semibold text-amber-600">{rev.rating} ★</td>
                            <td className="max-w-md px-4 py-4 text-slate-700">{rev.comment || "—"}</td>
                            <td className="px-4 py-4">
                              <AdminStatusBadge status={rev.is_visible ? "ACTIVE" : "INACTIVE"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-16 text-center text-sm text-slate-500">
                    No reviews are associated with this technician.
                  </p>
                )}
              </section>
            )}

            {/* TAB 6: DOCUMENTS */}
            {tab === "documents" && (
              <section className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-[16px] font-bold text-slate-900">Upload technician document</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    PDF, JPG, PNG or WebP up to 10 MB. Stored privately and served only after admin authorization.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)_auto]">
                    <select
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as typeof docType)}
                      className={inputClass}
                    >
                      <option value="IDENTITY">Identity Proof</option>
                      <option value="ADDRESS">Address Proof</option>
                      <option value="CERTIFICATION">Certificate</option>
                    </select>
                    <input
                      ref={documentInput}
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      className="h-10 w-full rounded-md border border-slate-200 px-3 py-2 text-xs"
                    />
                    <button
                      type="button"
                      disabled={busy || !canEdit}
                      onClick={() => {
                        const file = documentInput.current?.files?.[0];
                        if (file) void handleUploadFile(docType, file);
                      }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-md bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      Upload / Replace
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-[16px] font-bold text-slate-900">Document List</h2>
                  </div>
                  {data.documents.length ? (
                    <div className="divide-y divide-slate-200">
                      {data.documents.map((doc) => (
                        <article key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <strong className="text-sm font-semibold text-slate-900">{doc.kind}</strong>
                              <AdminStatusBadge status={doc.status} />
                            </div>
                            {doc.created_at && (
                              <p className="mt-1 text-[11px] text-slate-500">
                                Uploaded {new Date(doc.created_at).toLocaleString("en-IN")}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewUrl(resolveUrl(doc.url))}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Preview
                            </button>
                            <a
                              href={resolveUrl(doc.url)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </a>
                            {canEdit && doc.status !== "APPROVED" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await api(`/technicians/admin/documents/${doc.id}/review/`, "POST", { status: "APPROVED" });
                                  await loadProfile();
                                }}
                                className="inline-flex h-9 items-center gap-1 rounded-md bg-teal-700 px-3 text-xs font-bold text-white hover:bg-teal-800"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Verify
                              </button>
                            )}
                            {canEdit && doc.status !== "REJECTED" && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const note = window.prompt("Reason for rejecting this document:") || "Rejected";
                                  await api(`/technicians/admin/documents/${doc.id}/review/`, "POST", {
                                    status: "REJECTED",
                                    note,
                                  });
                                  await loadProfile();
                                }}
                                className="inline-flex h-9 items-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100"
                              >
                                Reject
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="px-5 py-12 text-center text-sm text-slate-500">
                      No private documents uploaded yet.
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Add Services Modal */}
      {serviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[min(700px,calc(100vh-2rem))] w-[min(620px,calc(100vw-2rem))] flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Services</h3>
                <p className="mt-1 text-xs text-slate-500">Select services from the existing catalogue.</p>
              </div>
              <button type="button" onClick={() => setServiceModal(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_190px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Search services"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                />
              </div>
              <select className={inputClass} value={serviceCategory} onChange={(e) => setServiceCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((cat) => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
              {availableServicesToAdd.map((svc) => (
                <label key={svc.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-2 py-3 text-[13px] hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={pendingServiceIds.includes(svc.id)}
                    onChange={() =>
                      setPendingServiceIds((prev) =>
                        prev.includes(svc.id) ? prev.filter((x) => x !== svc.id) : [...prev, svc.id]
                      )
                    }
                    className="accent-violet-700"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-800">{svc.name}</span>
                    <span className="text-[11px] text-slate-500">{svc.category_name || "General"}</span>
                  </span>
                </label>
              ))}
              {availableServicesToAdd.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">No available services match your search.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setServiceModal(false)} className="h-9 rounded-md border border-slate-200 px-4 text-xs font-semibold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={!pendingServiceIds.length || busy}
                onClick={() => void saveServices([...selectedServiceIds, ...pendingServiceIds])}
                className="h-9 rounded-md bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? "Saving…" : `Save Selected${pendingServiceIds.length ? ` (${pendingServiceIds.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Locations Modal */}
      {locationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[min(700px,calc(100vh-2rem))] w-[min(620px,calc(100vw-2rem))] flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {recommendedMode ? "Recommended Locations" : "Add Locations"}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {recommendedMode
                    ? `Same-city service areas for ${data.city || "this technician"}.`
                    : "Choose from existing serviceable localities."}
                </p>
              </div>
              <button type="button" onClick={() => setLocationModal(false)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_190px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Search locations or pincode"
                  value={areaSearch}
                  onChange={(e) => setAreaSearch(e.target.value)}
                />
              </div>
              <select className={inputClass} value={areaCity} onChange={(e) => setAreaCity(e.target.value)} disabled={recommendedMode}>
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
              {availableZonesToAdd.map((area) => (
                <label key={area.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-2 py-3 text-[13px] hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={pendingAreaIds.includes(area.id)}
                    onChange={() =>
                      setPendingAreaIds((prev) =>
                        prev.includes(area.id) ? prev.filter((x) => x !== area.id) : [...prev, area.id]
                      )
                    }
                    className="h-4 w-4 accent-violet-700"
                  />
                  <span className="min-w-0 flex-1 font-medium text-slate-800">
                    {area.name}
                    <span className="ml-2 text-[11px] font-normal text-slate-500">
                      {area.city} · {area.postal_code}
                    </span>
                  </span>
                </label>
              ))}
              {availableZonesToAdd.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">No matching serviceable locations.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button type="button" onClick={() => setLocationModal(false)} className="h-9 rounded-md border border-slate-200 px-4 text-xs font-semibold text-slate-700">
                Cancel
              </button>
              <button
                type="button"
                disabled={!pendingAreaIds.length || busy}
                onClick={() => void saveAreas([...selectedAreaIds, ...pendingAreaIds])}
                className="h-9 rounded-md bg-teal-700 px-4 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? "Saving…" : `Save Selected${pendingAreaIds.length ? ` (${pendingAreaIds.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex h-[min(85vh,800px)] w-[min(960px,calc(100vw-2rem))] flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <strong className="text-sm font-bold text-slate-900">Document Preview</strong>
              <button type="button" onClick={() => setPreviewUrl("")} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-3">
              <iframe title="Document Preview" src={previewUrl} className="h-full w-full rounded bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

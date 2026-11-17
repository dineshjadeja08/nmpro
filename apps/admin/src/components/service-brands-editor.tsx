"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api, base, uploadMultipart } from "../lib/api";

type Brand = { id: string; name: string; logo_url: string; is_active: boolean };
type ServiceBrand = { name: string; logo_url?: string };

const src = (url?: string) => (!url ? "" : url.startsWith("http") ? url : `${base}${url}`);

/** "Brands we service" for one service: pick from the brand library or add a new brand with its logo. */
export function ServiceBrandsEditor({ serviceId, brands, canEdit, onSaved }: {
  serviceId: string; brands: ServiceBrand[]; canEdit: boolean; onSaved: () => Promise<void> | void;
}) {
  const [library, setLibrary] = useState<Brand[]>([]);
  const [selected, setSelected] = useState<ServiceBrand[]>(brands);
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
  const [newLogo, setNewLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => setSelected(brands), [brands]);
  const loadLibrary = useCallback(async () => {
    try { setLibrary((await api<{ results: Brand[] }>("/admin/brands/")).results); } catch { /* shown on save */ }
  }, []);
  useEffect(() => { void loadLibrary(); }, [loadLibrary]);

  const save = async (next: ServiceBrand[]) => {
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/services/${serviceId}/`, "PATCH", { brands: next.map((b) => ({ name: b.name, logo_url: b.logo_url ?? "" })) });
      setSelected(next);
      setMsg({ text: "Brands saved.", error: false });
      await onSaved();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Could not save brands.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const addFromLibrary = () => {
    const b = library.find((x) => x.id === pick);
    if (!b || selected.some((s) => s.name.toLowerCase() === b.name.toLowerCase())) return;
    void save([...selected, { name: b.name, logo_url: b.logo_url }]);
    setPick("");
  };

  const createBrand = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const body = new FormData();
      body.append("name", newName.trim());
      if (newLogo) body.append("file", newLogo);
      const b = await uploadMultipart<Brand>("/admin/brands/", body);
      setNewName("");
      setNewLogo(null);
      await loadLibrary();
      setBusy(false);
      await save([...selected, { name: b.name, logo_url: b.logo_url }]);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Could not add the brand.", error: true });
      setBusy(false);
    }
  };

  const available = library.filter((b) => b.is_active && !selected.some((s) => s.name.toLowerCase() === b.name.toLowerCase()));

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Brands we service (shown last in the pop-up)</p>
      {selected.length === 0 ? <p className="text-xs text-slate-400">No brands yet.</p> : (
        <ul className="flex flex-wrap gap-2">
          {selected.map((b) => (
            <li key={b.name} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800">
              {b.logo_url ? <img src={src(b.logo_url)} alt="" className="h-5 w-5 object-contain" /> : null}
              {b.name}
              {canEdit && (
                <button type="button" disabled={busy} aria-label={`Remove ${b.name}`} onClick={() => void save(selected.filter((s) => s.name !== b.name))}
                  className="text-slate-400 hover:text-red-700">×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <>
          <div className="flex gap-2">
            <select aria-label="Add a brand from the library" value={pick} onChange={(e) => setPick(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-xs">
              <option value="">Add a brand…</option>
              {available.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="button" disabled={busy || !pick} onClick={addFromLibrary}
              className="h-9 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white disabled:opacity-50">Add</button>
          </div>
          <details className="rounded-lg border border-dashed border-slate-300 p-2.5">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">New brand with logo</summary>
            <div className="mt-2 grid gap-2">
              <input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="Brand name (e.g. Daikin)"
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs" />
              <label className="text-[11px] text-slate-500">Logo (PNG, JPG or WebP · square, about 200 × 200 px)
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setNewLogo(e.target.files?.[0] ?? null)}
                  className="mt-1 block text-xs" />
              </label>
              <button type="button" disabled={busy || !newName.trim()} onClick={() => void createBrand()}
                className="h-9 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 disabled:opacity-50">
                Create brand and add
              </button>
            </div>
          </details>
        </>
      )}
      {msg && <p role={msg.error ? "alert" : "status"} className={`text-xs font-semibold ${msg.error ? "text-red-700" : "text-emerald-700"}`}>{msg.text}</p>}
    </div>
  );
}

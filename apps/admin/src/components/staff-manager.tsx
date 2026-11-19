"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";

type Staff = {
  id: number;
  first_name: string;
  phone_e164: string;
  email: string;
  is_active: boolean;
  roles: string[];
  last_login?: string | null;
};

type RoleAccess = { name: string; permissions: string[]; default_permissions: string[]; extra_permissions: string[] };
type RolesResponse = { roles: RoleAccess[]; capabilities: string[] };

const roles = [
  "SUPER_ADMIN", "FINANCE_ADMIN", "FINANCE_VIEWER", "OPERATIONS_MANAGER",
  "DISPATCH_OPERATOR", "SUPPORT_AGENT", "CATALOG_MANAGER", "TECHNICIAN_VERIFIER",
];
const roleLabel = (role: string) => role.replaceAll("_", " ");
const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-700";
const capabilityDescriptions: Record<string, string> = {
  VIEW_ADMIN: "Open the admin portal", VIEW_FINANCE: "View financial reports", APPROVE_REFUNDS: "Approve customer refunds",
  APPROVE_SETTLEMENTS: "Approve settlement records", INITIATE_PAYOUTS: "Start technician payouts",
  MANAGE_PRICING: "Change prices", MANAGE_SERVICES: "Edit services and categories",
  MANAGE_TECHNICIANS: "Manage technician accounts", VERIFY_KYC: "Verify identity documents",
  MANAGE_STAFF: "Manage staff accounts and permissions", VIEW_AUDIT: "View audit history",
  CHANGE_SETTINGS: "Change platform settings",
};

export function StaffManager({ currentUserId }: { currentUserId: number }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Staff | null>(null);
  const [profile, setProfile] = useState({ phone_e164: "", first_name: "", email: "" });
  const [newRole, setNewRole] = useState("SUPPORT_AGENT");
  const [create, setCreate] = useState({ phone_e164: "+91", first_name: "", email: "", role: "SUPPORT_AGENT", password: "", confirm: "" });
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("q", search);
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    api<{ results: Staff[]; count: number }>(`/admin/staff/?${params}`)
      .then((result) => {
        if (active) { setStaff(result.results); setCount(result.count); setError(""); }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load staff."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refresh, search, roleFilter, statusFilter]);

  async function run(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(message);
      setRefresh((value) => value + 1);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function edit(row: Staff) {
    setSelected(row);
    setProfile({ phone_e164: row.phone_e164, first_name: row.first_name ?? "", email: row.email ?? "" });
    setNewRole(roles.find((role) => !row.roles.includes(role)) ?? "");
    setResetPassword("");
    setResetConfirm("");
    setError("");
  }

  async function createStaff(event: FormEvent) {
    event.preventDefault();
    if (create.password.length < 12) { setError("Use a password with at least 12 characters."); return; }
    if (create.password !== create.confirm) { setError("The passwords do not match."); return; }
    const saved = await run(() => api("/admin/staff/", "POST", {
      phone_e164: create.phone_e164.trim(), first_name: create.first_name.trim(),
      email: create.email.trim(), role: create.role, password: create.password,
    }), "Staff account created. Share the initial password privately.");
    if (saved) {
      setCreate({ phone_e164: "+91", first_name: "", email: "", role: "SUPPORT_AGENT", password: "", confirm: "" });
      setCreating(false);
      setPage(1);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const saved = await run(() => api<Staff>(`/admin/staff/${selected.id}/`, "PATCH", {
      phone_e164: profile.phone_e164.trim(), first_name: profile.first_name.trim(), email: profile.email.trim(),
    }).then((updated) => setSelected(updated)), "Staff details updated.");
    if (saved) setProfile((value) => ({ ...value, phone_e164: value.phone_e164.trim() }));
  }

  async function changeRole(role: string, operation: "add_role" | "remove_role") {
    if (!selected) return;
    if (operation === "remove_role" && !window.confirm(`Remove ${roleLabel(role)} from this account?`)) return;
    await run(() => api<Staff>(`/admin/staff/${selected.id}/`, "PATCH", { [operation]: role })
      .then((updated) => {
        setSelected(updated);
        setNewRole(roles.find((candidate) => !updated.roles.includes(candidate)) ?? "");
      }), "Staff roles updated.");
  }

  async function changeActivity() {
    if (!selected || !window.confirm(`${selected.is_active ? "Deactivate" : "Reactivate"} this staff account?`)) return;
    await run(() => api<Staff>(`/admin/staff/${selected.id}/`, "PATCH", { is_active: !selected.is_active })
      .then((updated) => setSelected(updated)), "Staff status updated.");
  }

  async function resetStaffPassword(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (resetPassword.length < 12) { setError("Use a password with at least 12 characters."); return; }
    if (resetPassword !== resetConfirm) { setError("The passwords do not match."); return; }
    const saved = await run(() => api(`/admin/staff/${selected.id}/password/`, "POST", { new_password: resetPassword }),
      "Password reset. Share the new password privately with this staff member.");
    if (saved) { setResetPassword(""); setResetConfirm(""); }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Staff accounts</h2>
            <p className="mt-1 text-xs text-slate-500">Find people, manage access, and reset passwords.</p>
          </div>
          <button type="button" onClick={() => { setCreating(!creating); setSelected(null); setError(""); }}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800">
            {creating ? "Cancel" : "Add staff account"}
          </button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-[minmax(0,1fr)_180px_150px]">
          <label className="text-xs font-bold text-slate-700">Search staff
            <input className={inputClass} type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Name, phone, or email" />
          </label>
          <label className="text-xs font-bold text-slate-700">Role
            <select className={inputClass} value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }}>
              <option value="">All roles</option>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">Status
            <select className={inputClass} value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{loading ? "Loading staff…" : `${count} matching ${count === 1 ? "account" : "accounts"}`}</span>
          {(searchInput || roleFilter || statusFilter) && <button type="button" className="font-semibold text-teal-800 hover:underline" onClick={() => { setSearchInput(""); setSearch(""); setRoleFilter(""); setStatusFilter(""); setPage(1); }}>Clear filters</button>}
        </div>

        {creating && (
          <form onSubmit={(event) => void createStaff(event)} className="mt-5 grid gap-4 rounded-xl border border-teal-200 bg-teal-50/40 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><h3 className="text-sm font-bold text-slate-900">New staff account</h3><p className="mt-1 text-xs text-slate-600">Use an international phone number and a unique initial password of at least 12 characters.</p></div>
            <label className="text-xs font-bold text-slate-700">Phone number
              <input className={inputClass} required value={create.phone_e164} onChange={(event) => setCreate({ ...create, phone_e164: event.target.value })} placeholder="+919876543210" />
            </label>
            <label className="text-xs font-bold text-slate-700">Name
              <input className={inputClass} value={create.first_name} onChange={(event) => setCreate({ ...create, first_name: event.target.value })} />
            </label>
            <label className="text-xs font-bold text-slate-700">Email
              <input className={inputClass} type="email" value={create.email} onChange={(event) => setCreate({ ...create, email: event.target.value })} />
            </label>
            <label className="text-xs font-bold text-slate-700">Role
              <select className={inputClass} value={create.role} onChange={(event) => setCreate({ ...create, role: event.target.value })}>
                {roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">Initial password
              <input className={inputClass} type="password" autoComplete="new-password" minLength={12} required value={create.password} onChange={(event) => setCreate({ ...create, password: event.target.value })} />
            </label>
            <label className="text-xs font-bold text-slate-700">Confirm password
              <input className={inputClass} type="password" autoComplete="new-password" minLength={12} required value={create.confirm} onChange={(event) => setCreate({ ...create, confirm: event.target.value })} />
            </label>
            <div className="sm:col-span-2"><button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving..." : "Create staff"}</button></div>
          </form>
        )}

        <div className="mt-5 overflow-x-auto">
          {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading staff...</p> : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>
                <th className="py-3 pr-3">Staff member</th><th className="py-3 pr-3">Phone</th><th className="py-3 pr-3">Roles</th><th className="py-3 pr-3">Status</th><th className="py-3">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((row) => <tr key={row.id}>
                  <td className="py-3 pr-3"><span className="font-semibold text-slate-900">{row.first_name || "Unnamed"}{row.id === currentUserId ? " (you)" : ""}</span><span className="block text-xs text-slate-500">{row.email || "No email"}</span></td>
                  <td className="py-3 pr-3">{row.phone_e164}</td>
                  <td className="py-3 pr-3"><div className="flex max-w-xs flex-wrap gap-1">{row.roles.map((role) => <span key={role} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{roleLabel(role)}</span>)}</div></td>
                  <td className="py-3 pr-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${row.is_active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{row.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="py-3"><button type="button" onClick={() => { edit(row); setCreating(false); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-slate-50">Manage</button></td>
                </tr>)}
              </tbody>
            </table>
          )}
          {!loading && staff.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{search || roleFilter || statusFilter ? "No staff match these filters." : "No staff accounts found. Add the first account above."}</p>}
        </div>
        <div className="mt-4 flex items-center justify-end gap-3 text-xs text-slate-600">
          <span>{count} matching</span>
          <button disabled={page === 1 || loading} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
          <span>Page {page}</span>
          <button disabled={page * 20 >= count || loading} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-base font-bold text-slate-900">Manage {selected.first_name || selected.phone_e164}</h2><p className="mt-1 text-xs text-slate-500">{selected.phone_e164} · {selected.is_active ? "Active" : "Inactive"}{selected.last_login ? ` · Last signed in ${new Date(selected.last_login).toLocaleDateString()}` : " · Never signed in"}</p></div>
            <button onClick={() => setSelected(null)} className="text-xs font-bold text-slate-600 hover:text-slate-900">Close</button>
          </div>
          <form onSubmit={(event) => void saveProfile(event)} className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-bold text-slate-700">Name<input className={inputClass} value={profile.first_name} onChange={(event) => setProfile({ ...profile, first_name: event.target.value })} /></label>
            <label className="text-xs font-bold text-slate-700">Phone<input className={inputClass} required value={profile.phone_e164} onChange={(event) => setProfile({ ...profile, phone_e164: event.target.value })} /></label>
            <label className="text-xs font-bold text-slate-700">Email<input className={inputClass} type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label>
            <div className="sm:col-span-3"><button disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save details</button></div>
          </form>
          {selected.id !== currentUserId && <div className="mt-6 grid gap-6 border-t border-slate-200 pt-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Roles and access</h3>
              <div className="mt-3 flex flex-wrap gap-2">{selected.roles.map((role) => (
                <button key={role} disabled={busy} onClick={() => void changeRole(role, "remove_role")}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-red-50 disabled:opacity-50"
                  title="Remove role">{roleLabel(role)} ×</button>
              ))}</div>
              <div className="mt-3 flex gap-2">
                <select className={inputClass} value={newRole} onChange={(event) => setNewRole(event.target.value)}>{roles.filter((role) => !selected.roles.includes(role)).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
                <button disabled={busy || !newRole} onClick={() => void changeRole(newRole, "add_role")} className="mt-1 rounded-lg border border-teal-300 px-3 text-xs font-bold text-teal-800 disabled:opacity-50">Add role</button>
              </div>
              <button disabled={busy} onClick={() => void changeActivity()} className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
                {selected.is_active ? "Deactivate account" : "Reactivate account"}
              </button>
            </div>
            <form onSubmit={(event) => void resetStaffPassword(event)}>
              <h3 className="text-sm font-bold text-slate-900">Reset password</h3>
              <p className="mt-1 text-xs text-slate-500">Set a new password and share it privately with this staff member.</p>
              <label className="mt-3 block text-xs font-bold text-slate-700">New password<input className={inputClass} type="password" autoComplete="new-password" minLength={12} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label>
              <label className="mt-3 block text-xs font-bold text-slate-700">Confirm password<input className={inputClass} type="password" autoComplete="new-password" minLength={12} required value={resetConfirm} onChange={(event) => setResetConfirm(event.target.value)} /></label>
              <button disabled={busy} className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Reset password</button>
            </form>
          </div>}
          {selected.id === currentUserId && <p className="mt-5 text-xs text-slate-500">Use Change password in the account menu to update your own password. Another super admin must change your roles or status.</p>}
        </div>
      )}
    </section>
  );
}

export function RolePermissions() {
  const [data, setData] = useState<RolesResponse | null>(null);
  const [selectedRole, setSelectedRole] = useState("SUPPORT_AGENT");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api<RolesResponse>("/admin/roles/")
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load permissions."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const role = data?.roles.find((item) => item.name === selectedRole);

  async function updateCapability(code: string, enabled: boolean) {
    if (!window.confirm(`${enabled ? "Grant" : "Remove"} ${roleLabel(code)} ${enabled ? "to" : "from"} ${roleLabel(selectedRole)}?`)) return;
    setBusy(code);
    setError("");
    setNotice("");
    try {
      await api(`/admin/roles/${selectedRole}/`, "PATCH", { permission_code: code, enabled });
      const updated = await api<RolesResponse>("/admin/roles/");
      setData(updated);
      setNotice(`${roleLabel(code)} ${enabled ? "granted" : "removed"} for ${roleLabel(selectedRole)}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The permission could not be changed.");
    } finally {
      setBusy("");
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-base font-bold text-slate-900">Role permissions</h2><p className="mt-1 text-xs text-slate-500">Review what each role can do and manage additional access.</p></div>
      <label className="min-w-48 text-xs font-bold text-slate-700">Select role
        <select className={inputClass} value={selectedRole} onChange={(event) => { setSelectedRole(event.target.value); setError(""); setNotice(""); }}>
          {roles.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}
        </select>
      </label>
    </div>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading ? <p className="py-8 text-sm text-slate-500">Loading permissions…</p> : role && <>
      <p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{roleLabel(selectedRole)} has {role.permissions.length} {role.permissions.length === 1 ? "permission" : "permissions"}. Built-in permissions are fixed; additional grants can be removed here.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {data?.capabilities.map((code) => {
          const builtIn = role.default_permissions.includes(code);
          const granted = role.extra_permissions.includes(code);
          return <div key={code} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div><p className="text-xs font-bold text-slate-900">{roleLabel(code)}</p><p className="mt-0.5 text-xs text-slate-500">{capabilityDescriptions[code] ?? "Admin capability"}</p></div>
            {builtIn ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Built in</span>
              : <button type="button" disabled={!!busy || selectedRole === "SUPER_ADMIN"} onClick={() => void updateCapability(code, !granted)}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${granted ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" : "border-teal-300 text-teal-800 hover:bg-teal-50"}`}>{busy === code ? "Saving…" : granted ? "Remove grant" : "Grant"}</button>}
          </div>;
        })}
      </div>
    </>}
  </section>;
}

export function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (next !== confirm) { setError("The new passwords do not match."); return; }
    if (next.length < 12) { setError("Use a password with at least 12 characters."); return; }
    setBusy(true);
    setError("");
    try {
      await api("/admin/me/password/", "POST", { current_password: current, new_password: next });
      setCurrent(""); setNext(""); setConfirm("");
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Password could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Change password">
    <form onSubmit={(event) => void submit(event)} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">Change password</h2><button type="button" onClick={onClose} aria-label="Close" className="text-xl text-slate-500">×</button></div>
      <p className="mt-2 text-xs text-slate-500">Use your current password and choose a new one with at least 12 characters.</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{error}</p>}
      <label className="mt-4 block text-xs font-bold text-slate-700">Current password<input className={inputClass} type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} /></label>
      <label className="mt-4 block text-xs font-bold text-slate-700">New password<input className={inputClass} type="password" autoComplete="new-password" minLength={12} required value={next} onChange={(event) => setNext(event.target.value)} /></label>
      <label className="mt-4 block text-xs font-bold text-slate-700">Confirm new password<input className={inputClass} type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      <button disabled={busy} className="mt-5 w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving..." : "Change password"}</button>
    </form>
  </div>;
}

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type Coupon = {
  id: string; code: string; description: string; discount_type: "PERCENT" | "FLAT"; value: number;
  max_discount_paise: number | null; min_order_paise: number; valid_from: string | null; valid_until: string | null;
  usage_limit: number | null; per_user_limit: number; first_booking_only: boolean; is_active: boolean;
  source: "ADMIN" | "REFERRAL_REWARD"; times_used: number;
};

const rupees = (paise: number | null | undefined) => (paise == null ? "—" : `₹${(paise / 100).toLocaleString("en-IN")}`);
const toPaise = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
const EMPTY = { code: "", description: "", discount_type: "FLAT" as "FLAT" | "PERCENT", value: "", max_discount: "", min_order: "",
  valid_until: "", usage_limit: "", per_user_limit: "1", first_booking_only: false };

export function CouponsManager() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [showRewards, setShowRewards] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<{ results: Coupon[] }>(`/admin/coupons/${showRewards ? "" : "?source=ADMIN"}`);
      setItems(res.results ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load coupons.");
    }
  }, [showRewards]);
  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(""); setOk("");
    try {
      const value = form.discount_type === "PERCENT" ? Math.round(Number(form.value)) : Math.round(Number(form.value) * 100);
      await api("/admin/coupons/", "POST", {
        code: form.code.trim(), description: form.description.trim(), discount_type: form.discount_type, value,
        max_discount_paise: form.discount_type === "PERCENT" ? toPaise(form.max_discount) : null,
        min_order_paise: toPaise(form.min_order) ?? 0,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        per_user_limit: Number(form.per_user_limit || 1),
        first_booking_only: form.first_booking_only,
      });
      setForm(EMPTY);
      setOk("Coupon created.");
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not create coupon.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Coupon) => {
    setBusy(true); setErr("");
    try {
      await api(`/admin/coupons/${c.id}/`, "PATCH", { is_active: !c.is_active });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update coupon.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Create an offer code</h2>
        <p className="mb-4 text-xs text-slate-500">Customers enter the code at checkout. Codes are re-checked when the booking is confirmed.</p>
        {err && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">{err}</div>}
        {ok && <div role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{ok}</div>}
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-700">Code
            <input className={input} required pattern="[A-Za-z0-9]{3,24}" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MONSOON20" />
          </label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-1 lg:col-span-3">Description (shown to customers)
            <input className={input} maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="20% off AC service" />
          </label>
          <label className="text-xs font-semibold text-slate-700">Type
            <select className={input} value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as "FLAT" | "PERCENT" })}>
              <option value="FLAT">Flat amount (₹)</option>
              <option value="PERCENT">Percentage (%)</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">{form.discount_type === "PERCENT" ? "Percent off" : "Amount off (₹)"}
            <input className={input} required type="number" min="1" max={form.discount_type === "PERCENT" ? 100 : undefined} step="1" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
          {form.discount_type === "PERCENT" && (
            <label className="text-xs font-semibold text-slate-700">Max discount (₹)
              <input className={input} type="number" min="1" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} />
            </label>
          )}
          <label className="text-xs font-semibold text-slate-700">Minimum order (₹)
            <input className={input} type="number" min="0" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-slate-700">Valid until
            <input className={input} type="datetime-local" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-slate-700">Total uses (blank = unlimited)
            <input className={input} type="number" min="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-slate-700">Uses per customer
            <input className={input} type="number" min="1" max="100" value={form.per_user_limit} onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={form.first_booking_only} onChange={(e) => setForm({ ...form, first_booking_only: e.target.checked })} /> First booking only
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button disabled={busy} className="rounded-lg bg-[#800020] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">Create coupon</button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Offer codes</h2>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showRewards} onChange={(e) => setShowRewards(e.target.checked)} /> Include referral reward codes
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-left font-bold uppercase text-slate-500">
                <th className="p-3">Code</th><th className="p-3">Discount</th><th className="p-3">Rules</th>
                <th className="p-3">Valid until</th><th className="p-3">Used</th><th className="p-3">Status</th><th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400">No coupons yet.</td></tr>
              ) : items.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="p-3"><span className="font-bold text-slate-900">{c.code}</span><br /><span className="text-slate-500">{c.source === "REFERRAL_REWARD" ? "Referral reward" : c.description}</span></td>
                  <td className="p-3 font-semibold">{c.discount_type === "PERCENT" ? `${c.value}%${c.max_discount_paise ? ` (max ${rupees(c.max_discount_paise)})` : ""}` : rupees(c.value)}</td>
                  <td className="p-3 text-slate-600">
                    {c.min_order_paise ? `Min ${rupees(c.min_order_paise)} · ` : ""}{c.per_user_limit}/customer{c.first_booking_only ? " · first booking" : ""}
                  </td>
                  <td className="p-3 text-slate-600">{c.valid_until ? new Date(c.valid_until).toLocaleDateString("en-IN") : "No end"}</td>
                  <td className="p-3">{c.times_used}{c.usage_limit ? ` / ${c.usage_limit}` : ""}</td>
                  <td className="p-3">
                    {c.is_active
                      ? <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">Active</span>
                      : <span className="rounded bg-slate-100 px-2 py-0.5 font-bold text-slate-600">Paused</span>}
                  </td>
                  <td className="p-3">
                    <button disabled={busy} onClick={() => toggle(c)} className="rounded border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                      {c.is_active ? "Pause" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

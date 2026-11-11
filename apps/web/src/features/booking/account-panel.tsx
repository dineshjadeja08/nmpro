"use client";

import {
  ArrowRight,
  Bell,
  Briefcase,
  CheckCircle2,
  CreditCard,
  Home,
  Loader2,
  LogOut,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CustomerHubHeader } from "@/components/customer-hub-header";
import { GoogleMapsLocationPicker, type PickedLocationResult } from "@/components/google-maps-location-picker";
import { QuickOtpSheet } from "@/components/quick-otp-sheet";
import { bookingApi, type Address, type NotificationPreferences } from "@/lib/booking-api";

type AddressDraft = Omit<Address, "id" | "line_1">;

const EMPTY_ADDRESS: AddressDraft = {
  label: "Home",
  contact_name: "",
  contact_phone: "",
  house_flat: "",
  street: "",
  locality: "",
  city: "",
  state: "Tamil Nadu",
  postal_code: "",
  landmark: "",
  latitude: null,
  longitude: null,
  is_default: false,
};

const LABEL_PRESETS = ["Home", "Work", "Parents", "Other"] as const;

type Feedback = { kind: "success" | "error"; text: string } | null;

function AddressFormCard({
  mode,
  draft,
  initialQuery,
  pickerKey,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  mode: "add" | "edit";
  draft: AddressDraft;
  initialQuery?: string;
  pickerKey: string;
  saving: boolean;
  onChange: (next: AddressDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState("");

  function handlePicked(picked: PickedLocationResult) {
    onChange({
      ...draft,
      house_flat: picked.house_flat || draft.house_flat,
      street: picked.street || draft.street,
      locality: picked.locality || draft.locality,
      city: picked.city || draft.city,
      state: picked.state || draft.state,
      postal_code: picked.postal_code || draft.postal_code,
      latitude: picked.latitude,
      longitude: picked.longitude,
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.house_flat.trim() || !draft.locality.trim() || !draft.city.trim()) {
      setFormError("Please enter house/flat number, locality, and city.");
      return;
    }
    if (!/^\d{6}$/.test(draft.postal_code.trim())) {
      setFormError("Enter a valid 6-digit PIN code.");
      return;
    }
    setFormError("");
    onSave();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-lg border border-[#800020]/30 bg-white shadow-[0_10px_30px_rgba(28,25,23,0.08)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#EAE3DC] bg-[#FCF7F8] px-5 py-3.5">
        <div>
          <h3 className="text-sm font-bold text-[#1C1917] sm:text-base">
            {mode === "add" ? "Add a new service address" : `Edit ${draft.label || "address"}`}
          </h3>
          <p className="text-xs text-[#57534E]">
            Search on Google Maps or drop a pin, then confirm flat details below.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close address form"
          className="grid h-8 w-8 place-items-center rounded-md border border-[#E2D9D0] bg-white text-[#57534E] hover:text-[#1C1917]"
        >
          <X size={15} />
        </button>
      </div>

      <div className="p-5">
        <div className="mb-5">
          <GoogleMapsLocationPicker
            key={pickerKey}
            checkServiceability={true}
            initialQuery={initialQuery}
            title={mode === "add" ? "Search address or use current location" : "Search replacement address"}
            onLocationSelected={handlePicked}
          />
        </div>

        <div className="mb-4 space-y-1.5">
          <span className="block text-xs font-semibold text-[#1C1917]">Address tag</span>
          <div className="flex flex-wrap items-center gap-2">
            {LABEL_PRESETS.map((preset) => {
              const active = draft.label.toLowerCase() === preset.toLowerCase();
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChange({ ...draft, label: preset })}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition ${
                    active
                      ? "border-[#800020] bg-[#FBECEF] text-[#800020]"
                      : "border-[#E2D9D0] bg-white text-[#57534E] hover:border-[#800020]/50"
                  }`}
                >
                  {preset === "Home" && <Home size={12} />}
                  {preset === "Work" && <Briefcase size={12} />}
                  <span>{preset}</span>
                </button>
              );
            })}
            <input
              aria-label="Custom address label"
              placeholder="Custom label"
              value={draft.label}
              onChange={(e) => onChange({ ...draft, label: e.target.value })}
              className="h-[34px] w-36 rounded-md border border-[#E2D9D0] px-2.5 text-xs text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${pickerKey}-contact_name`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Contact name
            </label>
            <input
              id={`${pickerKey}-contact_name`}
              placeholder="Who should the technician meet?"
              value={draft.contact_name}
              onChange={(e) => onChange({ ...draft, contact_name: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div>
            <label htmlFor={`${pickerKey}-contact_phone`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Contact phone
            </label>
            <input
              id={`${pickerKey}-contact_phone`}
              type="tel"
              placeholder="+91 98765 43210"
              value={draft.contact_phone}
              onChange={(e) => onChange({ ...draft, contact_phone: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div>
            <label htmlFor={`${pickerKey}-house_flat`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              House / Flat / Floor *
            </label>
            <input
              id={`${pickerKey}-house_flat`}
              placeholder="e.g. Flat 4B, Block A"
              value={draft.house_flat}
              onChange={(e) => onChange({ ...draft, house_flat: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div>
            <label htmlFor={`${pickerKey}-street`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Street / Apartment
            </label>
            <input
              id={`${pickerKey}-street`}
              placeholder="Street or building name"
              value={draft.street}
              onChange={(e) => onChange({ ...draft, street: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div>
            <label htmlFor={`${pickerKey}-locality`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Locality / Area *
            </label>
            <input
              id={`${pickerKey}-locality`}
              placeholder="e.g. Anna Nagar"
              value={draft.locality}
              onChange={(e) => onChange({ ...draft, locality: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div>
            <label htmlFor={`${pickerKey}-city`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              City *
            </label>
            <input
              id={`${pickerKey}-city`}
              placeholder="Chennai"
              value={draft.city}
              onChange={(e) => onChange({ ...draft, city: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div>
            <label htmlFor={`${pickerKey}-postal_code`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              PIN code *
            </label>
            <input
              id={`${pickerKey}-postal_code`}
              inputMode="numeric"
              maxLength={6}
              placeholder="600040"
              value={draft.postal_code}
              onChange={(e) => onChange({ ...draft, postal_code: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div>
            <label htmlFor={`${pickerKey}-state`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              State
            </label>
            <input
              id={`${pickerKey}-state`}
              value={draft.state}
              onChange={(e) => onChange({ ...draft, state: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${pickerKey}-landmark`} className="mb-1 block text-xs font-semibold text-[#1C1917]">
              Landmark (optional)
            </label>
            <input
              id={`${pickerKey}-landmark`}
              placeholder="Near park, school, or main gate"
              value={draft.landmark}
              onChange={(e) => onChange({ ...draft, landmark: e.target.value })}
              className="w-full rounded-md border border-[#E2D9D0] px-3 py-2 text-sm text-[#1C1917] outline-none focus:border-[#800020]"
            />
          </div>
        </div>

        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#1C1917]">
          <input
            type="checkbox"
            checked={draft.is_default}
            onChange={(e) => onChange({ ...draft, is_default: e.target.checked })}
            className="h-4 w-4 accent-[#800020]"
          />
          <span>Set as my default service address</span>
        </label>

        {formError && (
          <p role="alert" className="mt-3 rounded-md bg-[#FBF1F3] px-3 py-2 text-xs font-medium text-[#800020]">
            {formError}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2.5 border-t border-[#F4EFE9] pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-[40px] rounded-md border border-[#E2D9D0] bg-white px-4 text-xs font-semibold text-[#57534E] hover:border-[#1C1917] hover:text-[#1C1917]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-[#800020] px-5 text-xs font-bold text-white transition hover:bg-[#5e0017] disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            <span>{mode === "add" ? "Save address" : "Save changes"}</span>
          </button>
        </div>
      </div>
    </form>
  );
}

export function AccountPanel() {
  const [phone, setPhone] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editing, setEditing] = useState<Address | null>(null);
  const [adding, setAdding] = useState<AddressDraft | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [showOtpSheet, setShowOtpSheet] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  const refreshAccountData = useCallback(async () => {
    try {
      const me = await bookingApi.me();
      setPhone(me.phone_e164);
      const [addrRes, prefRes] = await Promise.allSettled([
        bookingApi.addresses(),
        bookingApi.notificationPreferences(),
      ]);
      if (addrRes.status === "fulfilled") {
        setAddresses(addrRes.value.addresses);
      } else {
        setFeedback({ kind: "error", text: "Saved addresses could not be loaded." });
      }
      if (prefRes.status === "fulfilled") {
        setPreferences(prefRes.value);
      }
    } catch {
      setPhone("");
      setAddresses([]);
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    bookingApi
      .me()
      .then(async (me) => {
        if (!active) return;
        setPhone(me.phone_e164);
        const [addrRes, prefRes] = await Promise.allSettled([
          bookingApi.addresses(),
          bookingApi.notificationPreferences(),
        ]);
        if (!active) return;
        if (addrRes.status === "fulfilled") {
          setAddresses(addrRes.value.addresses);
        } else {
          setFeedback({ kind: "error", text: "Saved addresses could not be loaded." });
        }
        if (prefRes.status === "fulfilled") {
          setPreferences(prefRes.value);
        }
      })
      .catch(() => {
        if (!active) return;
        setPhone("");
        setAddresses([]);
        setPreferences(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const onAuthChanged = () => {
      if (active) void refreshAccountData();
    };
    window.addEventListener("nammapros:auth-changed", onAuthChanged);
    return () => {
      active = false;
      window.removeEventListener("nammapros:auth-changed", onAuthChanged);
    };
  }, [refreshAccountData]);

  async function updateAddress(id: string, values: Partial<Address>) {
    setFeedback(null);
    setSavingAddress(true);
    try {
      await bookingApi.updateAddress(id, values);
      setAddresses((await bookingApi.addresses()).addresses);
      setEditing(null);
      setFeedback({ kind: "success", text: values.is_default ? "Default address updated." : "Address updated." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Address update failed.",
      });
    } finally {
      setSavingAddress(false);
    }
  }

  async function createAddress(values: AddressDraft) {
    setFeedback(null);
    setSavingAddress(true);
    try {
      await bookingApi.createAddress(values);
      setAddresses((await bookingApi.addresses()).addresses);
      setAdding(null);
      setFeedback({ kind: "success", text: "New address added." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not save address.",
      });
    } finally {
      setSavingAddress(false);
    }
  }

  async function removeAddress(id: string) {
    setFeedback(null);
    setSavingAddress(true);
    try {
      await bookingApi.archiveAddress(id);
      setAddresses((await bookingApi.addresses()).addresses);
      setConfirmRemoveId(null);
      setFeedback({ kind: "success", text: "Address removed from your saved list." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Address could not be removed.",
      });
    } finally {
      setSavingAddress(false);
    }
  }

  async function savePreferences() {
    if (!preferences) return;
    setFeedback(null);
    setSavingPrefs(true);
    try {
      setPreferences(await bookingApi.saveNotificationPreferences(preferences));
      setFeedback({ kind: "success", text: "Notification preferences saved." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Notification preferences could not be saved.",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function signOut() {
    try {
      await bookingApi.logout();
      setPhone("");
      setAddresses([]);
      setPreferences(null);
      setEditing(null);
      setAdding(null);
      setFeedback({ kind: "success", text: "Signed out safely." });
    } catch {
      setFeedback({ kind: "error", text: "Sign-out could not be confirmed. Please retry." });
    }
  }

  async function quickDevLogin() {
    setLoading(true);
    setFeedback(null);
    try {
      await bookingApi.firebaseAuth("dev-token:+919876543210");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("nammapros:auth-changed"));
      }
      await refreshAccountData();
      setFeedback({ kind: "success", text: "Signed in as test customer (+919876543210)." });
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Dev login failed.",
      });
      setLoading(false);
    }
  }

  const defaultAddr = addresses.find((a) => a.is_default);
  const enabledAlerts = preferences
    ? [preferences.whatsapp_opt_in, preferences.sms_opt_in, preferences.email_opt_in].filter(Boolean).length
    : 0;

  return (
    <main className="min-h-[75vh] bg-[#FBF8F5] pb-14">
      <CustomerHubHeader
        activeTab="account"
        crumb="Your Account"
        badge="Customer Portal"
        title={phone ? "Account & Saved Addresses" : "Your NammaPros Account"}
        subtitle={
          phone
            ? `Signed in as ${phone}. Keep addresses and service alerts ready for 1-tap booking.`
            : "Sign in with your mobile number to access saved homes, live tracking, and warranty records."
        }
        actions={
          phone ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setConfirmRemoveId(null);
                  setAdding({ ...EMPTY_ADDRESS, contact_phone: phone });
                }}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#800020] px-4 text-xs font-bold text-white shadow-xs transition hover:bg-[#5e0017]"
              >
                <Plus size={14} />
                <span>Add address</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[#E2D9D0] bg-white px-3.5 text-xs font-semibold text-[#57534E] transition hover:border-[#800020] hover:text-[#800020]"
              >
                <LogOut size={14} />
                <span>Sign out</span>
              </button>
            </>
          ) : undefined
        }
      />

      <div className="container max-w-5xl space-y-6 pt-6 sm:pt-8">
        {feedback && (
          <div
            role="alert"
            className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs font-medium shadow-2xs ${
              feedback.kind === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-[#800020]/30 bg-[#FBF1F3] text-[#800020]"
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss notification"
              className="rounded p-1 opacity-70 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="h-24 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
              <div className="h-24 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
              <div className="h-24 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
            </div>
            <div className="h-56 animate-pulse rounded-lg border border-[#EAE3DC] bg-white" />
          </div>
        ) : !phone ? (
          <section className="grid overflow-hidden rounded-lg border border-[#EAE3DC] bg-white shadow-[0_12px_36px_rgba(28,25,23,0.06)] lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-6 sm:p-8">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[#FBECEF] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#800020]">
                <Phone size={12} />
                Passwordless Sign-In
              </span>
              <h2 className="mt-3 text-xl font-bold text-[#1C1917] sm:text-2xl">
                Verify your mobile number in seconds
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#57534E]">
                No passwords to remember. Use your 10-digit Indian mobile number to unlock saved homes and past service visits.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowOtpSheet(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#800020] px-5 text-xs font-bold text-white shadow-sm transition hover:bg-[#5e0017]"
                >
                  <Phone size={14} />
                  <span>Sign in with Mobile OTP</span>
                </button>
                <Link
                  href="/services"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#E2D9D0] bg-[#FBF8F5] px-4 text-xs font-semibold text-[#1C1917] hover:border-[#800020]"
                >
                  <span>Browse services</span>
                  <ArrowRight size={14} />
                </Link>
              </div>

              {process.env.NODE_ENV !== "production" && (
                <div className="mt-6 rounded-md border border-dashed border-[#800020]/35 bg-[#FBECEF]/60 p-4">
                  <p className="text-xs font-bold text-[#800020]">Quick Dev Sign-In</p>
                  <p className="mt-0.5 text-[11px] text-[#57534E]">
                    Local preview shortcut using test account +919876543210.
                  </p>
                  <button
                    type="button"
                    onClick={quickDevLogin}
                    className="mt-3 inline-flex min-h-[36px] items-center rounded-md border border-[#800020]/25 bg-white px-3.5 text-xs font-bold text-[#800020] transition hover:bg-[#800020] hover:text-white"
                  >
                    Sign in as Test Customer
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between bg-gradient-to-br from-[#2B0710] via-[#4D0A1B] to-[#800020] p-6 text-white sm:p-8">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#FCE7ED]">
                  <Sparkles size={12} />
                  What’s Inside
                </span>
                <h3 className="mt-3 text-lg font-bold text-white">Everything for your home visits</h3>
                <ul className="mt-5 space-y-4 text-xs">
                  <li className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/12 text-[#FCE7ED]">
                      <MapPin size={15} />
                    </span>
                    <div>
                      <strong className="block font-bold text-white">1-Tap Address Book</strong>
                      <span className="text-[#F3DCE2]">Save Home, Work, or parents’ flat with Google Maps pin accuracy.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/12 text-[#FCE7ED]">
                      <ShieldCheck size={15} />
                    </span>
                    <div>
                      <strong className="block font-bold text-white">30-Day Service Warranty</strong>
                      <span className="text-[#F3DCE2]">Revisit protection and verified technician IDs linked to every job.</span>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/12 text-[#FCE7ED]">
                      <CreditCard size={15} />
                    </span>
                    <div>
                      <strong className="block font-bold text-white">Digital Quotes & Receipts</strong>
                      <span className="text-[#F3DCE2]">Approve parts/labour quotes online and download GST invoices anytime.</span>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </section>
        ) : (
          <>
            {/* Dimensional Metric Summary Strip */}
            <section className="grid gap-3.5 sm:grid-cols-3" aria-label="Account summary">
              <div className="rounded-lg border border-[#EAE3DC] bg-white p-4 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#78716C]">Verified Mobile</span>
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-[#FBECEF] text-[#800020]">
                    <Phone size={13} />
                  </span>
                </div>
                <strong className="mt-1.5 block text-base font-bold text-[#1C1917]">{phone}</strong>
                <span className="text-[11px] font-medium text-emerald-700">OTP verified session</span>
              </div>

              <div className="rounded-lg border border-[#EAE3DC] bg-white p-4 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#78716C]">Saved Addresses</span>
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-[#FBECEF] text-[#800020]">
                    <MapPin size={13} />
                  </span>
                </div>
                <strong className="mt-1.5 block text-base font-bold text-[#1C1917]">
                  {addresses.length} {addresses.length === 1 ? "location" : "locations"}
                </strong>
                <span className="block truncate text-[11px] text-[#57534E]">
                  {defaultAddr ? `Default: ${defaultAddr.label} (${defaultAddr.locality})` : "No default set yet"}
                </span>
              </div>

              <div className="rounded-lg border border-[#EAE3DC] bg-white p-4 shadow-[0_4px_16px_rgba(28,25,23,0.04)]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#78716C]">Service Alerts</span>
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-[#FBECEF] text-[#800020]">
                    <Bell size={13} />
                  </span>
                </div>
                <strong className="mt-1.5 block text-base font-bold text-[#1C1917]">
                  {preferences ? `${enabledAlerts} of 3 active` : "Standard alerts"}
                </strong>
                <span className="text-[11px] text-[#57534E]">Visit updates & receipts</span>
              </div>
            </section>

            {/* 2-Column Main Workspace */}
            <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr] lg:items-start">
              <section className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#1C1917]">Saved addresses</h2>
                    <p className="text-xs text-[#57534E]">Choose your default visit address or update directions.</p>
                  </div>
                  {!adding && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setConfirmRemoveId(null);
                        setAdding({ ...EMPTY_ADDRESS, contact_phone: phone });
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#800020]/25 bg-white px-3.5 text-xs font-bold text-[#800020] shadow-2xs transition hover:bg-[#800020] hover:text-white"
                    >
                      <Plus size={14} />
                      <span>Add new</span>
                    </button>
                  )}
                </div>

                {adding && (
                  <AddressFormCard
                    mode="add"
                    draft={adding}
                    pickerKey="add-address"
                    saving={savingAddress}
                    onChange={setAdding}
                    onSave={() => void createAddress(adding)}
                    onCancel={() => setAdding(null)}
                  />
                )}

                {editing && (
                  <AddressFormCard
                    mode="edit"
                    draft={editing}
                    initialQuery={[editing.street, editing.locality, editing.city, editing.postal_code].filter(Boolean).join(", ")}
                    pickerKey={`edit-${editing.id}`}
                    saving={savingAddress}
                    onChange={(next) => setEditing({ ...editing, ...next })}
                    onSave={() => void updateAddress(editing.id, editing)}
                    onCancel={() => setEditing(null)}
                  />
                )}

                {addresses.length > 0 ? (
                  <div className="space-y-3.5">
                    {addresses.map((item) => {
                      const isRemoving = confirmRemoveId === item.id;
                      const LabelIcon = item.label.toLowerCase() === "work" ? Briefcase : Home;
                      return (
                        <article
                          key={item.id}
                          className={`overflow-hidden rounded-lg border bg-white shadow-[0_4px_18px_rgba(28,25,23,0.04)] transition hover:shadow-[0_8px_24px_rgba(28,25,23,0.08)] ${
                            item.is_default ? "border-[#EAE3DC] border-l-4 border-l-[#800020]" : "border-[#EAE3DC]"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F4EFE9] bg-[#FCF9F6] px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1C1917]">
                                <span className="grid h-6 w-6 place-items-center rounded bg-[#FBECEF] text-[#800020]">
                                  <LabelIcon size={12} />
                                </span>
                                {item.label}
                              </span>
                              {item.is_default && (
                                <span className="rounded bg-[#800020] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                  Default
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {!item.is_default && (
                                <button
                                  type="button"
                                  disabled={savingAddress}
                                  onClick={() => void updateAddress(item.id, { is_default: true })}
                                  className="inline-flex min-h-[30px] items-center rounded border border-[#E2D9D0] bg-white px-2.5 text-[11px] font-semibold text-[#57534E] hover:border-[#800020] hover:text-[#800020]"
                                >
                                  Set default
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setAdding(null);
                                  setConfirmRemoveId(null);
                                  setEditing(item);
                                }}
                                className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#E2D9D0] bg-white px-2.5 text-[11px] font-semibold text-[#1C1917] hover:border-[#800020] hover:text-[#800020]"
                              >
                                <Pencil size={11} />
                                <span>Edit</span>
                              </button>
                              {isRemoving ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={savingAddress}
                                    onClick={() => void removeAddress(item.id)}
                                    className="inline-flex min-h-[30px] items-center rounded bg-[#800020] px-2.5 text-[11px] font-bold text-white"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveId(null)}
                                    className="inline-flex min-h-[30px] items-center rounded border border-[#E2D9D0] bg-white px-2 text-[11px] text-[#57534E]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmRemoveId(item.id)}
                                  aria-label={`Remove ${item.label} address`}
                                  className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#E2D9D0] bg-white px-2.5 text-[11px] font-semibold text-[#57534E] hover:border-[#800020] hover:text-[#800020]"
                                >
                                  <Trash2 size={11} />
                                  <span>Remove</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="p-4">
                            <p className="text-sm font-semibold text-[#1C1917]">
                              {[item.house_flat, item.street, item.locality, item.city, item.postal_code]
                                .filter(Boolean)
                                .join(", ")}
                            </p>
                            {(item.contact_name || item.contact_phone || item.landmark) && (
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#57534E]">
                                {item.contact_name && (
                                  <span className="rounded bg-[#FBF8F5] px-2 py-0.5 font-medium">
                                    Contact: {item.contact_name}
                                  </span>
                                )}
                                {item.contact_phone && (
                                  <span className="rounded bg-[#FBF8F5] px-2 py-0.5 font-medium">
                                    {item.contact_phone}
                                  </span>
                                )}
                                {item.landmark && (
                                  <span className="rounded bg-[#FBF8F5] px-2 py-0.5 font-medium">
                                    Near {item.landmark}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  !adding && (
                    <div className="rounded-lg border border-dashed border-[#D6CEC6] bg-white p-8 text-center shadow-2xs">
                      <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-[#FBECEF] text-[#800020]">
                        <MapPin size={20} />
                      </div>
                      <p className="mt-3 text-sm font-bold text-[#1C1917]">No saved addresses yet</p>
                      <p className="mt-1 text-xs text-[#57534E]">
                        Add your home or office address once so checkout takes under 30 seconds.
                      </p>
                      <button
                        type="button"
                        onClick={() => setAdding({ ...EMPTY_ADDRESS, contact_phone: phone })}
                        className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-md bg-[#800020] px-4 text-xs font-bold text-white"
                      >
                        <Plus size={14} />
                        <span>Add first address</span>
                      </button>
                    </div>
                  )
                )}
              </section>

              <aside className="space-y-4 lg:sticky lg:top-20">
                {preferences && (
                  <section className="overflow-hidden rounded-lg border border-[#EAE3DC] bg-white shadow-[0_6px_22px_rgba(28,25,23,0.05)]">
                    <div className="flex items-center gap-2 border-b border-[#F4EFE9] bg-[#FCF9F6] px-5 py-3.5">
                      <Bell size={15} className="text-[#800020]" />
                      <h2 className="text-sm font-bold text-[#1C1917]">Notification preferences</h2>
                    </div>

                    <div className="p-5">
                      <p className="text-xs leading-relaxed text-[#57534E]">
                        Control how NammaPros sends arrival updates, quotes, and invoices.
                      </p>

                      <div className="mt-4 space-y-2.5">
                        {(
                          [
                            {
                              field: "whatsapp_opt_in",
                              label: "WhatsApp updates",
                              hint: "Live pro arrival & slot reminders",
                            },
                            {
                              field: "sms_opt_in",
                              label: "SMS alerts",
                              hint: "Visit OTP PIN & confirmation alerts",
                            },
                            {
                              field: "email_opt_in",
                              label: "Email receipts",
                              hint: "GST invoices & warranty certificates",
                            },
                          ] as const
                        ).map((opt) => {
                          const enabled = preferences[opt.field];
                          return (
                            <label
                              key={opt.field}
                              className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 transition ${
                                enabled
                                  ? "border-[#800020]/30 bg-[#FCF7F8]"
                                  : "border-[#EAE3DC] bg-[#FBF8F5]"
                              }`}
                            >
                              <div>
                                <strong className="block text-xs font-bold text-[#1C1917]">{opt.label}</strong>
                                <span className="text-[11px] text-[#57534E]">{opt.hint}</span>
                              </div>
                              <span className="relative inline-flex shrink-0 items-center">
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={enabled}
                                  onChange={(e) =>
                                    setPreferences((cur) => (cur ? { ...cur, [opt.field]: e.target.checked } : null))
                                  }
                                />
                                <span className="h-5 w-9 rounded-full bg-[#D6CEC6] transition peer-checked:bg-[#800020]" />
                                <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition peer-checked:translate-x-4" />
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        disabled={savingPrefs}
                        onClick={() => void savePreferences()}
                        className="mt-4 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-md border border-[#800020] bg-white px-4 text-xs font-bold text-[#800020] transition hover:bg-[#800020] hover:text-white disabled:opacity-60"
                      >
                        {savingPrefs && <Loader2 size={14} className="animate-spin" />}
                        <span>Save preferences</span>
                      </button>
                    </div>
                  </section>
                )}

                <section className="rounded-lg bg-gradient-to-br from-[#2B0710] via-[#4D0A1B] to-[#800020] p-5 text-white shadow-[0_12px_28px_rgba(128,0,32,0.18)]">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#FCE7ED]">
                    <ShieldCheck size={12} />
                    Same-Day Availability
                  </span>
                  <h2 className="mt-1.5 text-base font-bold text-white">Plan your next home visit</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[#F3DCE2]">
                    Bundle AC service, tank cleaning, or repairs into one convenient slot with transparent pricing.
                  </p>
                  <Link
                    href="/book"
                    className="mt-4 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-md bg-white px-4 text-xs font-bold text-[#800020] shadow-xs transition hover:bg-[#FAF6F2]"
                  >
                    <span>Book a new service</span>
                    <ArrowRight size={14} />
                  </Link>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>

      <QuickOtpSheet
        open={showOtpSheet}
        onClose={() => setShowOtpSheet(false)}
        onAuthenticated={() => {
          setShowOtpSheet(false);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("nammapros:auth-changed"));
          }
          setLoading(true);
          void refreshAccountData();
        }}
      />
    </main>
  );
}

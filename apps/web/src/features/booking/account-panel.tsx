"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bookingApi, type Address, type NotificationPreferences } from "@/lib/booking-api";

export function AccountPanel() {
  const [phone, setPhone] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editing, setEditing] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  useEffect(() => {
    let active = true;
    bookingApi.me().then(me => {
      if (!active) return;
      setPhone(me.phone_e164);
      void bookingApi.addresses().then(result => { if (active) setAddresses(result.addresses); })
        .catch(() => { if (active) setMessage("Saved addresses could not be loaded."); });
      void bookingApi.notificationPreferences().then(result => { if (active) setPreferences(result); })
        .catch(() => { if (active) setMessage("Notification preferences could not be loaded."); });
    }).catch(() => { if (active) setMessage("Sign in from the booking page to manage addresses."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function update(id: string, values: Partial<Address>) {
    setMessage("");
    try { await bookingApi.updateAddress(id, values); setAddresses((await bookingApi.addresses()).addresses); setEditing(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Address update failed."); }
  }
  async function archive(id: string) {
    if (!window.confirm("Archive this address?")) return;
    setMessage("");
    try { await bookingApi.archiveAddress(id); setAddresses((await bookingApi.addresses()).addresses); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Address could not be archived."); }
  }
  async function signOut() {
    try {
      await bookingApi.logout();
      setPhone(""); setAddresses([]); setPreferences(null); setMessage("Signed out.");
    } catch { setMessage("Sign-out could not be confirmed. Please retry."); }
  }
  async function savePreferences() {
    if (!preferences) return;
    try { setPreferences(await bookingApi.saveNotificationPreferences(preferences)); setMessage("Notification preferences saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Notification preferences could not be saved."); }
  }
  return <main className="container simple-page account-page"><h1>Your account</h1>{loading ? <div className="booking-loading" aria-label="Loading account"><span className="ui-skeleton"/></div> : !phone ? <><p>{message}</p><Link className="button button-primary page-actions" href="/book">Sign in to book</Link></> : <><p>Signed in as {phone}</p>{message && <div className="booking-warning" role="alert">{message}</div>}<h2>Saved addresses</h2>{addresses.length ? addresses.map(item => <div className="ui-card account-address" key={item.id}><b>{item.label}{item.is_default ? " · Default" : ""}</b><p>{item.line_1}, {item.locality}, {item.city} {item.postal_code}</p><div className="booking-actions"><button className="button button-outline" onClick={() => setEditing(item)}>Edit</button>{!item.is_default && <button className="button button-outline" onClick={() => update(item.id, { is_default: true })}>Set default</button>}<button className="button button-outline" onClick={() => archive(item.id)}>Archive</button></div></div>) : <p>No saved addresses. Add one during booking.</p>}{editing && <div className="ui-card account-editor"><h3>Edit {editing.label}</h3>{(["label", "contact_name", "contact_phone", "house_flat", "street", "locality", "city", "state", "postal_code", "landmark"] as const).map(field => <div className="form-field" key={field}><label htmlFor={`edit-${field}`}>{field.replaceAll("_", " ")}</label><input className="ui-input" id={`edit-${field}`} value={editing[field]} onChange={event => setEditing(current => current ? { ...current, [field]: event.target.value } : null)}/></div>)}<div className="booking-actions"><button className="button button-outline" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" onClick={() => update(editing.id, editing)}>Save changes</button></div></div>}{preferences && <section className="ui-card"><h2>Notification preferences</h2><p>Choose how NammaPros may send service updates. Delivery requires an approved provider and template.</p>{(["whatsapp_opt_in", "sms_opt_in", "email_opt_in"] as const).map(field => <label key={field} className="booking-terms"><input type="checkbox" checked={preferences[field]} onChange={event => setPreferences(current => current ? { ...current, [field]: event.target.checked } : null)}/>{field === "whatsapp_opt_in" ? "WhatsApp" : field === "sms_opt_in" ? "SMS" : "Email"}</label>)}<button className="button button-outline" onClick={savePreferences}>Save notification preferences</button></section>}<div className="booking-actions"><Link className="button button-primary" href="/bookings">My Bookings</Link><Link className="button button-outline" href="/payments">Payment history</Link><button className="button button-outline" onClick={signOut}>Sign out</button></div></>}</main>;
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GoogleMapsLocationPicker, type PickedLocationResult } from "@/components/google-maps-location-picker";
import { bookingApi, type Address, type NotificationPreferences } from "@/lib/booking-api";

const emptyNewAddress: Omit<Address, "id" | "line_1"> = {
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

export function AccountPanel() {
  const [phone, setPhone] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editing, setEditing] = useState<Address | null>(null);
  const [adding, setAdding] = useState<Omit<Address, "id" | "line_1"> | null>(null);
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
    try {
      await bookingApi.updateAddress(id, values);
      setAddresses((await bookingApi.addresses()).addresses);
      setEditing(null);
      setMessage("Address updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Address update failed.");
    }
  }

  async function createNew(values: Omit<Address, "id" | "line_1">) {
    setMessage("");
    try {
      await bookingApi.createAddress(values);
      setAddresses((await bookingApi.addresses()).addresses);
      setAdding(null);
      setMessage("Address added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save address.");
    }
  }

  async function archive(id: string) {
    if (!window.confirm("Archive this address?")) return;
    setMessage("");
    try {
      await bookingApi.archiveAddress(id);
      setAddresses((await bookingApi.addresses()).addresses);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Address could not be archived.");
    }
  }

  async function signOut() {
    try {
      await bookingApi.logout();
      setPhone(""); setAddresses([]); setPreferences(null); setMessage("Signed out.");
    } catch {
      setMessage("Sign-out could not be confirmed. Please retry.");
    }
  }

  async function savePreferences() {
    if (!preferences) return;
    try {
      setPreferences(await bookingApi.saveNotificationPreferences(preferences));
      setMessage("Notification preferences saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Notification preferences could not be saved.");
    }
  }

  async function quickDevLogin() {
    setLoading(true); setMessage("");
    try {
      await bookingApi.firebaseAuth("dev-token:+919876543210");
      const me = await bookingApi.me();
      setPhone(me.phone_e164);
      const res = await bookingApi.addresses();
      setAddresses(res.addresses);
      setMessage("Signed in as dev test customer (+919876543210).");
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : "Dev login failed");
    } finally {
      setLoading(false);
    }
  }

  function applyPickedToEdit(picked: PickedLocationResult) {
    setEditing(current =>
      current
        ? {
            ...current,
            house_flat: picked.house_flat || current.house_flat,
            street: picked.street || current.street,
            locality: picked.locality || current.locality,
            city: picked.city || current.city,
            state: picked.state || current.state,
            postal_code: picked.postal_code || current.postal_code,
            latitude: picked.latitude,
            longitude: picked.longitude,
          }
        : null
    );
  }

  function applyPickedToAdd(picked: PickedLocationResult) {
    setAdding(current =>
      current
        ? {
            ...current,
            house_flat: picked.house_flat || current.house_flat,
            street: picked.street || current.street,
            locality: picked.locality || current.locality,
            city: picked.city || current.city,
            state: picked.state || current.state,
            postal_code: picked.postal_code || current.postal_code,
            latitude: picked.latitude,
            longitude: picked.longitude,
          }
        : null
    );
  }

  return (
    <main className="container simple-page account-page">
      <h1>Your account</h1>
      {loading ? (
        <div className="booking-loading" aria-label="Loading account"><span className="ui-skeleton" /></div>
      ) : !phone ? (
        <>
          <p>{message}</p>
          <div style={{ margin: "20px 0", padding: "16px", background: "#f8edf0", borderRadius: "12px", border: "1.5px dashed #800020", maxWidth: "400px" }}>
            <b style={{ display: "block", color: "#800020", marginBottom: "8px" }}>⚡ Quick Dev Sign-In</b>
            <button className="button button-primary" onClick={quickDevLogin}>Sign in as Test Customer</button>
          </div>
          <Link className="button button-outline page-actions" href="/book">Sign in to book</Link>
        </>
      ) : (
        <>
          <p>Signed in as {phone}</p>
          {message && <div className="booking-warning" role="alert">{message}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Saved addresses</h2>
            {!adding && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setEditing(null);
                  setAdding(emptyNewAddress);
                }}
              >
                Add new address
              </button>
            )}
          </div>
          {addresses.length ? (
            addresses.map(item => (
              <div className="ui-card account-address" key={item.id}>
                <b>{item.label}{item.is_default ? " · Default" : ""}</b>
                <p>{item.line_1}, {item.locality}, {item.city} {item.postal_code}</p>
                <div className="booking-actions">
                  <button
                    className="button button-outline"
                    onClick={() => {
                      setAdding(null);
                      setEditing(item);
                    }}
                  >
                    Edit
                  </button>
                  {!item.is_default && (
                    <button className="button button-outline" onClick={() => update(item.id, { is_default: true })}>
                      Set default
                    </button>
                  )}
                  <button className="button button-outline" onClick={() => archive(item.id)}>Archive</button>
                </div>
              </div>
            ))
          ) : (
            <p>No saved addresses. Add one below or during booking.</p>
          )}

          {adding && (
            <div className="ui-card account-editor mt-4">
              <h3>Add new address</h3>
              <div className="my-4">
                <GoogleMapsLocationPicker
                  checkServiceability={true}
                  title="Search address or use current location (Google Maps)"
                  onLocationSelected={applyPickedToAdd}
                />
              </div>
              {(["label", "contact_name", "contact_phone", "house_flat", "street", "locality", "city", "state", "postal_code", "landmark"] as const).map(field => (
                <div className="form-field" key={field}>
                  <label htmlFor={`add-${field}`}>{field.replaceAll("_", " ")}</label>
                  <input
                    className="ui-input"
                    id={`add-${field}`}
                    maxLength={field === "postal_code" ? 6 : undefined}
                    value={adding[field]}
                    onChange={event => setAdding(current => current ? { ...current, [field]: event.target.value } : null)}
                  />
                </div>
              ))}
              <div className="booking-actions">
                <button className="button button-outline" onClick={() => setAdding(null)}>Cancel</button>
                <button className="button button-primary" onClick={() => createNew(adding)}>Save address</button>
              </div>
            </div>
          )}

          {editing && (
            <div className="ui-card account-editor mt-4">
              <h3>Edit {editing.label}</h3>
              <div className="my-4">
                <GoogleMapsLocationPicker
                  key={editing.id}
                  checkServiceability={true}
                  initialQuery={[editing.street, editing.locality, editing.city, editing.postal_code].filter(Boolean).join(", ")}
                  title="Search replacement address or detect current location (Google Maps)"
                  onLocationSelected={applyPickedToEdit}
                />
              </div>
              {(["label", "contact_name", "contact_phone", "house_flat", "street", "locality", "city", "state", "postal_code", "landmark"] as const).map(field => (
                <div className="form-field" key={field}>
                  <label htmlFor={`edit-${field}`}>{field.replaceAll("_", " ")}</label>
                  <input
                    className="ui-input"
                    id={`edit-${field}`}
                    maxLength={field === "postal_code" ? 6 : undefined}
                    value={editing[field]}
                    onChange={event => setEditing(current => current ? { ...current, [field]: event.target.value } : null)}
                  />
                </div>
              ))}
              <div className="booking-actions">
                <button className="button button-outline" onClick={() => setEditing(null)}>Cancel</button>
                <button className="button button-primary" onClick={() => update(editing.id, editing)}>Save changes</button>
              </div>
            </div>
          )}

          {preferences && (
            <section className="ui-card">
              <h2>Notification preferences</h2>
              <p>Choose how NammaPros may send service updates. Delivery requires an approved provider and template.</p>
              {(["whatsapp_opt_in", "sms_opt_in", "email_opt_in"] as const).map(field => (
                <label key={field} className="booking-terms">
                  <input
                    type="checkbox"
                    checked={preferences[field]}
                    onChange={event => setPreferences(current => current ? { ...current, [field]: event.target.checked } : null)}
                  />
                  {field === "whatsapp_opt_in" ? "WhatsApp" : field === "sms_opt_in" ? "SMS" : "Email"}
                </label>
              ))}
              <button className="button button-outline" onClick={savePreferences}>Save notification preferences</button>
            </section>
          )}
          <div className="booking-actions">
            <Link className="button button-primary" href="/bookings">My Bookings</Link>
            <Link className="button button-outline" href="/payments">Payment history</Link>
            <button className="button button-outline" onClick={signOut}>Sign out</button>
          </div>
        </>
      )}
    </main>
  );
}

"use client";

import { problemSuggestions } from "@nammapros/config";
import type { Service } from "@nammapros/types";
import { Button, Input, MessageState } from "@nammapros/ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { bookingApi, BookingApiError, type Address, type Hold, type Quote, type Slot } from "@/lib/booking-api";

const steps = ["Select service", "Address & appointment", "Review & confirm"];
const emptyAddress: Omit<Address, "id" | "line_1"> = {
  label: "Home", contact_name: "", contact_phone: "", house_flat: "", street: "", locality: "",
  city: "", state: "Tamil Nadu", postal_code: "", landmark: "", is_default: false,
};
const money = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const appointment = (value: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function BookingShell({ services, requestedService, requestedProblem }: { services: Service[]; requestedService?: string; requestedProblem?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [serviceSlug, setServiceSlug] = useState(requestedService ?? "");
  const [packageId, setPackageId] = useState("");
  const [problem, setProblem] = useState(requestedProblem ?? "");
  const [user, setUser] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [challenge, setChallenge] = useState<{ id: string; developmentCode?: string } | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<Address, "id" | "line_1">>(emptyAddress);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");

  const selected = services.find(item => item.slug === serviceSlug);
  const selectedPackage = selected?.packages?.find(item => item.id === packageId);
  const categories = [...new Set(services.map(item => item.category))];
  const visible = useMemo(() => services.filter(item => (!category || item.category === category) &&
    (!search || `${item.name} ${item.summary}`.toLowerCase().includes(search.toLowerCase()))), [services, category, search]);
  const suggested = problemSuggestions.filter(item => item.label.toLowerCase().includes(search.toLowerCase()) &&
    services.some(service => service.slug === item.serviceSlug));

  useEffect(() => {
    let active = true;
    bookingApi.me().then(() => { if (active) setUser(true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!user) return;
    bookingApi.addresses().then(result => setAddresses(result.addresses)).catch(() => setMessage("Saved addresses could not be loaded. Try again."));
  }, [user]);

  function issue(error: unknown) {
    if (error instanceof BookingApiError) {
      if (error.status === 401 || error.status === 403) setUser(false);
      setMessage(error.message);
    } else setMessage("Something went wrong. Please try again.");
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); } catch (error) { issue(error); } finally { setBusy(false); }
  }
  function chooseService(slug: string) {
    setServiceSlug(slug); setPackageId(""); setAddress(null); setSlots([]); setHold(null); setQuote(null);
  }
  async function requestCode() {
    await run(async () => {
      if (!/^\+91[6-9]\d{9}$/.test(phone)) { setMessage("Enter a mobile number as +91 followed by ten digits."); return; }
      const result = await bookingApi.otpRequest(phone);
      setChallenge({ id: result.challenge_id, developmentCode: result.development_code });
      setMessage("Enter the code sent to your phone. In local development, the test code appears below.");
    });
  }
  async function verifyCode() {
    await run(async () => {
      if (!challenge) return;
      await bookingApi.otpVerify(phone, challenge.id, otp);
      setUser(true); setChallenge(null); setOtp("");
    });
  }
  async function saveAddress() {
    await run(async () => {
      if (!/^\d{6}$/.test(addressForm.postal_code)) { setMessage("Enter a valid six-digit PIN code."); return; }
      if (!addressForm.contact_name.trim() || !addressForm.house_flat.trim() || !addressForm.street.trim() ||
          !addressForm.locality.trim() || !addressForm.city.trim() || !addressForm.state.trim()) {
        setMessage("Complete the required address fields."); return;
      }
      const created = await bookingApi.createAddress(addressForm);
      setAddresses(current => [created, ...current]); setAddress(created); setSlots([]); setHold(null);
      setMessage("Address saved. Check appointment availability next.");
    });
  }
  async function checkSlots() {
    await run(async () => {
      if (!address || !selectedPackage) return;
      const coverage = await bookingApi.serviceability(selectedPackage.id, address.id);
      if (!coverage.supported) { setSlots([]); setMessage(coverage.reason ?? "This address is outside the configured service area."); return; }
      const start = new Date();
      const end = new Date(start.getTime() + 14 * 86400000);
      const response = await bookingApi.slots(selectedPackage.id, address.id, start.toISOString(), end.toISOString());
      setSlots(response.slots);
      if (!response.slots.length) setMessage("No appointments are configured for this address in the next 14 days. Try another address later.");
    });
  }
  async function chooseSlot(value: Slot) {
    await run(async () => {
      if (!address || !selectedPackage) return;
      if (hold) await bookingApi.release(hold.id).catch(() => {});
      const reserved = await bookingApi.hold(selectedPackage.id, address.id, value.id);
      setHold(reserved); setSlot(value);
      const priced = await bookingApi.quote(reserved.id);
      setQuote(priced); setTerms(false); setKey(crypto.randomUUID()); setStep(2);
    });
  }
  async function refreshQuote() {
    await run(async () => { if (hold) { setQuote(await bookingApi.quote(hold.id)); setTerms(false); setKey(crypto.randomUUID()); } });
  }
  async function confirm() {
    await run(async () => {
      if (!hold || !quote || !terms || !key) return;
      const booking = await bookingApi.confirm(hold.id, quote.id, quote.total_paise, key);
      router.push(`/bookings/${booking.id}${booking.status === "CONFIRMED_UNPAID" ? "?confirmed=1" : ""}`);
    });
  }
  return <div className="container booking-page"><div className="booking-header"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Home</Link> / Book a service</nav><span className="section-kicker">THREE SIMPLE STEPS</span><h1>Let’s plan your service.</h1><p>Availability and prices come from the NammaPros API. Your booking is confirmed only after the server responds.</p></div>
    <nav className="booking-progress" aria-label="Booking steps">{steps.map((label, index) => <button key={label} type="button" className={step === index ? "active" : ""} aria-current={step === index ? "step" : undefined} disabled={index > step} onClick={() => setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    {message && <div className="booking-warning" role="alert">{message}</div>}
    <div className="booking-layout"><div className="booking-panel" aria-live="polite">
      {step === 0 && <><h2>What needs attention?</h2><p>Choose a service and its configured package.</p><div className="form-field"><label htmlFor="service-search">Search a service or problem</label><Input id="service-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Try AC not cooling"/></div><div className="booking-category-filters"><button type="button" aria-pressed={!category} onClick={() => setCategory("")}>All</button>{categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item.replaceAll("-", " ")}</button>)}</div>{search && suggested.length > 0 && <div className="booking-problems">{suggested.map(item => <button type="button" key={item.label} onClick={() => { chooseService(item.serviceSlug); setProblem(item.label); setSearch(""); }}>{item.label}</button>)}</div>}
        <div className="booking-service-options" role="group" aria-label="Services">{visible.map(service => <button type="button" key={service.id} className={serviceSlug === service.slug ? "selected" : ""} aria-pressed={serviceSlug === service.slug} onClick={() => chooseService(service.slug)}><b>{service.name}</b><small>{service.summary}</small></button>)}</div>{!visible.length && <p>No matching services. Try a different search.</p>}
        {selected && <div className="booking-packages"><h3>Packages for {selected.name}</h3>{selected.packages?.length ? selected.packages.map(item => <label key={item.id} className="booking-package"><input type="radio" name="package" checked={packageId === item.id} onChange={() => setPackageId(item.id)}/><span><b>{item.name}</b><small>{item.pricing_model === "INSPECTION_BASED" ? "Inspection fee; further repairs require approval" : "Fixed price when quoted"} · About {item.duration_minutes} minutes</small><small>Includes: {item.inclusions.join(", ") || "See quote"}</small><small>Excludes: {item.exclusions.join(", ") || "None listed"}</small></span></label>) : <p>No bookable package has been published for this service.</p>}</div>}
        <div className="form-field"><label htmlFor="problem">Describe the problem (optional)</label><textarea id="problem" maxLength={1000} value={problem} onChange={event => setProblem(event.target.value)}/></div><div className="booking-actions"><Link className="button button-outline" href="/services">Browse services</Link><Button type="button" disabled={!selectedPackage || busy} onClick={() => setStep(1)}>Continue <ArrowRight size={16}/></Button></div></>}
      {step === 1 && <><h2>Where and when?</h2>{!user ? <div className="booking-auth"><p>Sign in to save an address and reserve an appointment. Browsing stays open without an account.</p><div className="form-field"><label htmlFor="phone">Mobile number (+91)</label><Input id="phone" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+919876543210"/></div>{challenge && <><div className="form-field"><label htmlFor="otp">Six-digit code</label><Input id="otp" inputMode="numeric" maxLength={6} value={otp} onChange={event => setOtp(event.target.value)}/></div>{challenge.developmentCode && <p className="demo-note">Local development code: {challenge.developmentCode}</p>}</>}<div className="booking-actions"><Button type="button" variant="secondary" onClick={() => setStep(0)}><ArrowLeft size={16}/> Back</Button><Button type="button" disabled={busy} onClick={challenge ? verifyCode : requestCode}>{challenge ? "Verify code" : "Send code"}</Button></div></div> : <><p>Choose a saved address or add a new one. A valid PIN alone does not guarantee coverage.</p>{addresses.length > 0 && <div className="booking-addresses" role="group" aria-label="Saved addresses">{addresses.map(item => <button type="button" key={item.id} className={address?.id === item.id ? "selected" : ""} aria-pressed={address?.id === item.id} onClick={() => { setAddress(item); setSlots([]); setHold(null); }}><b>{item.label}</b> · {item.line_1}, {item.locality}, {item.city} {item.postal_code}</button>)}</div>}
          <details className="booking-address-form"><summary>Add an address</summary><div className="booking-address-grid">{(["label", "contact_name", "contact_phone", "house_flat", "street", "locality", "city", "state", "postal_code", "landmark"] as const).map(field => <div className="form-field" key={field}><label htmlFor={field}>{field.replaceAll("_", " ")}{["contact_phone", "landmark"].includes(field) ? " (optional)" : ""}</label><Input id={field} value={addressForm[field]} onChange={event => setAddressForm(current => ({ ...current, [field]: event.target.value }))} maxLength={field === "postal_code" ? 6 : undefined}/></div>)}</div><Button type="button" disabled={busy} onClick={saveAddress}>Save address</Button></details>
          {address && <div className="booking-availability"><h3>Appointments for {address.label}</h3><Button type="button" variant="secondary" disabled={busy} onClick={checkSlots}>Check availability</Button>{slots.length > 0 && <div className="booking-slot-list">{slots.map(value => <button type="button" key={value.id} disabled={busy} onClick={() => chooseSlot(value)}>{appointment(value.start_at)} · {value.remaining} left</button>)}</div>}</div>}
          <div className="booking-actions"><Button type="button" variant="secondary" onClick={() => setStep(0)}><ArrowLeft size={16}/> Back</Button></div></>}</>}
      {step === 2 && <><h2>Review and confirm</h2>{quote && slot && address && <><div className="draft-summary"><div><span>Service</span><b>{selected?.name} · {selectedPackage?.name}</b></div><div><span>Address</span><b>{address.line_1}, {address.locality}, {address.city} {address.postal_code}</b></div><div><span>Appointment (IST)</span><b>{appointment(slot.start_at)}</b></div><div><span>Reservation expires</span><b>{appointment(hold?.expires_at ?? quote.expires_at)}</b></div>{quote.lines.filter(line => line.amount_paise > 0).map(line => <div key={line.code}><span>{line.code.toLowerCase()}</span><b>{money(line.amount_paise)}</b></div>)}<div><span>Total payable</span><b>{money(quote.total_paise)}</b></div><div><span>Payment</span><b>{quote.payment_policy === "PAY_AT_VISIT" ? "Pay at visit; no online payment now" : "Online prepaid — payment required to confirm"}</b></div></div>{selectedPackage?.pricing_model === "INSPECTION_BASED" && <p className="booking-warning">The amount shown covers inspection and configured fees. Additional repair costs require your approval.</p>}<label className="booking-terms"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)}/> I accept the price, appointment and booking terms shown above.</label><div className="booking-actions"><Button type="button" variant="secondary" onClick={() => setStep(1)}><ArrowLeft size={16}/> Edit appointment</Button><Button type="button" variant="secondary" disabled={busy} onClick={refreshQuote}>Refresh price</Button><Button type="button" disabled={busy || !terms} onClick={confirm}>{busy ? "Continuing…" : quote.payment_policy === "PREPAID" ? "Continue to payment" : "Confirm booking"}</Button></div></>}</>}
    </div><aside className="booking-summary"><h3>Your booking</h3><dl><dt>Service</dt><dd>{selected?.name ?? "Choose a service"}</dd><dt>Package</dt><dd>{selectedPackage?.name ?? "Choose a package"}</dd><dt>Location</dt><dd>{address?.city ?? "Choose an address"}</dd><dt>Appointment</dt><dd>{slot ? appointment(slot.start_at) : "Choose a slot"}</dd><dt>Price</dt><dd>{quote ? money(quote.total_paise) : "Awaiting server quote"}</dd></dl><p>Only configured, serviceable slots can be reserved.</p></aside></div>
  </div>;
}

export function BookingUnavailable({ message }: { message: string }) { return <main className="container simple-page"><MessageState title="Booking unavailable" description={message} action={<Link className="button button-outline page-actions" href="/services">Explore services</Link>}/></main>; }

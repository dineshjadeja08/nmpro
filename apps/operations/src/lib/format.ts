const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INR_COMPACT_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatMoneyPaise(paise: number | null | undefined, compact = false): string {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return "—";
  return (compact && paise % 100 === 0 ? INR_COMPACT_FORMATTER : INR_FORMATTER).format(paise / 100);
}

export function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatIstDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatIstTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function todayIstDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function shiftIsoDate(dateStr: string, days: number): string {
  const base = new Date(`${dateStr}T00:00:00+05:30`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function cleanPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export function telHref(phone: string | null | undefined): string | null {
  if (!phone || phone.includes("*")) return null;
  const cleaned = phone.trim();
  return cleaned ? `tel:${cleaned}` : null;
}

export function whatsappHref(phone: string | null | undefined, text?: string): string | null {
  if (!phone || phone.includes("*")) return null;
  const digits = cleanPhoneDigits(phone);
  if (digits.length < 10) return null;
  const waNum = digits.length === 10 ? `91${digits}` : digits;
  const suffix = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${waNum}${suffix}`;
}

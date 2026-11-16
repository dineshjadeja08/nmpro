/**
 * Business and legal details shown on the support and policy pages.
 * Set these as environment variables before launch; the bracketed defaults make missing
 * details obvious on the page instead of inventing them.
 */
export const site = {
  name: "NammaPros",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  whatsappNumber: (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""),
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  supportHours: process.env.NEXT_PUBLIC_SUPPORT_HOURS ?? "8 AM – 9 PM, every day",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME ?? "[Registered business name]",
  legalAddress: process.env.NEXT_PUBLIC_LEGAL_ADDRESS ?? "[Registered office address]",
  grievanceOfficer: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER ?? "[Grievance officer name]",
  grievanceEmail: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL ?? process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "[grievance email]",
  policyUpdated: process.env.NEXT_PUBLIC_POLICY_UPDATED ?? "[date]",
  reworkDays: Number(process.env.NEXT_PUBLIC_REWORK_DAYS ?? "30"),
};

export function whatsappLink(text = "Hi NammaPros, I need help with a booking.") {
  if (!site.whatsappNumber) return "";
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(text)}`;
}

/** Turn admin-entered HTML or plain text into safe paragraphs (no HTML is injected into the page). */
export function toParagraphs(content: string): string[] {
  const text = (content || "")
    .replace(/<\s*(br|\/p|\/h[1-6]|\/li|\/div)\s*\/?>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+\n/g, "\n").trim())
    .filter(Boolean);
}

export function formatPostDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

"use client";

import { MessageCircle, Phone } from "lucide-react";
import React from "react";
import { telHref, whatsappHref } from "@/lib/format";

export function PhoneActions({
  phone,
  whatsappMessage,
  compact = false,
}: {
  phone: string | null | undefined;
  whatsappMessage?: string;
  compact?: boolean;
}) {
  const tel = telHref(phone);
  const wa = whatsappHref(phone, whatsappMessage);

  if (!phone) {
    return <span className="text-[12px] text-[var(--op-muted)]">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[12px] text-[var(--op-text)]">{phone}</span>
      {tel && (
        <a
          href={tel}
          onClick={(e) => e.stopPropagation()}
          title={`Call ${phone}`}
          aria-label={`Call ${phone}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--op-border)] bg-[var(--op-surface)] text-[var(--op-muted)] hover:border-[var(--op-brand)] hover:text-[var(--op-brand)]"
        >
          <Phone className="h-3 w-3" />
        </a>
      )}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title={`WhatsApp ${phone}`}
          aria-label={`WhatsApp ${phone}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--op-border)] bg-[var(--op-surface)] text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50"
        >
          <MessageCircle className="h-3 w-3" />
        </a>
      )}
      {!compact && !tel && <span className="text-[11px] text-[var(--op-muted)]">(masked)</span>}
    </span>
  );
}

import React from "react";
import Image from "next/image";
import { cn } from "../../lib/utils";

export function AdminBrand({
  className,
  dark = false,
  showDescriptor = true,
}: {
  className?: string;
  dark?: boolean;
  showDescriptor?: boolean;
}) {
  return (
    <a
      href="/dashboard"
      aria-label="NammaPros admin dashboard"
      className={cn("inline-flex min-w-0 flex-col items-start select-none", className)}
    >
      <div className="relative h-9 w-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/admin-logo.png"
          alt="NammaPros - Your Home. Our Expertise."
          className="h-full w-auto object-contain object-left"
        />
      </div>
      {showDescriptor ? (
        <span
          className={cn(
            "mt-1 text-[9px] font-bold uppercase tracking-[0.2em]",
            dark ? "text-teal-400" : "text-teal-700"
          )}
        >
          Admin Portal
        </span>
      ) : null}
    </a>
  );
}

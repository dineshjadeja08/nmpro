import Link from "next/link";
import React from "react";

/** Simple, readable layout for policy, help and blog pages. */
export function ContentPage({
  eyebrow,
  title,
  intro,
  updated,
  breadcrumb,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro?: React.ReactNode;
  updated?: string;
  breadcrumb?: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <main className="bg-[#FBF8F5]">
      <div className="container max-w-3xl py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="mb-5 text-xs text-[#57534E]">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="underline underline-offset-2 hover:text-[#800020]">Home</Link></li>
            {(breadcrumb ?? []).map((b) => (
              <li key={b.href} className="flex items-center gap-1.5">
                <span aria-hidden="true">/</span>
                <Link href={b.href} className="underline underline-offset-2 hover:text-[#800020]">{b.label}</Link>
              </li>
            ))}
            <li className="flex items-center gap-1.5" aria-current="page">
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-[#1C1917]">{title}</span>
            </li>
          </ol>
        </nav>
        {eyebrow && <p className="text-xs font-bold uppercase tracking-wider text-[#800020]">{eyebrow}</p>}
        <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight text-[#1C1917] sm:text-4xl">{title}</h1>
        {intro && <div className="mt-3 text-base leading-relaxed text-[#57534E]">{intro}</div>}
        {updated && <p className="mt-2 text-xs text-[#78716C]">Last updated: {updated}</p>}
        <div className="content-prose mt-8 space-y-6 text-[15px] leading-relaxed text-[#292524]">{children}</div>
      </div>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <section aria-labelledby={id} className="space-y-2.5">
      <h2 id={id} className="text-lg font-bold text-[#1C1917]">{title}</h2>
      {children}
    </section>
  );
}

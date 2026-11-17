import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { ApiError } from "@nammapros/api-client";
import type { Service, ServiceCategory } from "@nammapros/types";
import { CategoryServiceLayout } from "@/components/category-service-layout";
import { api } from "@/lib/catalog";
import { categoryHref, serviceHref } from "@/lib/services";

/**
 * One services page, addressed like /services?city=chennai&category=ac&service=ac-chemical-wash
 * - category: which category to show (required; without it visitors go to the home page categories)
 * - service: opens that service's pop-up
 * - city: the customer's city (kept in the link so shared links show the same city)
 */
type Search = Promise<{ category?: string; service?: string; city?: string }>;

const WHATSAPP_HELP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "919840000000";

async function loadCategory(slug: string): Promise<
  { kind: "category"; category: ServiceCategory; services: Service[] } | { kind: "service"; service: Service } | { kind: "missing" }
> {
  try {
    const { category, services } = await api.categoryDetail(slug);
    return { kind: "category", category, services };
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  try {
    return { kind: "service", service: await api.service(slug) };
  } catch {
    return { kind: "missing" };
  }
}

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { category } = await searchParams;
  if (!category) return { title: "Services" };
  try {
    const detail = await api.categoryDetail(category);
    return {
      title: `${detail.category.name} Service`,
      description: detail.category.description || `Book ${detail.category.name} services from verified NammaPros professionals.`,
      alternates: { canonical: categoryHref(detail.category.slug) },
    };
  } catch {
    return { title: "Services" };
  }
}

export default async function ServicesPage({ searchParams }: { searchParams: Search }) {
  const { category: slug, service, city } = await searchParams;
  if (!slug) redirect("/#categories");

  const result = await loadCategory(slug.trim().toLowerCase());
  if (result.kind === "missing") notFound();
  if (result.kind === "service") redirect(serviceHref(result.service, city));

  const { category, services } = result;
  const active = services.filter((s) => s.is_active !== false && (!s.category || s.category === category.slug));
  if (active.length > 0) {
    return <CategoryServiceLayout category={category} services={active} initialService={service} />;
  }

  const whatsappHref = `https://wa.me/${WHATSAPP_HELP_NUMBER.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Hi NammaPros, I need help booking ${category.name} service.`)}`;
  return (
    <main className="bg-[#FBF8F5]">
      <section className="container py-12 text-center">
        <h1 className="font-serif text-2xl font-bold text-[#1C1917]">{category.name}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#57534E]">
          No {category.name} services are published yet. Message us and we&apos;ll arrange a verified professional.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[#117A4B] px-5 text-xs font-bold text-white">
            <MessageCircle size={15} aria-hidden="true" /> Chat on WhatsApp
          </a>
          <Link href="/#categories" className="inline-flex min-h-[44px] items-center rounded-md border border-[#EAE3DC] bg-white px-5 text-xs font-bold text-[#1C1917]">
            Browse categories
          </Link>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { BookingShell, BookingUnavailable } from "@/features/booking/booking-shell";
import { getCatalog } from "@/lib/catalog";
export const metadata: Metadata = { title: "Plan a home service", robots: { index: false, follow: false } };
export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string; problem?: string }> }) {
  const { data, error } = await getCatalog();
  const params = await searchParams;
  if (error || !data) return <BookingUnavailable message={error ?? "The catalog is not available."}/>;
  return <main><BookingShell services={data.services} requestedService={params.service} requestedProblem={params.problem}/></main>;
}

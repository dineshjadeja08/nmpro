import type { Metadata } from "next";
import { BookingDetail } from "@/features/booking/booking-detail";

export const metadata: Metadata = { title: "Booking details", robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ confirmed?: string }> }) {
  const { id } = await params;
  const { confirmed } = await searchParams;
  return <BookingDetail id={id} confirmed={confirmed === "1"}/>;
}

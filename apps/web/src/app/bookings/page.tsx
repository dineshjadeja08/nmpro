import type { Metadata } from "next";
import { BookingHistory } from "@/features/booking/booking-history";

export const metadata: Metadata = { title: "My bookings", robots: { index: false, follow: false } };
export default function Page() { return <BookingHistory/>; }

import type { Metadata } from "next";
import { PaymentHistory } from "@/features/booking/payment-history";

export const metadata: Metadata = { title: "Payment history", robots: { index: false, follow: false } };

export default function PaymentsPage() {
  return <PaymentHistory/>;
}

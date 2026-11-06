import type { Metadata } from "next";
import { FinancePanel } from "@/features/booking/finance-panel";

export const metadata: Metadata = { title: "Finance review", robots: { index: false, follow: false } };

export default function FinancePage() {
  return <FinancePanel/>;
}

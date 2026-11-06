import type { Metadata } from "next";
import { AccountPanel } from "@/features/booking/account-panel";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false } };
export default function Page() { return <AccountPanel/>; }

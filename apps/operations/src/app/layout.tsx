import type { ReactNode } from "react";
import "./globals.css";
export const metadata = { title: "NammaPros Operations", description: "Operations control center", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

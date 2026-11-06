import type { ReactNode } from "react";
import "./globals.css";
export const metadata = { title: "NammaPros Partner", description: "Technician workspace", manifest: "/manifest.webmanifest", robots: { index: false, follow: false } };
export const viewport = { themeColor: "#800020" };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

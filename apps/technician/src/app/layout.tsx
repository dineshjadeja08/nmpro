import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "NammaPros Partner",
  description: "Technician workspace",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "NammaPros Partner", statusBarStyle: "default" },
};
export const viewport = { themeColor: "#3c1023", width: "device-width", initialScale: 1 };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}

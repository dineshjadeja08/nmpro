import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { OpsProviders } from "@/components/ops/ops-providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata = {
  title: "NammaPros Operations",
  description: "High-density dispatch, SLA, lead CRM, and booking control room",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <OpsProviders>{children}</OpsProviders>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Nunito, Poppins } from "next/font/google";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-heading", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "nammapros. | Home services made clearer", template: "%s | nammapros." },
  description: "Explore appliance repairs, electrical and plumbing services with a simpler path to booking. Service availability is being prepared.",
  alternates: { canonical: "/" },
  openGraph: { title: "nammapros. | Your Home. Our Expertise.", description: "A clearer way to find home services.", siteName: "nammapros.", type: "website" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className={`${poppins.variable} ${nunito.variable}`}><body><Header/>{children}<Footer/></body></html>;
}

import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { BookingCartDrawer } from "@/components/booking-cart-drawer";
import { BookingCartProvider } from "@/components/booking-cart-provider";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { LocationProvider } from "@/components/location-provider";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "nammapros. | Home services made clearer", template: "%s | nammapros." },
  description:
    "Namma area, namma pros. Book verified home technicians across Chennai and Tamil Nadu with upfront pricing and a 30-day warranty.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "nammapros. | What’s not working at home?",
    description: "Pick, schedule, relax — verified pros at your doorstep in Chennai & Tamil Nadu.",
    siteName: "nammapros.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="pb-16 md:pb-0">
        <LocationProvider>
          <BookingCartProvider>
            <Header />
            {children}
            <Footer />
            <BookingCartDrawer />
            <MobileBottomNav />
          </BookingCartProvider>
        </LocationProvider>
      </body>
    </html>
  );
}

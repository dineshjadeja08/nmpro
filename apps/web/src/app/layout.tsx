import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { BookingCartDrawer } from "@/components/booking-cart-drawer";
import { BookingCartProvider } from "@/components/booking-cart-provider";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { LocationProvider } from "@/components/location-provider";
import { ZonePricingProvider } from "@/components/zone-pricing-provider";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta",
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
    <html lang="en" className={plusJakartaSans.variable}>
      <body className={`${plusJakartaSans.className} pb-16 md:pb-0`}>
        <LocationProvider>
          <ZonePricingProvider>
          <BookingCartProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-[#1C1917] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
            >
              Skip to main content
            </a>
            <Header />
            <div id="main-content" tabIndex={-1} className="outline-none">
              {children}
            </div>
            <Footer />
            <BookingCartDrawer />
            <MobileBottomNav />
          </BookingCartProvider>
          </ZonePricingProvider>
        </LocationProvider>
      </body>
    </html>
  );
}

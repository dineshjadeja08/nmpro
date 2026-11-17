import Link from "next/link";
import { Brand } from "./brand";

export function Footer() {
  return (
    <footer className="bg-[#1C1614] text-[#D6CEC6]">
      <div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <div className="inline-flex">
            <Brand variant="dark" compact />
          </div>
          <p className="text-xs leading-relaxed text-[#A89F96]">
            Home services across Tamil Nadu, starting in Chennai. Verified professionals, upfront pricing, and a 30-day rework guarantee.
          </p>
        </div>

        <nav aria-label="Popular services" className="flex flex-col gap-2 text-xs">
          <b className="mb-1 text-white">Services</b>
          <Link href="/ac-service-chennai" className="text-white hover:underline underline-offset-2">AC Service in Chennai</Link>
          <Link href="/services?city=chennai&category=water-tank-cleaning" className="text-white hover:underline underline-offset-2">Water Tank Cleaning</Link>
          <Link href="/services?city=chennai&category=washing-machine" className="text-white hover:underline underline-offset-2">Washing Machine Repair</Link>
          <Link href="/#categories" className="text-white hover:underline underline-offset-2">All categories</Link>
        </nav>

        <div className="flex flex-col gap-2 text-xs">
          <b className="mb-1 text-white">Company</b>
          <Link href="/about" className="text-white hover:underline underline-offset-2">About us</Link>
          <Link href="/blog" className="text-white hover:underline underline-offset-2">Home care guides</Link>
          <Link href="/join-as-technician" className="text-white hover:underline underline-offset-2">Join as a pro</Link>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <b className="mb-1 text-white">Help</b>
          <Link href="/support" className="text-white hover:underline underline-offset-2">Help &amp; support</Link>
          <Link href="/faq" className="text-white hover:underline underline-offset-2">FAQs</Link>
          <Link href="/bookings" className="text-white hover:underline underline-offset-2">My bookings</Link>
          <Link href="/cancellation-policy" className="text-white hover:underline underline-offset-2">Cancellation &amp; refunds</Link>
          <Link href="/terms" className="text-white hover:underline underline-offset-2">Terms of service</Link>
          <Link href="/privacy-policy" className="text-white hover:underline underline-offset-2">Privacy policy</Link>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container flex flex-wrap items-center justify-between gap-2 py-4 text-[11px] text-[#8C8278]">
          <span>© {new Date().getFullYear()} NammaPros. Prices shown are inclusive of visit charges unless stated.</span>
          <span>Namma area, namma pros · Chennai &amp; Tamil Nadu</span>
        </div>
      </div>
    </footer>
  );
}

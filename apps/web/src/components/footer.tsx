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

        <div className="flex flex-col gap-2 text-xs">
          <b className="mb-1 text-white">Services</b>
          <Link href="/services/ac" className="hover:text-white">AC Service in Chennai</Link>
          <Link href="/services/water-tank-cleaning" className="hover:text-white">Water Tank Cleaning</Link>
          <Link href="/services/washing-machine" className="hover:text-white">Washing Machine Repair</Link>
          <Link href="/services" className="hover:text-white">All services</Link>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <b className="mb-1 text-white">Company</b>
          <Link href="/#how-it-works" className="hover:text-white">How it works</Link>
          <Link href="/join-as-technician" className="hover:text-white">Join as a pro</Link>
          <Link href="/search" className="hover:text-white">Search by problem</Link>
        </div>

        <div className="flex flex-col gap-2 text-xs">
          <b className="mb-1 text-white">Help</b>
          <Link href="/bookings" className="hover:text-white">My bookings</Link>
          <Link href="/account" className="hover:text-white">Account &amp; addresses</Link>
          <Link href="/payments" className="hover:text-white">Payment history</Link>
          <Link href="/book" className="hover:text-white">Book a visit</Link>
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

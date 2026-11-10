import Link from "next/link";
import { Brand } from "./brand";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Brand />
          <p>
            Namma area, namma pros. Home repairs, appliance care, and maintenance across Chennai and Tamil Nadu with clear pricing and a 30-day warranty.
          </p>
        </div>

        <div>
          <b>Popular Services</b>
          <Link href="/services/ac">AC Service &amp; Repair</Link>
          <Link href="/services/washing-machine">Washing Machine Repair</Link>
          <Link href="/services/water-heater">Water Heater &amp; Geyser</Link>
          <Link href="/services/water-tank-cleaning">Water Tank Cleaning</Link>
          <Link href="/services">All Services</Link>
        </div>

        <div>
          <b>Book &amp; Manage</b>
          <Link href="/search">Search by Problem</Link>
          <Link href="/book">Pick a Slot &amp; Book</Link>
          <Link href="/bookings">My Bookings</Link>
          <Link href="/account">Saved Addresses &amp; Account</Link>
        </div>

        <div>
          <b>For Professionals</b>
          <Link href="/join-as-technician">Join as a Pro</Link>
          <p>
            Available across active Chennai service zones. Extra parts are billed only after your explicit approval.
          </p>
        </div>
      </div>

      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} nammapros.</span>
        <span>Namma area, namma pros · Chennai &amp; Tamil Nadu</span>
      </div>
    </footer>
  );
}

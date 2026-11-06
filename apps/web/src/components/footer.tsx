import Link from "next/link";
import { Brand } from "./brand";

export function Footer() {
  return <footer className="site-footer"><div className="container footer-grid">
    <div><Brand /><p>Home-service discovery for everyday repairs and maintenance. Booking availability and prices will appear once verified for your address.</p></div>
    <div><b>Explore</b><Link href="/services">All services</Link><Link href="/search">Search by problem</Link><Link href="/book">Start booking</Link></div>
    <div><b>Your account</b><Link href="/bookings">My bookings</Link><Link href="/account">Account</Link><Link href="/join-as-technician">Work with us</Link></div>
    <div><b>About this release</b><p>Bookings require configured service areas, prices and capacity. Online payment is not available yet.</p></div>
  </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} nammapros.</span><span>Your Home. Our Expertise.</span></div></footer>;
}

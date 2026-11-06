"use client";

import { MapPin, Menu, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Brand } from "./brand";

export function Header() {
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <div className="header-main container">
      <Brand />
      <div className="header-location"><MapPin size={18} /><span><b>Service location</b><small>Check availability by address</small></span></div>
      <Link className="header-search" href="/search"><Search size={19}/><span>Search services or describe a problem</span><kbd>Search</kbd></Link>
      <nav className="header-actions" aria-label="Main navigation">
        <Link href="/services">Services</Link><Link href="/bookings">My Bookings</Link><Link href="/account" aria-label="Account"><UserRound size={19}/> Account</Link>
      </nav>
      <Link href="/book" className="button button-primary header-cta">Book a Service</Link>
      <button className="mobile-menu-button" type="button" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu">{open ? <X/> : <Menu/>}</button>
    </div>
    <div className="mobile-quick container"><span><MapPin size={15}/> Tamil Nadu · select address at booking</span><Link href="/search"><Search size={17}/> Search</Link></div>
    {open && <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation"><Link href="/services" onClick={() => setOpen(false)}>Explore services</Link><Link href="/book" onClick={() => setOpen(false)}>Book a service</Link><Link href="/bookings" onClick={() => setOpen(false)}>My bookings</Link><Link href="/account" onClick={() => setOpen(false)}>Account</Link></nav>}
  </header>;
}

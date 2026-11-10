"use client";

import type { Service } from "@nammapros/types";
import { MessageState } from "@nammapros/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlotFirstCheckout } from "@/components/slot-first-checkout";

export function BookingShell({
  services,
  requestedService,
  requestedProblem,
}: {
  services: Service[];
  requestedService?: string;
  requestedProblem?: string;
}) {
  const router = useRouter();
  const initialService = services.find((item) => item.slug === requestedService) ?? services[0] ?? null;

  return (
    <div className="container booking-page pb-28 md:pb-20">
      <div className="booking-header">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link> / Book a service
        </nav>
        <span className="section-kicker">NAMMA AREA, NAMMA PROS</span>
        <h1>Book in three calm steps.</h1>
        <p>Pick when works for you, confirm your address, and lock your pro’s visit.</p>
      </div>

      <SlotFirstCheckout
        services={services}
        initialService={initialService}
        initialProblem={requestedProblem ?? ""}
        onBookingCompleted={(booking) => {
          router.push(`/bookings/${booking.id}${booking.status === "CONFIRMED_UNPAID" ? "?confirmed=1" : ""}`);
        }}
      />
    </div>
  );
}

export function BookingUnavailable({ message }: { message: string }) {
  return (
    <main className="container simple-page">
      <MessageState
        title="Booking unavailable"
        description={message}
        action={
          <Link className="button button-outline page-actions" href="/services">
            Explore services
          </Link>
        }
      />
    </main>
  );
}

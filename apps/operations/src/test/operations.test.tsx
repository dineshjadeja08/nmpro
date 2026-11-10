import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { LeadDrawer } from "@/components/drawers/lead-drawer";
import { OpsProviders } from "@/components/ops/ops-providers";
import { SlaChip, StatusBadge } from "@/components/ops/ops-status-badge";
import { api } from "@/lib/api";
import { formatMoneyPaise } from "@/lib/format";
import { evaluateSlaDeadline, getBookingAllowedActions, getStatusMeta } from "@/lib/status";

vi.mock("@/components/ops/ops-shell", () => ({
  useBookingDrawer: () => ({
    openBookingDrawer: vi.fn(),
    closeBookingDrawer: vi.fn(),
    activeBookingId: null,
    triggerBookingFocus: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    lead: vi.fn(),
    leadActivities: vi.fn().mockResolvedValue({ results: [] }),
    conversionOptions: vi.fn(),
    convertLead: vi.fn(),
    updateLead: vi.fn(),
  },
}));

describe("Operations status mapping & formatting", () => {
  it("maps every core booking/dispatch/SLA state to the shared tone palette", () => {
    expect(getStatusMeta("AWAITING_PAYMENT").tone).toBe("amber");
    expect(getStatusMeta("CONFIRMED").tone).toBe("blue");
    expect(getStatusMeta("OFFERED").tone).toBe("yellow");
    expect(getStatusMeta("TECHNICIAN_ASSIGNED").tone).toBe("indigo");
    expect(getStatusMeta("TECHNICIAN_EN_ROUTE").tone).toBe("violet");
    expect(getStatusMeta("IN_PROGRESS").tone).toBe("orange");
    expect(getStatusMeta("COMPLETED").tone).toBe("green");
    expect(getStatusMeta("CANCELLED").tone).toBe("zinc");
    expect(getStatusMeta("PAYMENT_FAILED").tone).toBe("red");
    expect(getStatusMeta("BREACHED").tone).toBe("red");
  });

  it("renders StatusBadge cleanly and formats paise in INR", () => {
    render(<StatusBadge status="TECHNICIAN_EN_ROUTE" />);
    expect(screen.getByText("En route")).toBeTruthy();
    expect(formatMoneyPaise(64900)).toBe("₹649.00");
  });
});

describe("SLA chip countdown & severity", () => {
  it("marks >30m green ON_TRACK, <30m amber AT_RISK with countdown, and past deadlines red BREACHED", () => {
    const now = Date.parse("2030-01-01T10:00:00Z");

    const ok = evaluateSlaDeadline("2030-01-01T11:30:00Z", now);
    expect(ok.severity).toBe("ON_TRACK");
    expect(ok.label).toBe("1h 30m");

    const risk = evaluateSlaDeadline("2030-01-01T10:12:05Z", now);
    expect(risk.severity).toBe("AT_RISK");
    expect(risk.label).toBe("12:05");

    const breached = evaluateSlaDeadline("2030-01-01T09:40:00Z", now);
    expect(breached.severity).toBe("BREACHED");
    expect(breached.label).toBe("Breached 20m");

    render(<SlaChip deadlineAt="2030-01-01T10:12:05Z" nowMsOverride={now} />);
    expect(screen.getByText("12:05")).toBeTruthy();
  });
});

describe("Booking action availability from state machine", () => {
  it("enables assign, offer, reschedule, and cancel for unassigned CONFIRMED_UNPAID bookings", () => {
    const allowed = getBookingAllowedActions({
      status: "CONFIRMED_UNPAID",
      payment_status: "UNPAID",
      balance_due_paise: 49900,
      technician: null,
    });
    expect(allowed.canAssign).toBe(true);
    expect(allowed.canOffer).toBe(true);
    expect(allowed.canReassign).toBe(false);
    expect(allowed.canReschedule).toBe(true);
    expect(allowed.canCancel).toBe(true);
    expect(allowed.canRecordBalance).toBe(true);
  });

  it("blocks reassign after arrival and blocks mutations on COMPLETED bookings", () => {
    const arrived = getBookingAllowedActions({
      status: "TECHNICIAN_ARRIVED",
      payment_status: "PAID",
      balance_due_paise: 0,
      technician: { id: "t1", name: "Ramesh", status: "ARRIVED" },
    });
    expect(arrived.canReassign).toBe(false);
    expect(arrived.canReschedule).toBe(false);
    expect(arrived.canCancel).toBe(true);

    const completed = getBookingAllowedActions({
      status: "COMPLETED",
      payment_status: "PAID",
      balance_due_paise: 0,
      technician: { id: "t1", name: "Ramesh", status: "SERVICE_COMPLETED" },
    });
    expect(completed.canAssign).toBe(false);
    expect(completed.canReassign).toBe(false);
    expect(completed.canCancel).toBe(false);
    expect(completed.canReschedule).toBe(false);
    expect(completed.canComplete).toBe(false);
  });
});

describe("Lead conversion flow", () => {
  it("loads qualified packages/slots and converts a lead to a booking", async () => {
    vi.mocked(api.lead).mockResolvedValue({
      id: "lead-1",
      lead_reference: "NL-261110-AAA111",
      customer_name: "Meera",
      mobile_number: "+919876543210",
      alternate_mobile: "",
      email: "",
      service_category_id: "cat-1",
      service_category: "AC",
      service_id: "svc-1",
      service: "AC Service & Repair",
      zone_id: "zone-1",
      problem_description: "Not cooling",
      address: "12 North Street",
      landmark: "",
      area: "Anna Nagar",
      city: "Chennai",
      pincode: "600040",
      preferred_date: null,
      preferred_time: null,
      urgency: "SOON",
      source: "PHONE_CALL",
      status: "QUALIFIED",
      priority: "HIGH",
      assigned_to: null,
      assigned_to_phone: null,
      follow_up_at: null,
      internal_notes: "",
      converted_booking_id: null,
      created_at: "2030-01-01T08:00:00Z",
      activities: [],
      follow_ups: [],
    });

    vi.mocked(api.conversionOptions).mockResolvedValue({
      packages: [
        {
          id: "pkg-1",
          name: "Standard AC Service",
          payment_policy: "PAY_AT_VISIT",
          total_paise: 49900,
          slots: [{ id: "slot-1", start_at: "2030-01-02T04:30:00Z", remaining: 3 }],
        },
      ],
    });

    vi.mocked(api.convertLead).mockResolvedValue({
      id: "lead-1",
      lead_reference: "NL-261110-AAA111",
      customer_name: "Meera",
      mobile_number: "+919876543210",
      alternate_mobile: "",
      email: "",
      service_category_id: "cat-1",
      service_category: "AC",
      service_id: "svc-1",
      service: "AC Service & Repair",
      zone_id: "zone-1",
      problem_description: "Not cooling",
      address: "12 North Street",
      landmark: "",
      area: "Anna Nagar",
      city: "Chennai",
      pincode: "600040",
      preferred_date: null,
      preferred_time: null,
      urgency: "SOON",
      source: "PHONE_CALL",
      status: "CONVERTED",
      priority: "HIGH",
      assigned_to: null,
      assigned_to_phone: null,
      follow_up_at: null,
      internal_notes: "",
      converted_booking_id: "book-99",
      created_at: "2030-01-01T08:00:00Z",
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OpsProviders>
          <LeadDrawer leadId="lead-1" onClose={vi.fn()} />
        </OpsProviders>
      </QueryClientProvider>
    );

    expect(await screen.findByText("NL-261110-AAA111")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Convert" }));

    const pkgSelect = await screen.findByLabelText("Conversion package");
    fireEvent.change(pkgSelect, { target: { value: "pkg-1" } });

    const slotSelect = await screen.findByLabelText("Conversion slot");
    fireEvent.change(slotSelect, { target: { value: "slot-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Confirm Slot Conversion" }));

    await waitFor(() => {
      expect(api.convertLead).toHaveBeenCalledWith("lead-1", {
        package_id: "pkg-1",
        slot_id: "slot-1",
        accepted_total_paise: 49900,
      });
    });
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Service } from "@nammapros/types";
import { BookingCartDrawer } from "@/components/booking-cart-drawer";
import { BookingCartProvider } from "@/components/booking-cart-provider";
import { Header } from "@/components/header";
import { LocationProvider } from "@/components/location-provider";
import { ProblemSearch } from "@/components/problem-search";
import { ServiceCard } from "@/components/service-card";
import { ServiceDetailView } from "@/components/service-detail-view";
import { SlotFirstCheckout } from "@/components/slot-first-checkout";
import { BookingShell } from "@/features/booking/booking-shell";
import { bookingApi } from "@/lib/booking-api";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
}));
vi.mock("@/lib/booking-api", () => ({
  BookingApiError: class BookingApiError extends Error {
    status = 409;
    code = "CONFLICT";
  },
  bookingApi: {
    me: vi.fn().mockResolvedValue({ id: 1, phone_e164: "+919876543210" }),
    addresses: vi.fn().mockResolvedValue({
      addresses: [
        {
          id: "a1",
          label: "Home",
          contact_name: "Priya",
          contact_phone: "+919876543210",
          house_flat: "12",
          street: "North Street",
          line_1: "12 North Street",
          locality: "Mylapore",
          city: "Chennai",
          state: "Tamil Nadu",
          postal_code: "600004",
          landmark: "",
          is_default: true,
        },
      ],
    }),
    updateAddress: vi.fn().mockResolvedValue({
      id: "a1",
      label: "Home",
      contact_name: "Priya",
      contact_phone: "+919876543210",
      house_flat: "4B",
      street: "2nd Avenue",
      line_1: "4B, 2nd Avenue",
      locality: "Anna Nagar",
      city: "Chennai",
      state: "Tamil Nadu",
      postal_code: "600040",
      landmark: "",
      is_default: true,
    }),
    locationAutocomplete: vi.fn().mockResolvedValue({
      suggestions: [
        {
          id: "place_anna",
          description: "Anna Nagar, Chennai, Tamil Nadu, India",
          main_text: "Anna Nagar",
          secondary_text: "Chennai, Tamil Nadu, India",
        },
      ],
    }),
    locationGeocode: vi.fn().mockResolvedValue({
      formatted_address: "Anna Nagar, Chennai, Tamil Nadu, India",
      house_flat: "4B",
      street: "2nd Avenue",
      locality: "Anna Nagar",
      city: "Chennai",
      state: "Tamil Nadu",
      postal_code: "600040",
      latitude: 13.085,
      longitude: 80.2101,
    }),
    locationReverseGeocode: vi.fn().mockResolvedValue({
      formatted_address: "T. Nagar, Chennai, Tamil Nadu, India",
      house_flat: "12",
      street: "Usman Road",
      locality: "T. Nagar",
      city: "Chennai",
      state: "Tamil Nadu",
      postal_code: "600017",
      latitude: 13.0418,
      longitude: 80.2341,
    }),
    serviceAreaCheck: vi.fn().mockResolvedValue({
      is_supported: true,
      supported: true,
      service_area: { id: "z1", name: "Anna Nagar", city: "Chennai", state: "Tamil Nadu", postal_code: "600040" },
      areas: [],
    }),
    serviceability: vi.fn().mockResolvedValue({ supported: true }),
    publicSlots: vi.fn().mockResolvedValue({
      slots: [
        { id: "s1", start_at: "2030-01-01T04:30:00Z", end_at: "2030-01-01T05:30:00Z", remaining: 2, version: 1 },
        { id: "s2", start_at: "2030-01-01T07:30:00Z", end_at: "2030-01-01T08:30:00Z", remaining: 0, version: 1 },
      ],
    }),
    slots: vi.fn().mockResolvedValue({
      slots: [
        { id: "s1", start_at: "2030-01-01T04:30:00Z", end_at: "2030-01-01T05:30:00Z", remaining: 2, version: 1 },
      ],
    }),
    hold: vi.fn().mockResolvedValue({ id: "h1", expires_at: "2030-01-01T09:00:00Z" }),
    quote: vi.fn().mockResolvedValue({
      id: "q1",
      hold_id: "h1",
      expires_at: "2030-01-01T09:00:00Z",
      lines: [{ code: "INSPECTION", amount_paise: 49000 }],
      total_paise: 49000,
      payment_policy: "PAY_AT_VISIT",
    }),
    confirm: vi.fn().mockResolvedValue({
      id: "b1",
      reference: "NP-2030-001",
      status: "CONFIRMED_UNPAID",
      service: "AC Service & Repair",
      package: "Inspection",
      address: { label: "Home", line_1: "12 North Street", locality: "Mylapore", city: "Chennai", postal_code: "600004" },
      slot: { start_at: "2030-01-01T04:30:00Z", end_at: "2030-01-01T05:30:00Z" },
      price: { lines: [{ code: "INSPECTION", amount_paise: 49000 }], total_paise: 49000, currency: "INR" },
    }),
    paymentOrder: vi.fn().mockResolvedValue({
      order_id: "order_adv_1",
      key_id: "rzp_test_123",
      amount_paise: 19900,
      currency: "INR",
      expires_at: "2030-01-01T09:00:00Z",
    }),
    verifyPayment: vi.fn().mockResolvedValue({
      booking_id: "b-adv",
      status: "CONFIRMED",
      payment_status: "ADVANCE_PAID",
    }),
    booking: vi.fn().mockResolvedValue({
      id: "b-adv",
      reference: "NP-ADV-001",
      status: "CONFIRMED",
      payment_status: "ADVANCE_PAID",
      service: "AC Service & Repair",
      package: "Inspection",
      address: { label: "Home", line_1: "12 North Street", locality: "Mylapore", city: "Chennai", postal_code: "600004" },
      slot: { start_at: "2030-01-01T04:30:00Z", end_at: "2030-01-01T05:30:00Z" },
      price: {
        lines: [{ code: "BASE_PRICE", amount_paise: 64900 }],
        total_paise: 64900,
        advance_paise: 19900,
        remaining_balance_paise: 45000,
        currency: "INR",
      },
    }),
    saveNotificationPreferences: vi.fn().mockResolvedValue({ whatsapp_opt_in: true, sms_opt_in: true, email_opt_in: true }),
  },
}));

vi.mock("@/lib/catalog", () => ({
  getCatalog: async () => ({
    data: {
      categories: [{ id: "c1", slug: "ac", name: "AC", description: "Cooling & installation" }],
      services: [service],
      reviews: [
        {
          id: "r1",
          rating: 5,
          comment: "Super clean foam wash.",
          customer_name: "Anitha",
          area: "Anna Nagar",
          service_name: "AC Service & Repair",
          technician_name: "Suresh K",
          created_at: "2030-01-01T10:00:00Z",
        },
      ],
      banners: [],
      trust_stats: { average_rating: 4.8, review_count: 12, completed_bookings_count: 15 },
      demo: true,
    },
    error: null,
  }),
}));

const service: Service = {
  id: "1",
  slug: "ac-service-repair",
  name: "AC Service & Repair",
  summary: "Cooling help",
  category: "ac",
  starting_price_paise: 64900,
  rating_avg: 4.8,
  review_count: 12,
  inclusions: ["Filter cleaning", "Drain pipe check"],
  exclusions: ["Spare parts charged separately after approval"],
  is_active: true,
  packages: [
    {
      id: "p1",
      name: "Inspection",
      pricing_model: "INSPECTION_BASED",
      duration_minutes: 60,
      inclusions: ["Diagnosis", "Cooling check", "Coil inspection", "Airflow check"],
      exclusions: ["Parts"],
      starting_price_paise: 64900,
      original_price_paise: 79900,
      is_most_booked: true,
    },
  ],
};

describe("customer experience", () => {
  it("renders the problem-first homepage with search chips, categories, and live catalog", async () => {
    const { default: Home } = await import("@/app/page");
    render(await Home());
    expect(screen.getByRole("heading", { name: /What’s not working at home/i })).toBeTruthy();
    expect(screen.getByText("Tank needs cleaning")).toBeTruthy();
    expect(screen.getAllByText("AC Service & Repair").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Pick" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Schedule" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Relax" })).toBeTruthy();
  });

  it("renders a service card with price and booking actions", () => {
    render(<ServiceCard service={service} />);
    expect(screen.getByText("AC Service & Repair")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start booking AC Service & Repair" }).getAttribute("href")).toContain("/book?service=");
  });

  it("renders rich service detail view and slides open cart sheet on Add", async () => {
    render(
      <LocationProvider>
        <BookingCartProvider>
          <ServiceDetailView
            category={{ id: "c1", slug: "ac", name: "AC", description: "Cooling" }}
            service={service}
            relatedServices={[]}
            reviewSummary={{
              average_rating: 4.8,
              review_count: 1,
              rating_breakdown: { "5": 1, "4": 0, "3": 0, "2": 0, "1": 0 },
              results: [
                {
                  id: "r1",
                  rating: 5,
                  comment: "Neat job in Anna Nagar.",
                  customer_name: "Anitha",
                  area: "Anna Nagar",
                  technician_name: "Suresh K",
                  created_at: "2030-01-01T10:00:00Z",
                },
              ],
            }}
          />
          <BookingCartDrawer />
        </BookingCartProvider>
      </LocationProvider>
    );
    expect(screen.getByRole("heading", { name: "What’s included" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Not included" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "How we do it" })).toBeTruthy();
    expect(screen.getByText("Most booked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Add · ₹649/i }));
    expect(await screen.findByText("When should our pro visit?")).toBeTruthy();
  });

  it("filters deterministic problem suggestions", () => {
    render(<ProblemSearch />);
    fireEvent.change(screen.getByPlaceholderText("Try ‘AC not cooling’"), { target: { value: "water" } });
    expect(screen.getByText("Water leakage")).toBeTruthy();
    expect(screen.queryByText("AC not cooling")).toBeNull();
  });

  it("opens and closes mobile navigation with an accessible control", () => {
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
  });

  it("completes slot-first 3-step booking flow and navigates on confirm", async () => {
    render(<BookingShell services={[service]} />);
    expect(await screen.findByText("When should our pro visit?")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /10:00/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to address" }));
    expect(await screen.findByText("Where should we visit?")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /12 North Street/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to review" }));
    expect(await screen.findByText("Review & confirm")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/bookings/b1?confirmed=1"));
  });

  it("opens header location selector, resolves a suggestion, and checks serviceability", async () => {
    render(
      <LocationProvider>
        <Header />
      </LocationProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Select service location" }));
    const searchInput = await screen.findByPlaceholderText(/Search area, street, landmark/);
    fireEvent.change(searchInput, { target: { value: "Anna" } });
    fireEvent.click(await screen.findByText("Anna Nagar"));
    expect(await screen.findByText(/Serviceable in Anna Nagar/)).toBeTruthy();
  });

  it("allows editing a saved booking address in step 2", async () => {
    render(<BookingShell services={[service]} />);
    fireEvent.click(await screen.findByRole("button", { name: /10:00/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to address" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Home address" }));
    fireEvent.click(screen.getByRole("button", { name: "Save updated address" }));
    expect(await screen.findByText(/4B, 2nd Avenue/)).toBeTruthy();
  });

  it("launches Razorpay checkout inline when confirming an advance-payment booking in SlotFirstCheckout", async () => {
    vi.mocked(bookingApi.quote).mockResolvedValueOnce({
      id: "q-adv",
      hold_id: "h1",
      expires_at: "2030-01-01T09:00:00Z",
      lines: [{ code: "BASE_PRICE", amount_paise: 64900 }],
      total_paise: 64900,
      advance_paise: 19900,
      remaining_balance_paise: 45000,
      currency: "INR",
      pricing_policy_id: "p1",
      pricing_version: 1,
      payment_policy: "ADVANCE",
    });
    vi.mocked(bookingApi.confirm).mockResolvedValueOnce({
      id: "b-adv",
      reference: "NP-ADV-001",
      status: "AWAITING_PAYMENT",
      payment_status: "PENDING",
      version: 1,
      package_id: "p1",
      address_id: "a1",
      can_cancel: true,
      can_reschedule: true,
      service: "AC Service & Repair",
      package: "Inspection",
      address: { label: "Home", line_1: "12 North Street", locality: "Mylapore", city: "Chennai", postal_code: "600004" },
      slot: { start_at: "2030-01-01T04:30:00Z", end_at: "2030-01-01T05:30:00Z" },
      price: {
        lines: [{ code: "BASE_PRICE", amount_paise: 64900 }],
        total_paise: 64900,
        advance_paise: 19900,
        remaining_balance_paise: 45000,
        currency: "INR",
      },
      events: [],
    });

    (window as unknown as { Razorpay?: unknown }).Razorpay = class MockRazorpay {
      options: { handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void };
      constructor(opts: { handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void }) {
        this.options = opts;
      }
      open() {
        this.options.handler({
          razorpay_order_id: "order_adv_1",
          razorpay_payment_id: "pay_adv_1",
          razorpay_signature: "sig_adv_1",
        });
      }
    };

    render(
      <LocationProvider>
        <BookingCartProvider>
          <SlotFirstCheckout services={[service]} compactSheet />
        </BookingCartProvider>
      </LocationProvider>
    );
    fireEvent.click(await screen.findByRole("button", { name: /10:00/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to address" }));
    fireEvent.click(await screen.findByRole("button", { name: /12 North Street/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to review" }));
    expect(await screen.findByText(/₹199 · ₹450 at visit/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirm & pay ₹199/i }));

    expect(await screen.findByText("You’re booked!")).toBeTruthy();
    expect(bookingApi.paymentOrder).toHaveBeenCalledWith("b-adv", "order-b-adv");
    expect(bookingApi.verifyPayment).toHaveBeenCalledWith("b-adv", "order_adv_1", "pay_adv_1", "sig_adv_1");
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Service } from "@nammapros/types";
import { Header } from "@/components/header";
import { LocationProvider } from "@/components/location-provider";
import { ProblemSearch } from "@/components/problem-search";
import { ServiceCard } from "@/components/service-card";
import { BookingShell } from "@/features/booking/booking-shell";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/booking-api", () => ({
  BookingApiError: class BookingApiError extends Error { status = 409; code = "CONFLICT"; },
  bookingApi: {
    me: vi.fn().mockResolvedValue({ id: 1, phone_e164: "+919876543210" }),
    addresses: vi.fn().mockResolvedValue({ addresses: [{ id: "a1", label: "Home", contact_name: "Priya", contact_phone: "+919876543210", house_flat: "12", street: "North Street", line_1: "12 North Street", locality: "Mylapore", city: "Chennai", state: "Tamil Nadu", postal_code: "600004", landmark: "", is_default: true }] }),
    updateAddress: vi.fn().mockResolvedValue({ id: "a1", label: "Home", contact_name: "Priya", contact_phone: "+919876543210", house_flat: "4B", street: "2nd Avenue", line_1: "4B, 2nd Avenue", locality: "Anna Nagar", city: "Chennai", state: "Tamil Nadu", postal_code: "600040", landmark: "", is_default: true }),
    locationAutocomplete: vi.fn().mockResolvedValue({
      suggestions: [{ id: "place_anna", description: "Anna Nagar, Chennai, Tamil Nadu, India", main_text: "Anna Nagar", secondary_text: "Chennai, Tamil Nadu, India" }],
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
    slots: vi.fn().mockResolvedValue({ slots: [{ id: "s1", start_at: "2030-01-01T10:00:00Z", end_at: "2030-01-01T11:00:00Z", remaining: 1, version: 1 }] }),
    hold: vi.fn().mockResolvedValue({ id: "h1", expires_at: "2030-01-01T09:00:00Z" }),
    quote: vi.fn().mockResolvedValue({ id: "q1", hold_id: "h1", expires_at: "2030-01-01T09:00:00Z", lines: [{ code: "INSPECTION", amount_paise: 49000 }], total_paise: 49000, payment_policy: "PAY_AT_VISIT" }),
    confirm: vi.fn().mockResolvedValue({ id: "b1", status: "CONFIRMED_UNPAID" }),
  },
}));

vi.mock("@/lib/catalog", () => ({ getCatalog: async () => ({ data: { categories: [], services: [service], demo: true }, error: null }) }));

const service: Service = { id: "1", slug: "ac-service-repair", name: "AC Service & Repair", summary: "Cooling help", category: "air-conditioning", starting_price_paise: null, is_active: true, packages: [{ id: "p1", name: "Inspection", pricing_model: "INSPECTION_BASED", duration_minutes: 60, inclusions: ["Diagnosis"], exclusions: ["Parts"] }] };

describe("customer experience", () => {
  it("renders the homepage with the live catalog contract", async () => {
    const { default: Home } = await import("@/app/page");
    render(await Home());
    expect(screen.getByRole("heading", { name: /Home problems/ })).toBeTruthy();
    expect(screen.getByText("AC Service & Repair")).toBeTruthy();
  });
  it("renders a service card with an honest price state and booking action", () => {
    render(<ServiceCard service={service}/>);
    expect(screen.getByText("AC Service & Repair")).toBeTruthy();
    expect(screen.getByText("Price shared before confirmation")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start booking AC Service & Repair" }).getAttribute("href")).toContain("/book?service=");
  });
  it("filters deterministic problem suggestions", () => {
    render(<ProblemSearch/>);
    fireEvent.change(screen.getByPlaceholderText("Try ‘AC not cooling’"), { target: { value: "water" } });
    expect(screen.getByText("Water leakage")).toBeTruthy();
    expect(screen.queryByText("AC not cooling")).toBeNull();
  });
  it("opens and closes mobile navigation with an accessible control", () => {
    render(<Header/>);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
  });
  it("connects the three steps and navigates only after the API confirms", async () => {
    render(<BookingShell services={[service]}/>);
    fireEvent.click(screen.getByRole("button", { name: /AC Service & Repair Cooling help/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Inspection/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Where and when?")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Home · 12 North Street/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check availability" }));
    fireEvent.click(await screen.findByRole("button", { name: /1 left/ }));
    expect(await screen.findByText("Review and confirm")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm booking" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
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
  it("allows editing a saved booking address with Google Maps picker", async () => {
    render(<BookingShell services={[service]} />);
    fireEvent.click(screen.getByRole("button", { name: /AC Service & Repair Cooling help/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Inspection/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit Home address" }));
    fireEvent.click(screen.getByRole("button", { name: "Update address" }));
    expect(await screen.findByText(/Address updated/)).toBeTruthy();
  });
});

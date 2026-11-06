import { describe, expect, it, vi } from "vitest";

describe("booking API session security", () => {
  it("refreshes the CSRF token after OTP login before authenticated writes", async () => {
    vi.resetModules();
    const calls: { url: string; headers?: HeadersInit }[] = [];
    const replies = [
      { csrf_token: "before-login" },
      { id: 1 },
      { csrf_token: "after-login" },
      { id: "address-1" },
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, headers: init?.headers });
      return new Response(JSON.stringify(replies.shift()), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
    const { bookingApi } = await import("@/lib/booking-api");
    await bookingApi.otpVerify("+919876543210", "challenge", "123456");
    await bookingApi.createAddress({ label: "Home", contact_name: "Test", contact_phone: "", house_flat: "1",
      street: "Test Street", locality: "Test", city: "Test", state: "Tamil Nadu", postal_code: "600004",
      landmark: "", is_default: true });
    expect(calls[1].headers).toMatchObject({ "X-CSRFToken": "before-login" });
    expect(calls[3].headers).toMatchObject({ "X-CSRFToken": "after-login" });
    vi.unstubAllGlobals();
  });
});

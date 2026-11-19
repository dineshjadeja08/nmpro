import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete (window as Window & { firebase?: unknown }).firebase;
  document.body.innerHTML = "";
});

describe("customer Firebase phone verification", () => {
  it("does not offer a mock code when production Firebase settings are missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    const { sendPhoneVerificationCode, confirmPhoneVerificationCode } = await import("@/lib/firebase");

    await expect(sendPhoneVerificationCode("+919876543210")).rejects.toThrow("not configured");
    await expect(confirmPhoneVerificationCode("+919876543210", "123456")).rejects.toThrow("not configured");
  });

  it("accepts only the phone number that requested the Firebase code", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "public-test-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "test.firebaseapp.com");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project");
    document.body.innerHTML = '<div id="captcha" />';
    const confirm = vi.fn(async () => ({ user: { getIdToken: async () => "verified-id-token" } }));
    const auth = Object.assign(
      vi.fn(() => ({ signInWithPhoneNumber: async () => ({ confirm }) })),
      { RecaptchaVerifier: class { clear() {} } },
    );
    (window as Window & { firebase?: unknown }).firebase = {
      apps: [], initializeApp: vi.fn(), auth,
    };
    const { sendPhoneVerificationCode, confirmPhoneVerificationCode } = await import("@/lib/firebase");

    await expect(sendPhoneVerificationCode("+919876543210", "captcha")).resolves.toMatchObject({ devMode: false });
    await expect(confirmPhoneVerificationCode("+919876543211", "123456")).rejects.toThrow("this number");
    await expect(confirmPhoneVerificationCode("+919876543210", "123456")).resolves.toBe("verified-id-token");
    expect(confirm).toHaveBeenCalledWith("123456");
  });
});

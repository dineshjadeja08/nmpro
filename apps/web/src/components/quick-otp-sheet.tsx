"use client";

import { ArrowRight, Loader2, ShieldCheck, Smartphone, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { bookingApi } from "@/lib/booking-api";
import { confirmPhoneVerificationCode, sendPhoneVerificationCode } from "@/lib/firebase";

type OtpCredential = Credential & { code?: string };

export function QuickOtpSheet({
  open,
  onClose,
  onAuthenticated,
}: {
  open: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
}) {
  const [phoneDigits, setPhoneDigits] = useState("");
  const [challengeSent, setChallengeSent] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !challengeSent) return;
    if (typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({
        otp: { transport: ["sms"] },
        signal: ac.signal,
      } as CredentialRequestOptions)
      .then((credential) => {
        const otpCred = credential as OtpCredential | null;
        if (otpCred?.code) {
          setOtp(otpCred.code.slice(0, 6));
        }
      })
      .catch(() => {
        // User typed manually or timed out
      });
    return () => ac.abort();
  }, [open, challengeSent]);

  if (!open) return null;

  const formattedPhone = `+91${phoneDigits.replace(/\D/g, "").slice(-10)}`;
  const validPhone = /^\+91[6-9]\d{9}$/.test(formattedPhone);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!validPhone) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await sendPhoneVerificationCode(formattedPhone, "quick-otp-recaptcha");
      setDevMode(res.devMode);
      setChallengeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const idToken = await confirmPhoneVerificationCode(formattedPhone, otp.trim());
      await bookingApi.firebaseAuth(idToken);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQuickDevLogin() {
    setBusy(true);
    setError("");
    try {
      await bookingApi.firebaseAuth("dev-token:+919876543210");
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-otp-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-lg bg-[#FBF8F5] p-6 shadow-2xl sm:rounded-lg animate-[slideUpSheet_.24s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#800020]">
              <Smartphone size={14} strokeWidth={1.5} /> Quick verification
            </span>
            <h3 id="quick-otp-title" className="mt-1 font-serif text-xl font-bold text-[#1C1917]">
              {challengeSent ? "Enter the 6-digit code" : "Verify your mobile to hold this slot"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close OTP dialog"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E8E1DB] bg-white text-[#57534E]"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-[#57534E]">
          {challengeSent
            ? `We sent a code to ${formattedPhone}. If your browser receives SMS codes automatically, it fills in by itself.`
            : "No long forms. Just verify your mobile number to confirm your visit address."}
        </p>

        {error && (
          <div role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
            {error}
          </div>
        )}

        <div id="quick-otp-recaptcha" />

        {!challengeSent ? (
          <form onSubmit={handleSendOtp} className="mt-4 space-y-4">
            <div className="flex min-h-[48px] items-center overflow-hidden rounded-lg border border-[#D6CEC6] bg-white px-4 focus-within:border-[#800020]">
              <span className="pr-3 text-sm font-bold text-[#57534E] border-r border-[#E8E1DB]">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={phoneDigits}
                onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="98765 43210"
                className="w-full bg-transparent pl-3 text-base font-medium text-[#1C1917] outline-none"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={busy || !validPhone}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md bg-[#800020] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#5e0017] disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              <span>{busy ? "Sending code..." : "Send OTP"}</span>
              {!busy && <ArrowRight size={16} strokeWidth={1.5} />}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="mt-4 space-y-4">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit OTP"
              className="min-h-[52px] w-full rounded-lg border border-[#D6CEC6] bg-white px-4 text-center text-xl font-bold tracking-[0.35em] text-[#1C1917] outline-none focus:border-[#800020]"
              autoFocus
            />
            {devMode && (
              <p className="rounded-md bg-[#f5ebe8] px-3 py-2 text-center text-xs font-semibold text-[#800020]">
                Development test OTP: <strong>123456</strong>
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setChallengeSent(false);
                  setOtp("");
                }}
                className="min-h-[48px] rounded-md border border-[#D6CEC6] bg-white px-4 text-xs font-bold text-[#57534E]"
              >
                Change number
              </button>
              <button
                type="submit"
                disabled={busy || otp.length !== 6}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-md bg-[#800020] px-6 text-sm font-bold text-white shadow-sm transition hover:bg-[#5e0017] disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : null}
                <span>Verify & continue</span>
              </button>
            </div>
          </form>
        )}

        {process.env.NODE_ENV !== "production" && (
          <div className="mt-4 border-t border-[#E8E1DB] pt-3 text-center">
            <button
              type="button"
              disabled={busy}
              onClick={handleQuickDevLogin}
              className="text-xs font-bold text-[#800020] underline hover:text-[#5e0017]"
            >
              Quick test sign-in (+919876543210)
            </button>
          </div>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-[#57534E]">
          <ShieldCheck size={14} strokeWidth={1.5} className="text-[#800020]" />
          <span>Your number is only used for slot updates and arrival OTP.</span>
        </p>
      </div>
    </div>
  );
}

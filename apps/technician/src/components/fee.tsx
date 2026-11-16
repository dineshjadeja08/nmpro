"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api, type JoiningFee } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { Icon, Loading, money, Notice, OPS_PHONE, useAction } from "./ui";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance }
}

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not open the payment window. Check your internet and try again."));
    document.body.appendChild(script);
  });
}

/** Pay the one-time joining fee. Shown after "Request to join" and whenever the fee is still unpaid. */
export function FeePage({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useI18n();
  const [fee, setFee] = useState<JoiningFee | null>(null);
  const { busy, message, run, setMessage } = useAction();
  const reload = useCallback(() => { api.joiningFee().then(setFee).catch((e) => setMessage({ text: e.message, error: true })); }, [setMessage]);
  useEffect(reload, [reload]);

  const pay = () => run(async () => {
    const order = await api.feeOrder();
    await loadCheckout();
    await new Promise<void>((resolve, reject) => {
      const checkout = new window.Razorpay!({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: "NammaPros",
        description: t("joiningFee"),
        prefill: { name: order.name, contact: order.phone },
        theme: { color: "#800020" },
        handler: async (r: RazorpayResponse) => {
          try {
            setFee(await api.feeVerify(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature));
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        modal: { ondismiss: () => resolve() },
      });
      checkout.on("payment.failed", (r) => reject(new Error(r.error?.description || "Payment failed. Please try again.")));
      checkout.open();
    });
  });

  if (!fee) return <div className="auth"><Notice message={message} /><Loading /></div>;
  return (
    <div className="auth">
      <div className="card stack">
        <h1>{t("joiningFee")}</h1>
        {fee.settled ? (
          <>
            <p className="message" role="status"><Icon name="check" /> {fee.status === "WAIVED" ? t("feeWaived") : t("feePaid")}</p>
            <p>{t("feePaidHint")}</p>
          </>
        ) : (
          <>
            <p className="muted">{t("feeHint")}</p>
            <p className="big-number">{money(fee.amount_paise)}</p>
            {fee.online_available ? (
              <button className="btn block huge" disabled={busy} onClick={pay}>{busy ? t("loading") : `${t("payOnline")} ${money(fee.amount_paise)}`}</button>
            ) : <p className="message warn">{t("feeOffline")}</p>}
          </>
        )}
        <Notice message={message} />
        {OPS_PHONE && <a className="btn ghost block" href={`tel:${OPS_PHONE}`}><Icon name="phone" /> {t("helpBtn")}</a>}
        <button className="btn ghost block" onClick={onSignOut}>{t("signOut")}</button>
      </div>
    </div>
  );
}

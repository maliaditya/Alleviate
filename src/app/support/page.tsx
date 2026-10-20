"use client";

import { useEffect, useState } from "react";
import AppSidebar from "../AppSidebar";
import { CalendarDays, Heart, HeartHandshake, LoaderCircle, Rocket, Sparkles } from "lucide-react";

type TierId = "supporter" | "backer" | "champion" | "custom";
type Release = { id: string; name: string; launchDate: string; features?: string[] };
type ApiResult<T> = T & { error?: string };
type CheckoutData = { keyId: string; orderId: string; amount: number; currency: string; name?: string; description?: string; prefill?: { name?: string; email?: string; contact?: string } };
type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCheckout = { open: () => void };
type RazorpayOptions = Record<string, unknown> & { handler: (result: RazorpayResult) => void; modal?: { ondismiss?: () => void } };
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout } }

const tiers: Array<{ id: TierId; title: string; amount: number; note: string }> = [
  { id: "supporter", title: "Supporter", amount: 199, note: "A quick thank-you boost" },
  { id: "backer", title: "Backer", amount: 499, note: "A little more room to build" },
  { id: "champion", title: "Champion", amount: 1499, note: "Help us ship faster" },
];
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  const data = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok) throw new Error(data.error || `Support service returned ${response.status}.`);
  return data;
};

function loadRazorpay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-alleviate-razorpay="true"]');
    if (existing) { existing.addEventListener("load", () => resolve(true), { once: true }); existing.addEventListener("error", () => resolve(false), { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.alleviateRazorpay = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function SupportPage() {
  const [selected, setSelected] = useState<TierId>("backer");
  const [customAmount, setCustomAmount] = useState("99");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const amount = selected === "custom" ? Number(customAmount) : tiers.find((tier) => tier.id === selected)?.amount || 499;

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("alleviate_current_user") || "null");
      setUsername(String(user?.username || "")); setEmail(String(user?.email || ""));
    } catch { /* Use the public support flow when there is no local profile. */ }
    void api<{ count?: number }>("/api/support-count").then((data) => setCount(Number(data.count || 0))).catch(() => setCount(null));
    void api<{ releases?: Release[] }>("/api/support-releases").then((data) => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      setReleases((data.releases || []).filter((item) => Number.isFinite(Date.parse(item.launchDate)) && new Date(item.launchDate) >= today).sort((a, b) => Date.parse(a.launchDate) - Date.parse(b.launchDate)));
    }).catch(() => undefined);
    try {
      if (!sessionStorage.getItem("alleviate_support_page_view_sent")) {
        sessionStorage.setItem("alleviate_support_page_view_sent", "1");
        void api("/api/metrics/support-event", { method: "POST", body: JSON.stringify({ event: "support_page_view" }) }).catch(() => undefined);
      }
    } catch { /* Metrics are optional. */ }
  }, []);

  const checkout = async () => {
    if (!Number.isFinite(amount) || amount < 99) { setError("Choose an amount of at least ₹99."); return; }
    setBusy(true); setError("");
    void api("/api/metrics/support-event", { method: "POST", body: JSON.stringify({ event: "support_cta_click", channel: "razorpay", amountInr: amount }) }).catch(() => undefined);
    try {
      const start = await api<{ sessionId: string; checkoutData: CheckoutData }>("/api/support-payment/start", { method: "POST", body: JSON.stringify({ amountInr: amount, username, email }) });
      if (!start.sessionId || !start.checkoutData?.keyId || !start.checkoutData?.orderId) throw new Error("The payment service returned incomplete checkout details.");
      if (!(await loadRazorpay()) || !window.Razorpay) throw new Error("Could not load Razorpay Checkout.");
      await new Promise<void>((resolve, reject) => {
        const checkoutUi = new window.Razorpay!({
          key: start.checkoutData.keyId, amount: start.checkoutData.amount, currency: start.checkoutData.currency,
          name: "Alleviate", description: start.checkoutData.description || `Support Alleviate (${money.format(amount)})`, order_id: start.checkoutData.orderId,
          prefill: start.checkoutData.prefill,
          modal: { ondismiss: () => reject(new Error("Checkout was cancelled.")) },
          handler: async (payment) => {
            try {
              const confirmed = await api<{ success?: boolean; message?: string }>("/api/support-payment/confirm", { method: "POST", body: JSON.stringify({ sessionId: start.sessionId, providerSessionId: payment.razorpay_payment_id, providerOrderId: payment.razorpay_order_id, providerSignature: payment.razorpay_signature, amountInr: amount }) });
              if (!confirmed.success) throw new Error("Payment verification failed.");
              const supporter = await api<{ count?: number }>("/api/support-count");
              setCount(Number(supporter.count || 0));
              void api("/api/metrics/support-event", { method: "POST", body: JSON.stringify({ event: "donation_intent", channel: "razorpay", amountInr: amount }) }).catch(() => undefined);
              setNotice(confirmed.message || `Thank you for supporting Alleviate with ${money.format(amount)}.`);
              resolve();
            } catch (cause) { reject(cause); }
          },
        });
        checkoutUi.open();
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the payment checkout.");
    } finally { setBusy(false); }
  };

  return <div className="app-shell support-shell"><AppSidebar active="support"/><main className="support-page">
    <section className="support-panel">
      <div className="support-brand-mark"><HeartHandshake size={22}/></div>
      <span className="support-eyebrow">A LITTLE SUPPORT GOES A LONG WAY</span>
      <h1>Help Alleviate keep growing</h1>
      <p className="support-intro">Alleviate is built to make everyday life feel more manageable. If it has helped you, you can support its continued development here.</p>
      <div className="support-tier-grid">{tiers.map((tier) => <button key={tier.id} type="button" className={`support-tier ${selected === tier.id ? "is-selected" : ""}`} onClick={() => setSelected(tier.id)}><span>{tier.title}</span><strong>{money.format(tier.amount)}</strong><small>{tier.note}</small></button>)}</div>
      <div className={`support-custom-row ${selected === "custom" ? "is-selected" : ""}`}><button type="button" onClick={() => setSelected("custom")}><strong>Custom amount</strong><small>Minimum {money.format(99)}</small></button><label><span>₹</span><input type="number" min="99" step="1" value={customAmount} onFocus={() => setSelected("custom")} onChange={(event) => { setSelected("custom"); setCustomAmount(event.target.value); }}/></label></div>
      <button className="support-continue" type="button" disabled={busy || amount < 99} onClick={() => void checkout()}>{busy ? <><LoaderCircle size={17} className="support-spinner"/> Connecting securely…</> : <><Heart size={17}/> Support with {money.format(Number.isFinite(amount) ? amount : 0)}</>}</button>
      {error && <p className="support-error" role="alert">{error}</p>}
      {notice && <p className="support-success" role="status">{notice}</p>}
      <p className="support-secure-note"><Sparkles size={13}/> Secure checkout powered by Razorpay</p>
      <footer className="support-footer">{count === null ? "Thank you for considering supporting us." : count > 0 ? <>You’ll join <strong>{count}</strong> other Alleviate supporters. Thank you!</> : "Thank you for helping make Alleviate better."}</footer>
      {releases.length > 0 && <section className="support-releases"><h2><Rocket size={16}/> Coming up</h2>{releases.map((release) => <article key={release.id}><div><strong>{release.name}</strong><span><CalendarDays size={13}/>{new Date(release.launchDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>{release.features?.length ? <ul>{release.features.map((feature, index) => <li key={`${release.id}-${index}`}>{feature}</li>)}</ul> : null}</article>)}</section>}
    </section>
  </main></div>;
}

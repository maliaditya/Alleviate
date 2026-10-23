"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Download, LoaderCircle, ShieldCheck } from 'lucide-react';

type PlanId = 'yearly' | 'lifetime';
type CheckoutData = { keyId: string; orderId: string; amount: number; currency: string; name: string; description: string; prefill?: Record<string, string> };
type RazorpayResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayCheckout = { open: () => void };
type RazorpayOptions = Record<string, unknown> & { handler: (result: RazorpayResult) => void; modal?: { ondismiss?: () => void } };
declare global { interface Window { Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout } }

const plans: Array<{ id: PlanId; title: string; price: string; detail: string; features: string[] }> = [
  { id: 'yearly', title: 'Yearly', price: '₹943', detail: '₹799 + 18% GST • 365 days of desktop access', features: ['Alleviate for Windows', 'Yearly product updates', 'Local-first workflows'] },
  { id: 'lifetime', title: 'Lifetime', price: '₹3,499', detail: 'One-time payment • taxes included', features: ['Lifetime desktop access', 'Product updates', 'Local-first workflows'] },
];
const downloadUrl = process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL || 'https://github.com/maliaditya/Alleviate/releases/latest/download/Alleviate-Setup-0.1.1.exe';

function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-alleviate-razorpay="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.alleviateRazorpay = 'true';
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function DesktopPlansPage() {
  const [username, setUsername] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('yearly');
  const [access, setAccess] = useState<{ active: boolean; planId: PlanId | null; expiresAt: string | null } | null>(null);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const requestedPlan = new URLSearchParams(window.location.search).get('plan');
    if (requestedPlan === 'yearly' || requestedPlan === 'lifetime') setSelectedPlan(requestedPlan);
    try {
      const user = JSON.parse(localStorage.getItem('alleviate_current_user') || 'null');
      const name = String(user?.username || '').trim();
      setUsername(name);
      if (name) void fetch('/api/desktop-access', { credentials: 'include', cache: 'no-store' }).then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setAccess({ active: Boolean(data.active), planId: data.planId || null, expiresAt: data.expiresAt || null });
      }).catch(() => undefined);
    } catch { setUsername(''); }
  }, []);

  const signInHref = (planId: PlanId) => `/login?mode=register&next=${encodeURIComponent(`/desktop?plan=${planId}`)}`;
  const purchase = async (planId: PlanId) => {
    setSelectedPlan(planId);
    if (!username) { window.location.assign(signInHref(planId)); return; }
    setBusyPlan(planId); setError(''); setMessage('');
    try {
      const response = await fetch('/api/desktop-purchase/start', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId }),
      });
      const start = await response.json().catch(() => ({})) as { error?: string; checkoutData?: CheckoutData };
      if (!response.ok || !start.checkoutData?.orderId || !start.checkoutData.keyId) throw new Error(start.error || 'Could not start checkout.');
      if (!(await loadRazorpay()) || !window.Razorpay) throw new Error('Could not load Razorpay Checkout. Please try again.');

      await new Promise<void>((resolve, reject) => {
        const checkout = new window.Razorpay!({
          key: start.checkoutData!.keyId,
          order_id: start.checkoutData!.orderId,
          amount: start.checkoutData!.amount,
          currency: start.checkoutData!.currency,
          name: start.checkoutData!.name,
          description: start.checkoutData!.description,
          prefill: start.checkoutData!.prefill,
          modal: { ondismiss: () => reject(new Error('Checkout was cancelled.')) },
          handler: async (payment) => {
            try {
              const confirmResponse = await fetch('/api/desktop-purchase/confirm', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: payment.razorpay_order_id, paymentId: payment.razorpay_payment_id, signature: payment.razorpay_signature }),
              });
              const confirmed = await confirmResponse.json().catch(() => ({})) as { success?: boolean; error?: string; expiresAt?: string | null };
              if (!confirmResponse.ok || !confirmed.success) throw new Error(confirmed.error || 'Payment confirmation failed.');
              setAccess({ active: true, planId, expiresAt: confirmed.expiresAt || null });
              setMessage(planId === 'lifetime' ? 'Lifetime desktop access is now active.' : 'Yearly desktop access is now active.');
              resolve();
            } catch (cause) { reject(cause); }
          },
        });
        checkout.open();
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not complete checkout.'); }
    finally { setBusyPlan(null); }
  };

  return <main className="desktop-plans-page">
    <Link className="desktop-plans-back" href="/"><ArrowLeft size={15}/> Back to Alleviate</Link>
    <section className="desktop-plans-content">
      <span className="desktop-plans-eyebrow"><ShieldCheck size={14}/> ALLEVIATE DESKTOP</span>
      <h1>Choose your Windows plan</h1>
      <p className="desktop-plans-intro">Purchase securely with Razorpay. Your desktop access is connected to your Alleviate account.</p>
      {username ? <p className="desktop-plans-account">Signed in as <strong>{username}</strong></p> : <p className="desktop-plans-account">Sign in or create an account before purchasing a plan.</p>}
      {access?.active && <p className="desktop-plans-status" role="status">Desktop access is active{access.planId === 'lifetime' ? ' for life' : access.expiresAt ? ` until ${new Date(access.expiresAt).toLocaleDateString()}` : ''}.</p>}
      <div className="desktop-plans-grid">{plans.map((plan) => {
        const lifetimeActive = access?.active && access.planId === 'lifetime';
        return <article className={`desktop-plan-card ${plan.id === selectedPlan ? 'is-featured' : ''}`} key={plan.id}>
          <span className="desktop-plan-kicker">WINDOWS DESKTOP</span>
          <h2>{plan.title}</h2>
          <p className="desktop-plan-price">{plan.price}</p>
          <p className="desktop-plan-detail">{plan.detail}</p>
          <ul>{plan.features.map((feature) => <li key={feature}><Check size={15}/>{feature}</li>)}</ul>
          {username ? <button type="button" disabled={Boolean(busyPlan) || Boolean(lifetimeActive)} onClick={() => void purchase(plan.id)}>{busyPlan === plan.id ? <><LoaderCircle size={15} className="desktop-plan-spinner"/> Opening checkout…</> : lifetimeActive ? 'Lifetime access active' : access?.active ? 'Renew / upgrade' : 'Purchase plan'}</button> : <Link href={signInHref(plan.id)}>Sign in to purchase</Link>}
        </article>;
      })}</div>
      {error && <p className="desktop-plans-error" role="alert">{error}</p>}
      {message && <p className="desktop-plans-success" role="status">{message}</p>}
      {access?.active ? <a className="desktop-plans-download" href={downloadUrl}><Download size={16}/> Download the Windows installer</a> : <p className="desktop-plans-fineprint">Choose a desktop plan and complete checkout to unlock the Windows installer download.</p>}
      <p className="desktop-plans-fineprint">Yearly access lasts 365 days. Sign in to the Windows app with the same Alleviate account.</p>
    </section>
  </main>;
}

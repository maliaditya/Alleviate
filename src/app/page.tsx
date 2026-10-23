"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckSquare, Download, Grid2X2, Network, Sparkles } from "lucide-react";
import ResourceMindMapPreview from "./ResourceMindMapPreview";
import AppSidebar from "./AppSidebar";
import HomeParticleNetwork from "./HomeParticleNetwork";
import AccountNav from "./AccountNav";

type SessionUser = { username?: string };
function readUser(): SessionUser | null {
  try {
    const user = JSON.parse(localStorage.getItem("alleviate_current_user") || "null");
    return user && typeof user.username === "string" ? user : null;
  } catch { return null; }
}

function LandingPage() {
  const [isPlanChooserOpen, setIsPlanChooserOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"free" | "yearly" | "lifetime">("yearly");

  useEffect(() => {
    if (!isPlanChooserOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPlanChooserOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isPlanChooserOpen]);

  const continueHref = selectedPlan === "free"
    ? "/login?mode=register"
    : `/desktop?plan=${selectedPlan}`;
  const continueLabel = selectedPlan === "free" ? "Start Free on Web" : "Sign In To Continue";

  return <main className="landing-page">
    <div className="landing-particles" aria-hidden="true"><HomeParticleNetwork /></div>
    <header className="landing-header">
      <Link className="home-brand" href="/" aria-label="Alleviate home"><span className="brand-mark"><Sparkles size={16} /></span><span>Alleviate</span></Link>
      <nav className="landing-nav" aria-label="Account"><Link href="/login">Log in</Link><Link className="landing-nav-cta" href="/login?mode=register">Get started <ArrowRight size={15}/></Link></nav>
    </header>
    <section className="landing-hero">
      <span className="landing-eyebrow"><Sparkles size={13}/> A calmer space for everything on your mind</span>
      <h1>Make room for<br/><span>what matters.</span></h1>
      <p>Alleviate helps you get tasks out of your head, choose what needs attention, and keep plans and routines in view.</p>
      <div className="landing-actions"><Link className="landing-primary" href="/login?mode=register">Create your free account <ArrowRight size={16}/></Link><button className="landing-download" type="button" onClick={() => setIsPlanChooserOpen(true)}><Download size={16}/> Download for Windows</button><Link className="landing-secondary" href="/login">I already have an account</Link></div>
      <section className="landing-plans" aria-labelledby="landing-plans-title">
        <div className="landing-plans-heading"><span>PLANS</span><h2 id="landing-plans-title">Start free. Add desktop when you need it.</h2><p>Choose the way you want to use Alleviate.</p></div>
        <div className="landing-plan-grid">
          <article className="landing-plan"><span className="landing-plan-label">WEB</span><h3>Free</h3><p className="landing-plan-price">₹0 <span>forever</span></p><p>Use Alleviate in your browser and get started with your workflow.</p><Link href="/login?mode=register">Create free account <ArrowRight size={14}/></Link></article>
          <article className="landing-plan"><span className="landing-plan-label">DESKTOP</span><h3>Yearly</h3><p className="landing-plan-price">₹799 <span>/ year + GST</span></p><p>₹943 payable today. Windows desktop access and yearly product updates.</p><Link href="/desktop?plan=yearly">Choose yearly <ArrowRight size={14}/></Link></article>
          <article className="landing-plan"><span className="landing-plan-label">DESKTOP</span><h3>Lifetime</h3><p className="landing-plan-price">₹3,499 <span>one time</span></p><p>One-time payment for lifetime Windows desktop access.</p><Link href="/desktop?plan=lifetime">Choose lifetime <ArrowRight size={14}/></Link></article>
        </div>
        <p className="landing-plan-note">Secure checkout powered by Razorpay. Sign in or create an account to purchase.</p>
      </section>
      <div className="landing-features" aria-label="Problems Alleviate helps with">
        <article><CheckSquare size={19}/><strong>Too much to remember?</strong><span>Capture tasks and find them in Today, Next, Inbox, and List.</span></article>
        <article><Grid2X2 size={19}/><strong>Not sure what matters first?</strong><span>Sort tasks by urgency and importance in the Eisenhower Matrix.</span></article>
        <article><CalendarDays size={19}/><strong>Plans easy to lose track of?</strong><span>Schedule one-off and repeating tasks on your calendar.</span></article>
        <article><Network size={19}/><strong>Goals feel hard to untangle?</strong><span>Connect life areas, outcomes, and actions with mind maps and feedback loops.</span></article>
      </div>
    </section>
    <footer className="landing-footer">A little more clarity, one day at a time.</footer>
    {isPlanChooserOpen && <div className="windows-plan-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsPlanChooserOpen(false); }}>
      <section className="windows-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="windows-plan-title" aria-describedby="windows-plan-description">
        <header className="windows-plan-header">
          <div><h2 id="windows-plan-title">Choose a plan</h2><p id="windows-plan-description">Compare plans first, then continue to your Alleviate account.</p></div>
          <button className="windows-plan-close" type="button" aria-label="Close plan chooser" onClick={() => setIsPlanChooserOpen(false)}>×</button>
        </header>
        <div className="windows-plan-grid" role="radiogroup" aria-label="Alleviate plans">
          <button type="button" role="radio" aria-checked={selectedPlan === "free"} className={`windows-plan-card ${selectedPlan === "free" ? "is-selected" : ""}`} onClick={() => setSelectedPlan("free")}>
            <span className="windows-plan-name">Web - Free</span><strong className="windows-plan-price">₹0</strong><span className="windows-plan-period">INR / NO VALIDITY</span><span className="windows-plan-detail">Use Alleviate in your browser at no cost.</span><span className="windows-plan-feature is-off">Windows desktop app access</span><span className="windows-plan-feature is-off">Offline access</span><span className="windows-plan-feature">Web account and planning tools</span><span className="windows-plan-feature is-off">Automatic local data backup</span><span className="windows-plan-feature">Connect GitHub for cloud data storage</span>
          </button>
          <button type="button" role="radio" aria-checked={selectedPlan === "yearly"} className={`windows-plan-card ${selectedPlan === "yearly" ? "is-selected" : ""}`} onClick={() => setSelectedPlan("yearly")}>
            <span className="windows-plan-recommended">Recommended</span><span className="windows-plan-name">Yearly</span><strong className="windows-plan-price">₹799</strong><span className="windows-plan-period">INR / YEARLY · GST EXCLUSIVE</span><span className="windows-plan-detail">₹943 payable today, including 18% GST. Windows access for 365 days.</span><span className="windows-plan-feature">Windows desktop app access</span><span className="windows-plan-feature">Offline access</span><span className="windows-plan-feature">Yearly product updates</span><span className="windows-plan-feature">Automatic local data backup</span><span className="windows-plan-feature">Connect GitHub for cloud data storage</span><span className="windows-plan-feature">Uses your Alleviate account</span>
          </button>
          <button type="button" role="radio" aria-checked={selectedPlan === "lifetime"} className={`windows-plan-card ${selectedPlan === "lifetime" ? "is-selected" : ""}`} onClick={() => setSelectedPlan("lifetime")}>
            <span className="windows-plan-name">Lifetime</span><strong className="windows-plan-price">₹3,499</strong><span className="windows-plan-period">INR / LIFETIME · GST INCLUDED</span><span className="windows-plan-detail">One-time purchase for lifetime Windows desktop access.</span><span className="windows-plan-feature">Windows desktop app access</span><span className="windows-plan-feature">Offline access</span><span className="windows-plan-feature">Product updates</span><span className="windows-plan-feature">Automatic local data backup</span><span className="windows-plan-feature">Connect GitHub for cloud data storage</span><span className="windows-plan-feature">Uses your Alleviate account</span>
          </button>
        </div>
        <footer className="windows-plan-footer"><button type="button" className="windows-plan-cancel" onClick={() => setIsPlanChooserOpen(false)}>Cancel</button><Link className="windows-plan-continue" href={continueHref} onClick={() => setIsPlanChooserOpen(false)}>{continueLabel} <ArrowRight size={15}/></Link></footer>
      </section>
    </div>}
  </main>;
}

function WorkspaceHome() {
  return <main className="home-page">
    <AppSidebar active="home" />
    <div className="home-main">
      <header className="home-topbar">
        <Link className="home-brand" href="/" aria-label="Alleviate home"><span className="brand-mark"><Sparkles size={16} /></span><span>Alleviate</span></Link>
        <AccountNav />
      </header>
      <section className="home-content" aria-label="Home dashboard">
        <div className="home-particle-field" aria-hidden="true"><HomeParticleNetwork /></div>
        <header className="home-overview">
          <div className="home-overview-copy"><span className="home-overview-kicker">YOUR WORKSPACE</span><h1>Your life, at a glance</h1><p>A live overview built from your Resources mind map.</p></div>
          <Link href="/mind-map?open=resources" className="home-open-map">Open mind map <ArrowRight size={16} /></Link>
        </header>
        <ResourceMindMapPreview />
      </section>
    </div>
  </main>;
}

export default function HomePage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const syncUser = () => setUser(readUser());
    syncUser(); setReady(true);
    window.addEventListener("storage", syncUser);
    window.addEventListener("alleviate:auth-change", syncUser);
    return () => { window.removeEventListener("storage", syncUser); window.removeEventListener("alleviate:auth-change", syncUser); };
  }, []);
  if (!ready) return <LandingPage />;
  return user ? <WorkspaceHome /> : <LandingPage />;
}


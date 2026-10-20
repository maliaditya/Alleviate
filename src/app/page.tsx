"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckSquare, Grid2X2, Network, Sparkles } from "lucide-react";
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
      <div className="landing-actions"><Link className="landing-primary" href="/login?mode=register">Create your free account <ArrowRight size={16}/></Link><Link className="landing-secondary" href="/login">I already have an account</Link></div>
      <div className="landing-features" aria-label="Problems Alleviate helps with">
        <article><CheckSquare size={19}/><strong>Too much to remember?</strong><span>Capture tasks and find them in Today, Next, Inbox, and List.</span></article>
        <article><Grid2X2 size={19}/><strong>Not sure what matters first?</strong><span>Sort tasks by urgency and importance in the Eisenhower Matrix.</span></article>
        <article><CalendarDays size={19}/><strong>Plans easy to lose track of?</strong><span>Schedule one-off and repeating tasks on your calendar.</span></article>
        <article><Network size={19}/><strong>Goals feel hard to untangle?</strong><span>Connect life areas, outcomes, and actions with mind maps and feedback loops.</span></article>
      </div>
    </section>
    <footer className="landing-footer">A little more clarity, one day at a time.</footer>
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


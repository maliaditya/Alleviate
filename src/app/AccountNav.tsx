"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOutAuth } from '@/lib/desktopAuth';
import { switchWorkspaceAccount } from '@/lib/workspaceIsolation';

type User = { username?: string };
export default function AccountNav() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => {
      try { const raw = localStorage.getItem('alleviate_current_user'); setUser(raw ? JSON.parse(raw) : null); } catch { setUser(null); }
    };
    refresh();
    window.addEventListener('alleviate:auth-change', refresh);
    return () => window.removeEventListener('alleviate:auth-change', refresh);
  }, []);
  async function signOut() {
    setError('');
    try {
      await switchWorkspaceAccount(null);
      await signOutAuth(user?.username);
      localStorage.removeItem('alleviate_current_user'); setUser(null); window.dispatchEvent(new Event('alleviate:auth-change'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not safely save this workspace before signing out.');
    }
  }
  if (user) return <div className="home-auth-links">{error && <span role="alert">{error}</span>}<span className="account-name">{user.username}</span><button onClick={signOut}>Log out</button></div>;
  return <nav className="home-auth-links" aria-label="Account"><Link href="/login">Log in</Link><Link href="/login?mode=register">Register</Link></nav>;
}


"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOutAuth } from '@/lib/desktopAuth';

type User = { username?: string };
export default function AccountNav() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    try { const raw = localStorage.getItem('alleviate_current_user'); if (raw) setUser(JSON.parse(raw)); } catch { /* Ignore invalid local profile. */ }
  }, []);
  async function signOut() {
    await signOutAuth(user?.username);
    localStorage.removeItem('alleviate_current_user'); setUser(null); window.dispatchEvent(new Event('alleviate:auth-change'));
  }
  if (user) return <div className="home-auth-links"><span className="account-name">{user.username}</span><button onClick={signOut}>Log out</button></div>;
  return <nav className="home-auth-links" aria-label="Account"><Link href="/login">Log in</Link><Link href="/login?mode=register">Register</Link></nav>;
}


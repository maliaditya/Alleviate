"use client";

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { requestAuthJson, storeDesktopAuthTokens } from '@/lib/desktopAuth';
import { switchWorkspaceAccount } from '@/lib/workspaceIsolation';

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (params.get('mode') === 'register') setMode('register'); }, [params]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (mode === 'register' && password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { ok, data } = await requestAuthJson(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, mode === 'login' ? { username, password } : { username, email, password });
      if (!ok) throw new Error(data?.error || 'Unable to sign in.');
      const signedInUsername = data?.user?.username || username.trim().toLowerCase();
      await switchWorkspaceAccount(signedInUsername);
      await storeDesktopAuthTokens(signedInUsername, data || {});
      localStorage.setItem('alleviate_current_user', JSON.stringify(data?.user || { username: username.trim().toLowerCase(), email }));
      window.dispatchEvent(new Event('alleviate:auth-change'));
      setNotice(mode === 'register' ? 'Account created. You’re signed in.' : 'Welcome back.');
      const requestedNext = params.get('next') || '/';
      const safeNext = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';
      router.replace(safeNext);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to reach authentication service.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page">
    <Link href="/" className="auth-back"><ArrowLeft size={16}/> Back to Alleviate</Link>
    <section className="auth-card">
      <div className="auth-mark"><Sparkles size={20}/></div>
      <p className="auth-eyebrow">YOUR PERSONAL WORKSPACE</p>
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="auth-subtitle">{mode === 'login' ? 'Sign in to continue to your workspace.' : 'Register to get started with Alleviate.'}</p>
      <div className="auth-tabs" role="tablist">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Log in</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Register</button>
      </div>
      <form onSubmit={submit} className="auth-form">
        <label>Username or email<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your username or email" required /></label>
        {mode === 'register' && <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>}
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /></label>
        {mode === 'register' && <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter your password" required /></label>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Log in' : 'Create account')}</button>
      </form>
      <p className="auth-footnote">Your account is stored securely.</p>
    </section>
  </main>;
}

export default function LoginPage() { return <Suspense fallback={<main className="auth-page"/>}><LoginContent/></Suspense>; }


'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function login() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? 'Sign-in failed'); return; }
      window.location.assign('/admin');
    } catch { setError('Network error. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><Link className="brand" href="/">TECHNOVA<span> HUB</span></Link><section className="panel auth-card"><div className="eyebrow">PRIVATE ADMIN ACCESS</div><h1>Welcome back.</h1><p className="muted">Sign in with the configured administrator account.</p><label className="field-label" htmlFor="admin-user">Username</label><input id="admin-user" className="input" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} /><label className="field-label" htmlFor="admin-pass">Password</label><input id="admin-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void login();}}/><button className="btn full" disabled={busy||!username||!password} onClick={()=>void login()}>{busy?'Signing in…':'Sign in securely'}</button>{error&&<p className="error-state" role="alert">{error}</p>}</section></main>;
}

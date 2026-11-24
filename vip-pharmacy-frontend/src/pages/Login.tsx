import { useEffect, useState } from 'react';
import { api } from '../api';
import { Field, run } from '../ui';

export default function Login({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [brand, setBrand] = useState('Pharmacy POS');
  const [f, setF] = useState<any>({ name: '', email: '', password: '', storeName: 'Mashallah Medical Store' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/auth/status').then((s) => setNeedsSetup(s.needsSetup)).catch(() => setNeedsSetup(false));
    api('/store/info').then((i) => i.storeName && setBrand(i.storeName)).catch(() => {});
  }, []);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => needsSetup ? api('/auth/setup', { method: 'POST', body: f }) : api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } }));
    setBusy(false);
    if (r) onLogin(r.token, r.user);
  };

  if (needsSetup === null) return <div className="login"><div className="login-brand"><div className="skeleton" style={{ height: 60, width: 260 }} /></div><div className="login-form" /></div>;
  return (
    <div className="login">
      <div className="login-brand">
        <div className="login-logo">✚</div>
        <h1>{brand}</h1>
        <p>Point of sale, inventory and online orders — everything your pharmacy needs, in one place.</p>
        <ul className="login-pts"><li>Fast billing with barcode support</li><li>Batch and expiry tracking (FEFO)</li><li>Supplier accounts and reports</li></ul>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <h2 style={{ fontSize: '1.5rem' }}>{needsSetup ? 'Set up your store' : 'Welcome back'}</h2>
          <p className="muted">{needsSetup ? 'Create the owner account. Use a strong password (minimum 8 characters) and do not share it.' : 'Sign in to continue.'}</p>
          {needsSetup && <Field label="Store name"><input value={f.storeName} onChange={set('storeName')} required /></Field>}
          {needsSetup && <Field label="Your name"><input value={f.name} onChange={set('name')} required /></Field>}
          <Field label="Email"><input type="email" value={f.email} onChange={set('email')} required autoComplete="username" /></Field>
          <Field label="Password"><input type="password" value={f.password} onChange={set('password')} required minLength={needsSetup ? 8 : 1} autoComplete={needsSetup ? 'new-password' : 'current-password'} /></Field>
          <button className="btn" disabled={busy} style={{ width: '100%', padding: '.7rem' }}>{busy ? 'Please wait…' : needsSetup ? 'Create owner account' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api';
import { Field, run } from '../ui';

export default function Login({ onLogin }: { onLogin: (token: string, user: any) => void }) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [f, setF] = useState<any>({ name: '', email: '', password: '', storeName: 'Mashallah Medical Store' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/auth/status').then((s) => setNeedsSetup(s.needsSetup)).catch(() => setNeedsSetup(false)); }, []);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => needsSetup ? api('/auth/setup', { method: 'POST', body: f }) : api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password } }));
    setBusy(false);
    if (r) onLogin(r.token, r.user);
  };

  if (needsSetup === null) return <p className="muted" style={{ padding: 20 }}>Loading…</p>;
  return (
    <div className="auth">
      <div className="card">
        <h1>{needsSetup ? 'Pehli dafa setup' : 'Staff Login'}</h1>
        {needsSetup && <p className="muted">Create the owner account. Use a strong password (minimum 8 characters) and do not share it.</p>}
        <form onSubmit={submit}>
          {needsSetup && <Field label="Store name"><input value={f.storeName} onChange={set('storeName')} required /></Field>}
          {needsSetup && <Field label="Your name"><input value={f.name} onChange={set('name')} required /></Field>}
          <Field label="Email"><input type="email" value={f.email} onChange={set('email')} required autoComplete="username" /></Field>
          <Field label="Password"><input type="password" value={f.password} onChange={set('password')} required minLength={needsSetup ? 8 : 1} autoComplete={needsSetup ? 'new-password' : 'current-password'} /></Field>
          <button className="btn" disabled={busy} style={{ width: '100%' }}>{needsSetup ? 'Create owner account' : 'Login'}</button>
        </form>
      </div>
    </div>
  );
}

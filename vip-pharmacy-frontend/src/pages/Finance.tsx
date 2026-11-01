import { useState } from 'react';
import { api, qs } from '../api';
import { can, useAuth } from '../auth';
import { confirmBox, Field, fmt, run, State, Tabs, useLoad, dt, today } from '../ui';

export default function Finance() {
  const { user } = useAuth();
  const [tab, setTab] = useState('cash');
  const money = can(user, ['OWNER', 'MANAGER', 'ACCOUNTANT']);
  return (
    <>
      <h1>Cash & Expenses</h1>
      <Tabs value={tab} onChange={setTab} tabs={money ? [['cash', 'Cash register'], ['expenses', 'Expenses'], ['history', 'Sessions']] : [['cash', 'Cash register']]} />
      {tab === 'cash' && <Cash />}
      {tab === 'expenses' && money && <Expenses />}
      {tab === 'history' && money && <History />}
    </>
  );
}

function Cash() {
  const { data: s, loading, error, reload } = useLoad(() => api('/cash/current'));
  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <State loading={loading} error={error} />
      {!loading && !s && (
        <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/cash/open', { method: 'POST', body: { openingCash: Number(opening) } }), 'Cash session khul gaya')) reload(); }}>
          <h2>Cash session shuru karein</h2>
          <Field label="Galle mein shuru ki raqam"><input type="number" min={0} value={opening} onChange={(e) => setOpening(e.target.value)} required /></Field>
          <button className="btn">Session kholein</button>
        </form>
      )}
      {s && (
        <>
          <h2>Session khula hai ({dt(s.openedAt)})</h2>
          <div className="row"><span className="grow">Shuru</span><b>{fmt(s.openingCash)}</b></div>
          <div className="row"><span className="grow">+ Cash sales</span><b>{fmt(s.cashIn)}</b></div>
          <div className="row"><span className="grow">− Cash refunds</span><b>{fmt(s.cashRefund)}</b></div>
          <div className="row"><span className="grow">− Cash expenses</span><b>{fmt(s.cashExp)}</b></div>
          <div className="row"><span className="grow"><b>Expected</b></span><b>{fmt(s.expected)}</b></div>
          <form className="mt" onSubmit={async (e) => { e.preventDefault(); if (!confirmBox('Session band karein? Yeh wapas nahi hoga.')) return; const r = await run(() => api('/cash/close', { method: 'POST', body: { countedCash: Number(counted), note: note || undefined } }), 'Session band ho gaya'); if (r) { toast_variance(r); reload(); } }}>
            <Field label="Gine hui asal raqam"><input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} required /></Field>
            <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button className="btn danger">Session band karein</button>
          </form>
        </>
      )}
    </div>
  );
}
const toast_variance = (r: any) => alert(`Farq (variance): ${fmt(r.variance)}\n(+ zyada, − kam)`);

function Expenses() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, loading, error, reload } = useLoad(() => api('/expenses?' + qs({ from, to, pageSize: 100 })), [from, to]);
  const [f, setF] = useState<any>({ category: '', amount: '', method: 'CASH', description: '', date: today() });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/expenses', { method: 'POST', body: { ...f, amount: Number(f.amount), date: f.date || undefined } }), 'Kharcha record ho gaya')) { setF({ ...f, amount: '', description: '' }); reload(); } }}>
        <div className="grid2">
          <Field label="Category (bijli, kiraya, tankhwah…)"><input value={f.category} onChange={set('category')} required /></Field>
          <Field label="Raqam"><input type="number" min={0.01} step="0.01" value={f.amount} onChange={set('amount')} required /></Field>
          <Field label="Method"><select value={f.method} onChange={set('method')}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></Field>
          <Field label="Tareekh"><input type="date" value={f.date} onChange={set('date')} /></Field>
        </div>
        <Field label="Tafseel"><input value={f.description} onChange={set('description')} /></Field>
        <button className="btn">Kharcha shamil karein</button>
      </form>
      <div className="row mt"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} aria-label="Se" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} aria-label="Tak" />{data && <b>Kul: {fmt(data.sum)}</b>}</div>
      <State loading={loading} error={error} />
      {data && <div className="scroll mt"><table className="tbl"><thead><tr><th>Tareekh</th><th>Category</th><th>Tafseel</th><th>Method</th><th>Kis ne</th><th className="right">Raqam</th></tr></thead><tbody>
        {data.items.map((x: any) => <tr key={x.id}><td>{dt(x.date)}</td><td>{x.category}</td><td>{x.description}</td><td>{x.method}</td><td>{x.user.name}</td><td className="right">{fmt(x.amount)}</td></tr>)}
        {data.items.length === 0 && <tr><td colSpan={6} className="muted">Koi kharcha nahi.</td></tr>}
      </tbody></table></div>}
    </>
  );
}

function History() {
  const { data, loading, error } = useLoad(() => api('/cash/sessions'));
  return (
    <>
      <State loading={loading} error={error} />
      {data && <div className="scroll"><table className="tbl"><thead><tr><th>Khula</th><th>Cashier</th><th className="right">Shuru</th><th className="right">Expected</th><th className="right">Gina</th><th className="right">Farq</th><th>Status</th></tr></thead><tbody>
        {data.map((s: any) => <tr key={s.id}><td>{dt(s.openedAt)}</td><td>{s.user.name}</td><td className="right">{fmt(s.openingCash)}</td><td className="right">{s.expectedCash != null && fmt(s.expectedCash)}</td><td className="right">{s.closingCash != null && fmt(s.closingCash)}</td><td className={'right ' + (Number(s.variance) !== 0 && s.variance != null ? 'err' : '')}>{s.variance != null && fmt(s.variance)}</td><td>{s.status}</td></tr>)}
      </tbody></table></div>}
    </>
  );
}

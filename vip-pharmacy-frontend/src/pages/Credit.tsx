import { useState } from 'react';
import { api, qs } from '../api';
import { can, useAuth } from '../auth';
import { dOnly, Field, fmt, Modal, run, State, useLoad } from '../ui';

export default function Credit() {
  const { user } = useAuth();
  const manage = can(user, ['OWNER', 'MANAGER']);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [stmt, setStmt] = useState<number | null>(null);
  const [modal, setModal] = useState<{ kind: 'pay' | 'limit' | 'adjust'; c: any } | null>(null);
  const { data, loading, error, reload } = useLoad(() => api('/credit/customers?' + qs({ q, all: all ? '1' : '' })), [q, all]);

  if (stmt) return <Statement id={stmt} onBack={() => { setStmt(null); reload(); }} />;
  return (
    <>
      <div className="top"><h1>Customer Credit</h1>
        <div className="row">
          <input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} aria-label="Search customers" />
          <label className="row"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all customers</label>
        </div>
      </div>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="stats"><div className="card stat"><b>{fmt(data.totalReceivable)}</b><span>Total owed by customers</span></div></div>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Customer</th><th>Phone</th><th className="right">Credit limit</th><th className="right">Balance owed</th><th className="right">Available</th><th></th></tr></thead>
            <tbody>
              {data.items.length === 0 && <tr><td colSpan={6} className="muted">No customers with credit yet. Tick “Show all customers”, then press <b>Limit</b> to allow credit.</td></tr>}
              {data.items.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td><td>{c.phone}</td>
                  <td className="right">{c.creditLimit > 0 ? fmt(c.creditLimit) : <span className="muted">No credit</span>}</td>
                  <td className="right"><b className={c.balance > 0 ? 'err' : ''}>{fmt(c.balance)}</b>{c.balance < 0 && <span className="muted"> (advance)</span>}</td>
                  <td className="right">{c.creditLimit > 0 ? fmt(c.available) : '—'}</td>
                  <td className="right">
                    <button className="btn sm sec" onClick={() => setStmt(c.id)}>Statement</button>{' '}
                    <button className="btn sm" onClick={() => setModal({ kind: 'pay', c })}>Receive payment</button>{' '}
                    {manage && <><button className="btn sm sec" onClick={() => setModal({ kind: 'limit', c })}>Limit</button>{' '}<button className="btn sm ghost" onClick={() => setModal({ kind: 'adjust', c })}>Adjust</button></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      {modal?.kind === 'pay' && <PayForm c={modal.c} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'limit' && <LimitForm c={modal.c} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === 'adjust' && <AdjustForm c={modal.c} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
    </>
  );
}

function PayForm({ c, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ amount: c.balance > 0 ? String(c.balance) : '', method: 'CASH', note: '' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async (e: any) => { e.preventDefault(); if (await run(() => api(`/credit/customers/${c.id}/payments`, { method: 'POST', body: { amount: Number(f.amount), method: f.method, note: f.note || undefined } }), 'Payment recorded')) onSaved(); };
  return (
    <Modal title={`Payment from ${c.name}`} onClose={onClose}>
      <p className="muted">Balance owed now: <b>{fmt(c.balance)}</b>. Cash payments are added to your open cash register session.</p>
      <form onSubmit={save}>
        <Field label="Amount received *"><input type="number" min={0.01} step="0.01" value={f.amount} onChange={set('amount')} required /></Field>
        <Field label="Method"><select value={f.method} onChange={set('method')}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></Field>
        <Field label="Note"><input value={f.note} onChange={set('note')} /></Field>
        <button className="btn">Save payment</button>
      </form>
    </Modal>
  );
}

function LimitForm({ c, onClose, onSaved }: any) {
  const [v, setV] = useState(String(c.creditLimit || ''));
  const save = async (e: any) => { e.preventDefault(); if (await run(() => api(`/credit/customers/${c.id}/limit`, { method: 'PATCH', body: { creditLimit: Number(v) || 0 } }), 'Credit limit saved')) onSaved(); };
  return (
    <Modal title={`Credit limit — ${c.name}`} onClose={onClose}>
      <p className="muted">The most this customer may owe at any time. Enter 0 to stop giving credit (existing balance stays).</p>
      <form onSubmit={save}>
        <Field label="Credit limit"><input type="number" min={0} step="0.01" value={v} onChange={(e) => setV(e.target.value)} required /></Field>
        <button className="btn">Save limit</button>
      </form>
    </Modal>
  );
}

function AdjustForm({ c, onClose, onSaved }: any) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const save = async (e: any) => { e.preventDefault(); if (await run(() => api(`/credit/customers/${c.id}/adjustments`, { method: 'POST', body: { amount: Number(amount), reason } }), 'Adjustment recorded')) onSaved(); };
  return (
    <Modal title={`Adjust balance — ${c.name}`} onClose={onClose}>
      <p className="muted">Reduces what the customer owes (return credit note, discount or write-off). A reason is required and the entry is audited. Current balance: <b>{fmt(c.balance)}</b></p>
      <form onSubmit={save}>
        <Field label="Amount to reduce *"><input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label="Reason * (returned goods, discount, write-off…)"><input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} /></Field>
        <button className="btn">Record adjustment</button>
      </form>
    </Modal>
  );
}

function Statement({ id, onBack }: { id: number; onBack: () => void }) {
  const { settings } = useAuth();
  const { data, loading, error } = useLoad(() => api(`/credit/customers/${id}/statement`), [id]);
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <button className="btn sec sm" onClick={onBack}>← Back</button><span className="grow" /><button className="btn sm" onClick={() => window.print()}>Print statement</button>
      </div>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="print-title" style={{ display: 'block' }}>
            <h2 style={{ margin: 0 }}>{settings.storeName}</h2>
            <h3 style={{ margin: '.2rem 0' }}>Customer statement — {data.customer.name}{data.customer.phone ? ` (${data.customer.phone})` : ''}</h3>
            <div className="muted">Printed {new Date().toLocaleString('en-GB')}</div>
          </div>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Note</th><th className="right">Charges</th><th className="right">Payments / credits</th><th className="right">Balance</th></tr></thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={7} className="muted">No transactions yet.</td></tr>}
              {data.rows.map((x: any, i: number) => <tr key={i}><td>{dOnly(x.date)}</td><td>{x.type}</td><td>{x.ref}</td><td>{x.note}</td><td className="right">{x.charge ? fmt(x.charge) : ''}</td><td className="right">{x.credit ? fmt(x.credit) : ''}</td><td className="right">{fmt(x.balance)}</td></tr>)}
            </tbody>
            <tfoot><tr><td colSpan={6} className="right"><b>Balance owed to the store</b></td><td className="right"><b>{fmt(data.balance)}</b></td></tr></tfoot>
          </table></div>
        </>
      )}
    </>
  );
}

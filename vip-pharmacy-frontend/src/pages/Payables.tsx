import { useState } from 'react';
import { api } from '../api';
import { can, useAuth } from '../auth';
import { dOnly, Field, fmt, Modal, run, State, Tabs, today, useLoad } from '../ui';

export default function Payables() {
  const [tab, setTab] = useState('balances');
  const [stmt, setStmt] = useState<number | null>(null);
  if (stmt) return <Statement id={stmt} onBack={() => setStmt(null)} />;
  return (
    <>
      <h1>Supplier Accounts</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['balances', 'Balances & payments'], ['returns', 'Purchase returns']]} />
      {tab === 'balances' ? <Balances onStatement={setStmt} /> : <Returns />}
    </>
  );
}

function Balances({ onStatement }: { onStatement: (id: number) => void }) {
  const { user } = useAuth();
  const canPay = can(user, ['OWNER', 'MANAGER', 'ACCOUNTANT']);
  const { data, loading, error, reload } = useLoad(() => api('/payables'));
  const [pay, setPay] = useState<any>(null);
  return (
    <>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="stats"><div className="card stat"><b>{fmt(data.totalPayable)}</b><span>Total owed to suppliers</span></div></div>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Supplier</th><th className="right">Purchased</th><th className="right">Returned</th><th className="right">Paid</th><th className="right">Balance owed</th><th></th></tr></thead>
            <tbody>
              {data.items.length === 0 && <tr><td colSpan={6} className="muted">No suppliers yet. Add suppliers under Suppliers & Purchases.</td></tr>}
              {data.items.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.name} {s.paymentTerms && <span className="muted">· {s.paymentTerms}</span>}</td>
                  <td className="right">{fmt(s.purchased)}</td><td className="right">{fmt(s.returned)}</td><td className="right">{fmt(s.paid)}</td>
                  <td className="right"><b className={s.balance > 0 ? 'err' : ''}>{fmt(s.balance)}</b>{s.balance < 0 && <span className="muted"> (advance)</span>}</td>
                  <td className="right">
                    <button className="btn sm sec" onClick={() => onStatement(s.id)}>Statement</button>{' '}
                    {canPay && <button className="btn sm" onClick={() => setPay(s)}>Record payment</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="muted mt">Balance = received purchases − purchase returns − payments. Cash paid to suppliers is not deducted from the cash register automatically; if you pay from the drawer, also record it under Cash &amp; Expenses.</p>
        </>
      )}
      {pay && <PayForm supplier={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); reload(); }} />}
    </>
  );
}

function PayForm({ supplier, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ amount: supplier.balance > 0 ? String(supplier.balance) : '', method: 'BANK', reference: '', note: '', paidAt: today() });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async (e: any) => {
    e.preventDefault();
    if (await run(() => api(`/payables/${supplier.id}/payments`, { method: 'POST', body: { amount: Number(f.amount), method: f.method, reference: f.reference || undefined, note: f.note || undefined, paidAt: f.paidAt || undefined } }), 'Payment recorded')) onSaved();
  };
  return (
    <Modal title={`Payment to ${supplier.name}`} onClose={onClose}>
      <p className="muted">Current balance owed: <b>{fmt(supplier.balance)}</b></p>
      <form onSubmit={save}>
        <Field label="Amount *"><input type="number" min={0.01} step="0.01" value={f.amount} onChange={set('amount')} required /></Field>
        <div className="grid2">
          <Field label="Method"><select value={f.method} onChange={set('method')}><option value="BANK">Bank transfer</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></Field>
          <Field label="Date"><input type="date" value={f.paidAt} onChange={set('paidAt')} /></Field>
        </div>
        <Field label="Reference (cheque / transfer no.)"><input value={f.reference} onChange={set('reference')} /></Field>
        <Field label="Note"><input value={f.note} onChange={set('note')} /></Field>
        <button className="btn">Save payment</button>
      </form>
    </Modal>
  );
}

function Statement({ id, onBack }: { id: number; onBack: () => void }) {
  const { settings } = useAuth();
  const { data, loading, error } = useLoad(() => api(`/payables/${id}/statement`), [id]);
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
            <h3 style={{ margin: '.2rem 0' }}>Supplier statement — {data.supplier.name}</h3>
            <div className="muted">Printed {new Date().toLocaleString('en-GB')}</div>
          </div>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Note</th><th className="right">Charges</th><th className="right">Credits</th><th className="right">Balance</th></tr></thead>
            <tbody>
              {data.rows.length === 0 && <tr><td colSpan={7} className="muted">No transactions yet.</td></tr>}
              {data.rows.map((x: any, i: number) => (
                <tr key={i}><td>{dOnly(x.date)}</td><td>{x.type}</td><td>{x.ref}</td><td>{x.note}</td><td className="right">{x.charge ? fmt(x.charge) : ''}</td><td className="right">{x.credit ? fmt(x.credit) : ''}</td><td className="right">{fmt(x.balance)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={6} className="right"><b>Balance owed to supplier</b></td><td className="right"><b>{fmt(data.balance)}</b></td></tr></tfoot>
          </table></div>
        </>
      )}
    </>
  );
}

function Returns() {
  const { user } = useAuth();
  const canReturn = can(user, ['OWNER', 'MANAGER', 'INVENTORY']);
  const { data, loading, error, reload } = useLoad(() => api('/purchase-returns'));
  const [open, setOpen] = useState(false);
  return (
    <>
      {canReturn && <button className="btn" onClick={() => setOpen(true)}>+ New purchase return</button>}
      <State loading={loading} error={error} />
      {data && (
        <div className="scroll mt"><table className="tbl">
          <thead><tr><th>#</th><th>Date</th><th>Supplier</th><th>Items</th><th>Reason</th><th className="right">Credit value</th></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={6} className="muted">No purchase returns yet.</td></tr>}
            {data.map((p: any) => (
              <tr key={p.id}><td>PR-{p.id}</td><td>{dOnly(p.createdAt)}</td><td>{p.supplier.name}</td>
                <td>{p.items.map((i: any) => `${i.batch.medicine.name} ${i.batch.medicine.strength || ''} (batch ${i.batch.batchNo}) × ${i.qty}`).join('; ')}</td>
                <td>{p.reason}</td><td className="right">{fmt(p.total)}</td></tr>
            ))}
          </tbody>
        </table></div>
      )}
      {open && <NewReturn onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
    </>
  );
}

function NewReturn({ onClose, onSaved }: any) {
  const sup = useLoad(() => api('/suppliers'));
  const batches = useLoad(() => api('/inventory/batches?filter=instock&pageSize=500'));
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<any[]>([{ batchId: '', qty: '' }]);
  const list: any[] = batches.data?.items || [];
  const upd = (i: number, k: string, v: string) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const est = items.reduce((s, it) => { const b = list.find((x) => String(x.id) === it.batchId); return s + (b ? Number(b.costPrice) * (Number(it.qty) || 0) : 0); }, 0);
  const save = async (e: any) => {
    e.preventDefault();
    const body = { supplierId: Number(supplierId), reason, items: items.map((i) => ({ batchId: Number(i.batchId), qty: Number(i.qty) })) };
    if (await run(() => api('/purchase-returns', { method: 'POST', body }), 'Purchase return recorded and stock updated')) onSaved();
  };
  return (
    <Modal title="New purchase return" onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="grid2">
          <Field label="Supplier *"><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required><option value="">—</option>{(sup.data || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Reason * (expired, damaged, wrong item…)"><input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} /></Field>
        </div>
        {items.map((it, i) => {
          const b = list.find((x) => String(x.id) === it.batchId);
          return (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <Field label="Batch"><select value={it.batchId} onChange={(e) => upd(i, 'batchId', e.target.value)} required><option value="">—</option>{list.map((x) => <option key={x.id} value={x.id}>{x.medicine.name} {x.medicine.strength} · batch {x.batchNo} · exp {dOnly(x.expiryDate)} · qty {x.availableQty}</option>)}</select></Field>
              <Field label={`Quantity to return${b ? ` (max ${b.availableQty})` : ''}`}><input type="number" min={1} max={b?.availableQty} value={it.qty} onChange={(e) => upd(i, 'qty', e.target.value)} required /></Field>
              {items.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>}
            </div>
          );
        })}
        <button type="button" className="btn sec sm" onClick={() => setItems([...items, { batchId: '', qty: '' }])}>+ Add item</button>
        <p className="mt">Credit value (at batch cost): <b>{fmt(est)}</b></p>
        <p className="muted">Returned stock is removed from inventory immediately and the amount reduces what you owe the supplier.</p>
        <button className="btn">Record return</button>
      </form>
    </Modal>
  );
}

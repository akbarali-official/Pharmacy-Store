import { useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Field, fmt, Modal, run, State, useLoad, dt } from '../ui';
import Receipt from './Receipt';

export default function Sales() {
  const [f, setF] = useState({ from: '', to: '', invoice: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const { data, loading, error, reload } = useLoad(() => api('/sales?' + qs({ ...f, page, pageSize: 25 })), [f.from, f.to, f.invoice, page]);
  return (
    <>
      <div className="top"><h1>Sales & Returns</h1>
        <div className="row">
          <input type="date" value={f.from} onChange={(e) => { setF({ ...f, from: e.target.value }); setPage(1); }} aria-label="Se" style={{ width: 150 }} />
          <input type="date" value={f.to} onChange={(e) => { setF({ ...f, to: e.target.value }); setPage(1); }} aria-label="Tak" style={{ width: 150 }} />
          <input placeholder="Invoice #" value={f.invoice} onChange={(e) => { setF({ ...f, invoice: e.target.value }); setPage(1); }} style={{ width: 150 }} />
        </div>
      </div>
      <State loading={loading} error={error} />
      {data && <div className="scroll"><table className="tbl"><thead><tr><th>Invoice</th><th>Waqt</th><th>Cashier</th><th className="right">Total</th><th>Payment</th><th>Return</th></tr></thead><tbody>
        {data.items.map((s: any) => {
          const refunded = s.returns.reduce((t: number, r: any) => t + Number(r.refundAmount), 0);
          return <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(s.id)}><td><a href="#!" onClick={(e) => e.preventDefault()}>{s.invoiceNo}</a></td><td>{dt(s.createdAt)}</td><td>{s.cashier.name}</td><td className="right">{fmt(s.total)}</td><td>{s.payments.map((p: any) => p.method).join('+')}</td><td>{refunded > 0 && <span className="tag amber">{fmt(refunded)}</span>}</td></tr>;
        })}
        {data.items.length === 0 && <tr><td colSpan={6} className="muted">Koi sale nahi mili.</td></tr>}
      </tbody></table></div>}
      {data && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Pichla</button><span className="muted">Page {page} · kul {data.total}</span><button className="btn sec sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Agla →</button></div>}
      {open && <SaleDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}

function SaleDetail({ id, onClose, onChanged }: any) {
  const { settings } = useAuth();
  const { data: sale, loading, error, reload } = useLoad(() => api('/sales/' + id), [id]);
  const [view, setView] = useState<'detail' | 'receipt'>('detail');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [method, setMethod] = useState('CASH');
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState('');

  const doReturn = async (e: any) => {
    e.preventDefault();
    const items = Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ saleItemId: Number(k), qty: Number(v) }));
    if (!items.length) return run(() => Promise.reject(new Error('Wapas hone wali quantity likhein')));
    if (await run(() => api(`/sales/${id}/return`, { method: 'POST', body: { items, refundMethod: method, restock, reason } }), 'Return/refund record ho gaya')) { setQty({}); setReason(''); reload(); onChanged(); }
  };

  return (
    <Modal title={sale ? sale.invoiceNo : 'Sale'} onClose={onClose} wide>
      <State loading={loading} error={error} />
      {sale && view === 'receipt' && <><Receipt sale={sale} settings={settings} /><button className="btn sec mt" onClick={() => setView('detail')}>← Wapas</button></>}
      {sale && view === 'detail' && (
        <>
          <div className="row"><span className="grow muted">{dt(sale.createdAt)} · {sale.cashier.name}</span><button className="btn sec sm" onClick={() => setView('receipt')}>Receipt / Reprint</button></div>
          <table className="tbl mt"><thead><tr><th>Item</th><th>Batch</th><th className="right">Qty</th><th className="right">Rate</th><th className="right">Total</th><th>Wapas</th></tr></thead><tbody>
            {sale.items.map((i: any) => {
              const back = i.returnItems.reduce((s: number, r: any) => s + r.qty, 0);
              const left = i.qty - back;
              return <tr key={i.id}><td>{i.nameSnap}</td><td>{i.batchNoSnap}</td><td className="right">{i.qty}{back > 0 && <span className="muted"> (−{back})</span>}</td><td className="right">{fmt(i.unitPrice)}</td><td className="right">{fmt(i.lineTotal)}</td>
                <td>{left > 0 ? <input type="number" min={0} max={left} value={qty[i.id] || ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} style={{ width: 70 }} aria-label={'Return ' + i.nameSnap} /> : <span className="muted">—</span>}</td></tr>;
            })}
          </tbody></table>
          <p className="right">Subtotal {fmt(sale.subtotal)} · Discount {fmt(sale.discount)} · <b>Total {fmt(sale.total)}</b></p>
          {sale.returns.length > 0 && <p className="muted">Pehle ke returns: {sale.returns.map((r: any) => fmt(r.refundAmount)).join(', ')}</p>}
          <form onSubmit={doReturn} className="card mt">
            <h3>Return / Refund</h3>
            <div className="grid2">
              <Field label="Refund method"><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK">Bank</option><option value="OTHER">Other</option></select></Field>
              <Field label="Wajah *"><input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} /></Field>
            </div>
            <label className="row"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Maal wapas stock mein shamil karein (sealed/theek hai; expire hua to khud nahi hoga)</label>
            <button className="btn mt">Return record karein</button>
          </form>
        </>
      )}
    </Modal>
  );
}

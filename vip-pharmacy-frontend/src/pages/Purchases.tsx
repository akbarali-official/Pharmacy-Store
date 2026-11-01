import { useState } from 'react';
import { api } from '../api';
import { can, useAuth } from '../auth';
import { confirmBox, Field, fmt, Modal, run, State, Tabs, useLoad, dOnly } from '../ui';

export default function Purchases() {
  const [tab, setTab] = useState('purchases');
  return (
    <>
      <h1>Suppliers & Purchases</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['purchases', 'Purchases'], ['suppliers', 'Suppliers']]} />
      {tab === 'purchases' ? <PurchaseList /> : <Suppliers />}
    </>
  );
}

function Suppliers() {
  const { user } = useAuth();
  const canEdit = can(user, ['OWNER', 'MANAGER', 'INVENTORY']);
  const { data, loading, error, reload } = useLoad(() => api('/suppliers'));
  const [f, setF] = useState<any>(null);
  const save = async (e: any) => {
    e.preventDefault();
    const { id, ...body } = f;
    if (await run(() => api(id ? '/suppliers/' + id : '/suppliers', { method: id ? 'PATCH' : 'POST', body }), 'Save ho gaya')) { setF(null); reload(); }
  };
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      {canEdit && <button className="btn" onClick={() => setF({ name: '', phone: '', email: '', address: '', paymentTerms: '', notes: '' })}>+ Naya supplier</button>}
      <State loading={loading} error={error} />
      {data && <div className="scroll mt"><table className="tbl"><thead><tr><th>Naam</th><th>Phone</th><th>Terms</th><th></th></tr></thead><tbody>
        {data.map((s: any) => <tr key={s.id}><td>{s.name}</td><td>{s.phone}</td><td>{s.paymentTerms}</td><td className="right">{canEdit && <button className="btn sm sec" onClick={() => setF(s)}>Edit</button>}</td></tr>)}
        {data.length === 0 && <tr><td colSpan={4} className="muted">Abhi koi supplier nahi.</td></tr>}
      </tbody></table></div>}
      {f && <Modal title="Supplier" onClose={() => setF(null)}><form onSubmit={save}>
        <Field label="Naam *"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Address"><input value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="Payment terms"><input value={f.paymentTerms || ''} onChange={set('paymentTerms')} /></Field>
        <button className="btn">Save</button></form></Modal>}
    </>
  );
}

function PurchaseList() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useLoad(() => api('/purchases?page=' + page), [page]);
  const act = async (id: number, what: 'receive' | 'cancel') => {
    if (!confirmBox(what === 'receive' ? 'Maal wasool karke stock mein shamil karein?' : 'Purchase cancel karein?')) return;
    if (await run(() => api(`/purchases/${id}/${what}`, { method: 'POST' }), what === 'receive' ? 'Stock mein shamil ho gaya' : 'Cancel ho gayi')) reload();
  };
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>+ Nayi purchase</button>
      <State loading={loading} error={error} />
      {data && <div className="scroll mt"><table className="tbl"><thead><tr><th>#</th><th>Tareekh</th><th>Supplier</th><th>Invoice</th><th>Items</th><th className="right">Total</th><th>Status</th><th></th></tr></thead><tbody>
        {data.items.map((p: any) => (
          <tr key={p.id}><td>{p.id}</td><td>{dOnly(p.purchaseDate)}</td><td>{p.supplier.name}</td><td>{p.invoiceNo}</td>
            <td>{p.items.map((i: any) => `${i.medicine.name} ×${i.qty}`).join(', ')}</td><td className="right">{fmt(p.total)}</td>
            <td><span className={p.status === 'RECEIVED' ? 'tag' : p.status === 'DRAFT' ? 'tag amber' : 'tag red'}>{p.status}</span></td>
            <td className="right">{p.status === 'DRAFT' && <><button className="btn sm" onClick={() => act(p.id, 'receive')}>Receive</button>{' '}<button className="btn sm ghost" onClick={() => act(p.id, 'cancel')}>Cancel</button></>}</td></tr>
        ))}
        {data.items.length === 0 && <tr><td colSpan={8} className="muted">Abhi koi purchase nahi.</td></tr>}
      </tbody></table></div>}
      {data && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Pichla</button><span className="muted">Page {page}</span><button className="btn sec sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Agla →</button></div>}
      {open && <NewPurchase onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />}
    </>
  );
}

function NewPurchase({ onClose, onSaved }: any) {
  const sup = useLoad(() => api('/suppliers'));
  const meds = useLoad(() => api('/medicines?pageSize=500'));
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [discount, setDiscount] = useState('0');
  const [items, setItems] = useState<any[]>([{ medicineId: '', batchNo: '', expiryDate: '', qty: '', costPrice: '' }]);
  const upd = (i: number, k: string, v: string) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const pick = (i: number, id: string) => {
    const m = meds.data?.items.find((x: any) => String(x.id) === id);
    setItems(items.map((x, j) => (j === i ? { ...x, medicineId: id, costPrice: m ? String(m.purchasePrice) : x.costPrice } : x)));
  };
  const total = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.costPrice) || 0), 0) - (Number(discount) || 0);
  const save = async (e: any) => {
    e.preventDefault();
    const body = { supplierId: Number(supplierId), invoiceNo: invoiceNo || undefined, discount: Number(discount) || 0, items: items.map((i) => ({ medicineId: Number(i.medicineId), batchNo: i.batchNo, expiryDate: i.expiryDate, qty: Number(i.qty), costPrice: Number(i.costPrice) })) };
    if (await run(() => api('/purchases', { method: 'POST', body }), 'Purchase draft ban gayi. Maal aane par Receive dabayen.')) onSaved();
  };
  return (
    <Modal title="Nayi purchase" onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="grid2">
          <Field label="Supplier *"><select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required><option value="">—</option>{(sup.data || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Supplier invoice #"><input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
        </div>
        {items.map((it, i) => (
          <div key={i} className="card" style={{ marginBottom: 8 }}>
            <Field label="Dawai"><select value={it.medicineId} onChange={(e) => pick(i, e.target.value)} required><option value="">—</option>{(meds.data?.items || []).map((m: any) => <option key={m.id} value={m.id}>{m.name} {m.strength}</option>)}</select></Field>
            <div className="grid2">
              <Field label="Batch #"><input value={it.batchNo} onChange={(e) => upd(i, 'batchNo', e.target.value)} required /></Field>
              <Field label="Expiry"><input type="date" value={it.expiryDate} onChange={(e) => upd(i, 'expiryDate', e.target.value)} required /></Field>
              <Field label="Qty"><input type="number" min={1} value={it.qty} onChange={(e) => upd(i, 'qty', e.target.value)} required /></Field>
              <Field label="Cost / unit"><input type="number" step="0.01" min={0} value={it.costPrice} onChange={(e) => upd(i, 'costPrice', e.target.value)} required /></Field>
            </div>
            {items.length > 1 && <button type="button" className="btn sm ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>Hatayen</button>}
          </div>
        ))}
        <button type="button" className="btn sec sm" onClick={() => setItems([...items, { medicineId: '', batchNo: '', expiryDate: '', qty: '', costPrice: '' }])}>+ Item</button>
        <div className="row mt"><Field label="Discount"><input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field><b className="grow right">Total {fmt(total)}</b></div>
        <button className="btn">Draft save karein</button>
      </form>
    </Modal>
  );
}

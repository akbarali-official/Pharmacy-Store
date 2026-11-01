import { useState } from 'react';
import { api, qs } from '../api';
import { can, useAuth } from '../auth';
import { Field, fmt, Modal, run, State, useLoad, dOnly } from '../ui';

const EMPTY = { name: '', genericName: '', brand: '', strength: '', form: '', manufacturer: '', barcode: '', packSize: '', unit: 'pcs', purchasePrice: '', sellingPrice: '', reorderLevel: '10', requiresPrescription: false, showOnline: false, storageNotes: '', categoryId: '' };

export default function Medicines() {
  const { user } = useAuth();
  const canEdit = can(user, ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY']);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const [edit, setEdit] = useState<any>(null);
  const [stockFor, setStockFor] = useState<any>(null);
  const { data, loading, error, reload } = useLoad(() => api('/medicines?' + qs({ q, page, pageSize: 25, active: show === 'active' ? 'true' : 'false' })), [q, page, show]);
  const cats = useLoad(() => api('/categories'));

  return (
    <>
      <div className="top"><h1>Medicines</h1>
        <div className="row">
          <input placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: 220 }} aria-label="Search medicines" />
          <select value={show} onChange={(e) => setShow(e.target.value as any)} style={{ width: 130 }}><option value="active">Active</option><option value="archived">Archived</option></select>
          {canEdit && <button className="btn" onClick={() => setEdit({ ...EMPTY })}>+ Nayi dawai</button>}
        </div>
      </div>
      <State loading={loading} error={error} />
      {data && (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Naam</th><th>Generic</th><th>Category</th><th className="right">Cost</th><th className="right">Price</th><th className="right">Stock</th><th></th></tr></thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={7} className="muted">Koi dawai nahi mili.</td></tr>}
            {data.items.map((m: any) => (
              <tr key={m.id}>
                <td>{m.name} {m.strength} <span className="muted">{m.form}</span> {m.requiresPrescription && <span className="tag amber">Rx</span>} {m.showOnline && <span className="tag">online</span>}</td>
                <td>{m.genericName}</td><td>{m.category?.name}</td>
                <td className="right">{fmt(m.purchasePrice)}</td><td className="right">{fmt(m.sellingPrice)}</td>
                <td className="right"><span className={m.stock === 0 ? 'tag red' : m.stock <= m.reorderLevel ? 'tag amber' : 'tag'}>{m.stock}</span></td>
                <td className="right">{canEdit && <>
                  <button className="btn sm sec" onClick={() => setStockFor(m)}>+ Stock</button>{' '}
                  <button className="btn sm sec" onClick={() => setEdit({ ...m, categoryId: m.categoryId ?? '' })}>Edit</button>{' '}
                  <button className="btn sm ghost" onClick={async () => { if (await run(() => api('/medicines/' + m.id, { method: 'PATCH', body: { active: !m.active } }))) reload(); }}>{m.active ? 'Archive' : 'Restore'}</button>
                </>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {data && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Pichla</button><span className="muted">Page {page} · kul {data.total}</span><button className="btn sec sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Agla →</button></div>}
      {edit && <MedForm initial={edit} cats={cats.data || []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); cats.reload(); }} />}
      {stockFor && <StockForm med={stockFor} onClose={() => setStockFor(null)} onSaved={() => { setStockFor(null); reload(); }} />}
    </>
  );
}

function MedForm({ initial, cats, onClose, onSaved }: any) {
  const [f, setF] = useState<any>(initial);
  const [force, setForce] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [dup, setDup] = useState('');
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e: any) => {
    e.preventDefault();
    setDup('');
    let categoryId = f.categoryId ? Number(f.categoryId) : null;
    if (newCat.trim()) { const c = await run(() => api('/categories', { method: 'POST', body: { name: newCat.trim() } })); if (!c) return; categoryId = c.id; }
    const { id, category, stock, createdAt, updatedAt, active, sku, ...rest } = f;
    const body = { ...rest, categoryId, purchasePrice: Number(f.purchasePrice), sellingPrice: Number(f.sellingPrice), reorderLevel: Number(f.reorderLevel), force: force || undefined };
    try {
      await api(id ? '/medicines/' + id : '/medicines', { method: id ? 'PATCH' : 'POST', body });
      onSaved();
    } catch (er: any) { if (/pehle se hai/.test(er.message)) setDup(er.message); else run(() => Promise.reject(er)); }
  };
  return (
    <Modal title={f.id ? 'Dawai edit' : 'Nayi dawai'} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="grid2">
          <Field label="Naam *"><input value={f.name} onChange={set('name')} required /></Field>
          <Field label="Generic naam"><input value={f.genericName || ''} onChange={set('genericName')} /></Field>
          <Field label="Brand"><input value={f.brand || ''} onChange={set('brand')} /></Field>
          <Field label="Strength (500mg)"><input value={f.strength || ''} onChange={set('strength')} /></Field>
          <Field label="Form (Tablet/Syrup)"><input value={f.form || ''} onChange={set('form')} /></Field>
          <Field label="Manufacturer"><input value={f.manufacturer || ''} onChange={set('manufacturer')} /></Field>
          <Field label="Barcode"><input value={f.barcode || ''} onChange={set('barcode')} /></Field>
          <Field label="Pack size"><input value={f.packSize || ''} onChange={set('packSize')} /></Field>
          <Field label="Purchase price *"><input type="number" step="0.01" min={0} value={f.purchasePrice} onChange={set('purchasePrice')} required /></Field>
          <Field label="Selling price *"><input type="number" step="0.01" min={0} value={f.sellingPrice} onChange={set('sellingPrice')} required /></Field>
          <Field label="Reorder level"><input type="number" min={0} value={f.reorderLevel} onChange={set('reorderLevel')} /></Field>
          <Field label="Category"><select value={f.categoryId} onChange={set('categoryId')}><option value="">—</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Ya nayi category likhein"><input value={newCat} onChange={(e) => setNewCat(e.target.value)} /></Field>
          <Field label="Storage notes"><input value={f.storageNotes || ''} onChange={set('storageNotes')} /></Field>
        </div>
        <label className="row"><input type="checkbox" checked={f.requiresPrescription} onChange={set('requiresPrescription')} /> Prescription lazmi (Rx) — online nahi bechi jayegi</label>
        <label className="row"><input type="checkbox" checked={f.showOnline} onChange={set('showOnline')} /> Online store mein dikhayen</label>
        {dup && <p className="err mt">{dup} <label><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> force</label></p>}
        <button className="btn mt">Save</button>
      </form>
    </Modal>
  );
}

function StockForm({ med, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ batchNo: '', expiryDate: '', qty: '', costPrice: String(med.purchasePrice) });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async (e: any) => {
    e.preventDefault();
    if (await run(() => api('/inventory/batches', { method: 'POST', body: { medicineId: med.id, batchNo: f.batchNo, expiryDate: f.expiryDate, qty: Number(f.qty), costPrice: Number(f.costPrice) } }), 'Stock add ho gaya')) onSaved();
  };
  return (
    <Modal title={`Stock add: ${med.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <Field label="Batch number"><input value={f.batchNo} onChange={set('batchNo')} required /></Field>
        <Field label="Expiry date"><input type="date" value={f.expiryDate} onChange={set('expiryDate')} required /></Field>
        <Field label="Quantity"><input type="number" min={1} value={f.qty} onChange={set('qty')} required /></Field>
        <Field label="Cost price (per unit)"><input type="number" step="0.01" min={0} value={f.costPrice} onChange={set('costPrice')} required /></Field>
        <p className="muted">Yeh opening stock / seedha stock-in hai. Supplier se maal ke liye "Purchases" use karein. Expiry {f.expiryDate && dOnly(f.expiryDate)}.</p>
        <button className="btn">Save</button>
      </form>
    </Modal>
  );
}

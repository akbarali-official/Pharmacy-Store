import { useEffect, useMemo, useRef, useState } from 'react';
import { api, download } from '../api';
import { can, useAuth } from '../auth';
import { confirmBox, dOnly, dt, Field, fmt, Modal, run, State, toast, useLoad } from '../ui';

export default function StockCount() {
  const [open, setOpen] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const { data, loading, error, reload } = useLoad(() => api('/stock-counts'));
  if (open) return <Sheet id={open} onBack={() => { setOpen(null); reload(); }} />;
  return (
    <>
      <div className="top"><h1>Stock Count</h1><button className="btn" onClick={() => setStarting(true)}>+ Start new count</button></div>
      <p className="muted">Count the shelves, compare with the system and correct differences with a full audit trail.</p>
      <State loading={loading} error={error} />
      {data && (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>#</th><th>Started</th><th>By</th><th>Note</th><th>Progress</th><th>Status</th><th className="right">Variance (value)</th><th></th></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={8} className="muted">No stock counts yet.</td></tr>}
            {data.map((c: any) => (
              <tr key={c.id}>
                <td>{c.id}</td><td>{dt(c.createdAt)}</td><td>{c.startedBy}</td><td>{c.note}</td>
                <td>{c.countedItems} / {c.totalItems}</td>
                <td><span className={c.status === 'OPEN' ? 'tag amber' : c.status === 'COMPLETED' ? 'tag' : 'tag red'}>{c.status}</span></td>
                <td className="right">{c.status === 'COMPLETED' ? fmt(c.varianceValue) : ''}</td>
                <td className="right"><button className="btn sm sec" onClick={() => setOpen(c.id)}>{c.status === 'OPEN' ? 'Continue' : 'View'}</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {starting && <Start onClose={() => setStarting(false)} onStarted={(id: number) => { setStarting(false); setOpen(id); }} />}
    </>
  );
}

function Start({ onClose, onStarted }: { onClose: () => void; onStarted: (id: number) => void }) {
  const cats = useLoad(() => api('/categories'));
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const go = async (e: any) => {
    e.preventDefault();
    const c = await run(() => api('/stock-counts', { method: 'POST', body: { categoryId: categoryId ? Number(categoryId) : undefined, note: note || undefined } }));
    if (c) onStarted(c.id);
  };
  return (
    <Modal title="Start a stock count" onClose={onClose}>
      <p className="muted">The system takes a snapshot of the current stock. Only one count can be open at a time.</p>
      <form onSubmit={go}>
        <Field label="What to count"><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Whole store</option>{(cats.data || []).map((c: any) => <option key={c.id} value={c.id}>Category: {c.name}</option>)}</select></Field>
        <Field label="Note (optional, e.g. 'Monthly count — shelf A')"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <button className="btn">Start count</button>
      </form>
    </Modal>
  );
}

function Sheet({ id, onBack }: { id: number; onBack: () => void }) {
  const { user, settings } = useAuth();
  const approve = can(user, ['OWNER', 'MANAGER']);
  const { data, loading, error, reload } = useLoad(() => api('/stock-counts/' + id), [id]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'uncounted' | 'diff'>('all');
  const [blind, setBlind] = useState(true);
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const editsRef = useRef(edits);
  editsRef.current = edits;

  const isOpen = data?.count.status === 'OPEN';
  const dirty = Object.keys(edits).length > 0;

  const save = async (quiet = false) => {
    const e = editsRef.current;
    const items = Object.entries(e).map(([k, v]) => ({ id: Number(k), countedQty: v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)) }));
    if (!items.length) return true;
    setSaving(true);
    const ok = await run(() => api(`/stock-counts/${id}/items`, { method: 'PATCH', body: { items } }));
    setSaving(false);
    if (!ok) return false;
    setEdits((cur) => { const n = { ...cur }; items.forEach((i) => { if (String(cur[i.id] ?? '') === (i.countedQty == null ? '' : String(i.countedQty))) delete n[i.id]; }); return n; });
    if (!quiet) toast('Progress saved');
    reload();
    return true;
  };

  useEffect(() => { if (!isOpen) return; const t = setInterval(() => { if (Object.keys(editsRef.current).length) save(true); }, 20000); return () => clearInterval(t); }, [isOpen]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (Object.keys(editsRef.current).length) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.rows.map((r: any) => {
      const e = edits[r.id];
      const counted = e !== undefined ? (e === '' ? null : Number(e)) : r.countedQty;
      return { ...r, counted, variance: counted == null ? null : counted - r.systemQty };
    }).filter((r: any) =>
      (!needle || r.medicine.toLowerCase().includes(needle) || String(r.batchNo).toLowerCase().includes(needle)) &&
      (filter === 'all' || (filter === 'uncounted' ? r.counted == null : r.variance != null && r.variance !== 0)));
  }, [data, edits, q, filter]);

  const complete = async () => {
    if (!(await save(true))) return;
    const fresh = await api('/stock-counts/' + id);
    const s = fresh.summary;
    const msg = `Apply this count?\n\nCounted: ${s.counted} of ${s.total} batches\nUncounted (left unchanged): ${s.uncounted}\nBatches with differences: ${s.withDifferences}\nShortages: ${fmt(s.shortageValue)}   Surpluses: ${fmt(s.surplusValue)}\nNet variance at cost: ${fmt(s.varianceValue)}\n\nStock will be adjusted. This cannot be undone.`;
    if (!confirmBox(msg)) return;
    const r = await run(() => api(`/stock-counts/${id}/complete`, { method: 'POST' }), 'Stock count completed and stock adjusted');
    if (r) { setEdits({}); reload(); }
  };
  const cancel = async () => { if (confirmBox('Cancel this count? Nothing will be changed in stock.') && (await run(() => api(`/stock-counts/${id}/cancel`, { method: 'POST' }), 'Count cancelled'))) onBack(); };

  const showSystem = !isOpen || !blind || review;
  const s = data?.summary;
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <button className="btn sec sm" onClick={async () => { if (dirty && !(await save(true))) return; onBack(); }}>← Back</button>
        <h2 style={{ margin: 0 }}>Stock count #{id}</h2>
        {data && <span className={data.count.status === 'OPEN' ? 'tag amber' : data.count.status === 'COMPLETED' ? 'tag' : 'tag red'}>{data.count.status}</span>}
        <span className="grow" />
        <button className="btn sec sm" onClick={() => run(() => download(`/stock-counts/${id}/export.csv`, `stock-count-${id}.csv`))}>Export CSV</button>
        <button className="btn sm" onClick={() => window.print()}>Print</button>
      </div>
      <State loading={loading} error={error} />
      {data && (
        <>
          <div className="print-title" style={{ display: 'block' }}>
            <h2 style={{ margin: 0 }}>{settings.storeName}</h2>
            <h3 style={{ margin: '.2rem 0' }}>Stock count #{id} {data.count.note ? `— ${data.count.note}` : ''}</h3>
            <div className="muted">Started {dt(data.count.createdAt)} · Printed {new Date().toLocaleString('en-GB')}</div>
          </div>
          {(review || !isOpen) && s && (
            <div className="stats no-print">
              <div className="card stat"><b>{s.counted} / {s.total}</b><span>Batches counted</span></div>
              <div className={'card stat' + (s.withDifferences ? ' warn' : '')}><b>{s.withDifferences}</b><span>With differences</span></div>
              <div className={'card stat' + (s.shortageValue < 0 ? ' bad' : '')}><b>{fmt(s.shortageValue)}</b><span>Shortages (at cost)</span></div>
              <div className="card stat"><b>{fmt(s.surplusValue)}</b><span>Surpluses (at cost)</span></div>
              <div className="card stat"><b>{fmt(s.varianceValue)}</b><span>Net variance</span></div>
            </div>
          )}
          <div className="row no-print" style={{ marginBottom: 10 }}>
            <input placeholder="Search medicine or batch…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} aria-label="Search" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ width: 180 }} aria-label="Filter"><option value="all">All batches</option><option value="uncounted">Not counted yet</option><option value="diff">With differences</option></select>
            {isOpen && <label className="row"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Blind count (hide system quantity)</label>}
            {isOpen && <button className="btn sec sm" onClick={() => setReview(!review)}>{review ? 'Back to counting' : 'Review differences'}</button>}
            <span className="grow" />
            {isOpen && <><button className="btn sec sm" disabled={saving || !dirty} onClick={() => save()}>{saving ? 'Saving…' : dirty ? 'Save progress' : 'Saved ✔'}</button>
              {approve && <button className="btn sm" onClick={complete}>Complete & apply</button>}
              {approve && <button className="btn sm danger" onClick={cancel}>Cancel count</button>}</>}
          </div>
          {isOpen && !approve && <p className="muted no-print">When you finish counting, ask a manager to review and apply the count.</p>}
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th>{showSystem && <th className="right">System qty</th>}<th className="right">Counted</th>{showSystem && <th className="right">Variance</th>}{showSystem && <th className="right">Value (cost)</th>}</tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="muted">Nothing to show.</td></tr>}
              {rows.map((r: any) => (
                <tr key={r.id} style={r.variance ? { background: r.variance < 0 ? '#fdf0ee' : '#eef8f2' } : undefined}>
                  <td>{r.medicine} <span className="muted">{r.form}</span></td><td>{r.batchNo}</td><td>{dOnly(r.expiryDate)}</td>
                  {showSystem && <td className="right">{r.systemQty}</td>}
                  <td className="right">{isOpen
                    ? <input type="number" min={0} value={edits[r.id] ?? (r.countedQty ?? '')} onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} style={{ width: 90, textAlign: 'right' }} aria-label={`Counted ${r.medicine} ${r.batchNo}`} />
                    : (r.countedQty ?? <span className="muted">—</span>)}</td>
                  {showSystem && <td className="right">{r.variance == null ? '' : <b className={r.variance < 0 ? 'err' : ''}>{r.variance > 0 ? '+' : ''}{r.variance}</b>}</td>}
                  {showSystem && <td className="right">{r.variance == null ? '' : fmt(r.variance * r.unitCost)}</td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </>
  );
}

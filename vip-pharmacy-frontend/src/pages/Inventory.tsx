import { useState } from 'react';
import { api, download, qs } from '../api';
import { can, useAuth } from '../auth';
import { Field, Modal, run, State, Tabs, useLoad, dOnly, dt } from '../ui';

export default function Inventory() {
  const { user } = useAuth();
  const canEdit = can(user, ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY']);
  const [tab, setTab] = useState('alerts');
  return (
    <>
      <h1>Inventory</h1>
      <Tabs value={tab} onChange={setTab} tabs={[['alerts', 'Alerts'], ['batches', 'Batches'], ['moves', 'Stock movements'], ['recon', 'Reconcile']]} />
      {tab === 'alerts' && <Alerts />}
      {tab === 'batches' && <Batches canEdit={canEdit} />}
      {tab === 'moves' && <Moves />}
      {tab === 'recon' && <Recon />}
    </>
  );
}

function Alerts() {
  const { data, loading, error } = useLoad(() => api('/inventory/alerts'));
  const med = (m: any) => `${m.name} ${m.strength || ''}`;
  const batchRow = (b: any) => <tr key={b.id}><td>{med(b.medicine)}</td><td>{b.batchNo}</td><td>{dOnly(b.expiryDate)}</td><td className="right">{b.availableQty}</td></tr>;
  return (
    <>
      <State loading={loading} error={error} />
      {data && (
        <div className="grid2">
          <div><h2>Stock khatam ({data.outOfStock.length})</h2><div className="scroll"><table className="tbl"><tbody>{data.outOfStock.map((m: any) => <tr key={m.id}><td>{med(m)}</td></tr>)}{data.outOfStock.length === 0 && <tr><td className="muted">Koi nahi</td></tr>}</tbody></table></div></div>
          <div><h2>Low stock ({data.lowStock.length})</h2><div className="scroll"><table className="tbl"><tbody>{data.lowStock.map((m: any) => <tr key={m.id}><td>{med(m)}</td><td className="right">{m.stock} / {m.reorderLevel}</td></tr>)}{data.lowStock.length === 0 && <tr><td className="muted">Koi nahi</td></tr>}</tbody></table></div></div>
          <div className="mt"><h2>Jald expire ({data.nearExpiry.length})</h2><div className="scroll"><table className="tbl"><tbody>{data.nearExpiry.map(batchRow)}{data.nearExpiry.length === 0 && <tr><td className="muted">Koi nahi</td></tr>}</tbody></table></div></div>
          <div className="mt"><h2 className="err">Expire ho chuki ({data.expired.length})</h2><div className="scroll"><table className="tbl"><tbody>{data.expired.map(batchRow)}{data.expired.length === 0 && <tr><td className="muted">Koi nahi</td></tr>}</tbody></table></div></div>
        </div>
      )}
    </>
  );
}

function Batches({ canEdit }: { canEdit: boolean }) {
  const [filter, setFilter] = useState('instock');
  const [page, setPage] = useState(1);
  const [adj, setAdj] = useState<any>(null);
  const { data, loading, error, reload } = useLoad(() => api('/inventory/batches?' + qs({ filter, page, pageSize: 30 })), [filter, page]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} style={{ width: 200 }}><option value="instock">Stock mojood</option><option value="expiring">Jald expire</option><option value="expired">Expire ho chuki</option><option value="">Sab</option></select>
        <button className="btn sec sm" onClick={() => run(() => download('/reports/stock.csv', 'stock.csv'))}>CSV</button>
      </div>
      <State loading={loading} error={error} />
      {data && <div className="scroll"><table className="tbl"><thead><tr><th>Dawai</th><th>Batch</th><th>Expiry</th><th className="right">Qty</th><th>Status</th><th></th></tr></thead><tbody>
        {data.items.map((b: any) => {
          const exp = b.expiryDate.slice(0, 10) < today;
          return (
            <tr key={b.id}><td>{b.medicine.name} {b.medicine.strength}</td><td>{b.batchNo}</td><td>{dOnly(b.expiryDate)} {exp && <span className="tag red">expired</span>}</td><td className="right">{b.availableQty}</td>
              <td><span className={b.status === 'ACTIVE' ? 'tag' : 'tag amber'}>{b.status}</span></td>
              <td className="right">{canEdit && <><button className="btn sm sec" onClick={() => setAdj(b)}>Adjust</button>{' '}<button className="btn sm ghost" onClick={async () => { if (await run(() => api('/inventory/batches/' + b.id, { method: 'PATCH', body: { status: b.status === 'ACTIVE' ? 'QUARANTINE' : 'ACTIVE' } }))) reload(); }}>{b.status === 'ACTIVE' ? 'Quarantine' : 'Release'}</button></>}</td></tr>
          );
        })}
        {data.items.length === 0 && <tr><td colSpan={6} className="muted">Kuch nahi.</td></tr>}
      </tbody></table></div>}
      {data && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Pichla</button><span className="muted">Page {page} · kul {data.total}</span><button className="btn sec sm" disabled={page * 30 >= data.total} onClick={() => setPage(page + 1)}>Agla →</button></div>}
      {adj && <Adjust batch={adj} onClose={() => setAdj(null)} onSaved={() => { setAdj(null); reload(); }} />}
    </>
  );
}

function Adjust({ batch, onClose, onSaved }: any) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const save = async (e: any) => { e.preventDefault(); if (await run(() => api('/inventory/adjust', { method: 'POST', body: { batchId: batch.id, delta: Number(delta), reason } }), 'Adjust ho gaya')) onSaved(); };
  return (
    <Modal title={`Adjust: ${batch.medicine.name} (${batch.batchNo})`} onClose={onClose}>
      <p className="muted">Maujooda qty: {batch.availableQty}. Kam karne ke liye minus likhein (jaise -5). Wajah lazmi hai aur record hoti hai.</p>
      <form onSubmit={save}>
        <Field label="Tabdeeli (+/-)"><input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required /></Field>
        <Field label="Wajah (damaged / lost / ginti ka farq…)"><input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} /></Field>
        <button className="btn">Save</button>
      </form>
    </Modal>
  );
}

function Moves() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useLoad(() => api('/inventory/movements?' + qs({ page, pageSize: 30 })), [page]);
  return (
    <>
      <State loading={loading} error={error} />
      {data && <div className="scroll"><table className="tbl"><thead><tr><th>Waqt</th><th>Dawai / Batch</th><th>Type</th><th className="right">Qty</th><th>Wajah / Ref</th></tr></thead><tbody>
        {data.items.map((m: any) => <tr key={m.id}><td>{dt(m.createdAt)}</td><td>{m.batch.medicine.name} / {m.batch.batchNo}</td><td>{m.type}</td><td className="right">{m.qty}</td><td>{m.reason || ''} {m.refType ? `${m.refType}#${m.refId}` : ''}</td></tr>)}
      </tbody></table></div>}
      {data && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Pichla</button><span className="muted">Page {page}</span><button className="btn sec sm" disabled={page * 30 >= data.total} onClick={() => setPage(page + 1)}>Agla →</button></div>}
    </>
  );
}

function Recon() {
  const { data, loading, error } = useLoad(() => api('/inventory/reconcile'));
  return (
    <>
      <p className="muted">Har batch ka balance uski movements ke jama se match hona chahiye. Farq ho to kisi ne database mein seedha tabdeeli ki hai ya koi bug hai.</p>
      <State loading={loading} error={error} />
      {data && (data.mismatches.length === 0
        ? <p>✔ {data.checked} batches check hui, sab theek hain.</p>
        : <table className="tbl"><thead><tr><th>Dawai</th><th>Batch</th><th>Balance</th><th>Movements</th></tr></thead><tbody>{data.mismatches.map((m: any) => <tr key={m.batchId}><td>{m.medicine}</td><td>{m.batchNo}</td><td>{m.balance}</td><td>{m.movementsTotal}</td></tr>)}</tbody></table>)}
    </>
  );
}

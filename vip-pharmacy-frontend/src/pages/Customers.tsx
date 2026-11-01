import { useState } from 'react';
import { api, qs } from '../api';
import { Field, Modal, run, State, useLoad } from '../ui';

export default function Customers() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [f, setF] = useState<any>(null);
  const { data, loading, error, reload } = useLoad(() => api('/customers?' + qs({ q, page })), [q, page]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const save = async (e: any) => {
    e.preventDefault();
    const { id, createdAt, ...body } = f;
    if (await run(() => api(id ? '/customers/' + id : '/customers', { method: id ? 'PATCH' : 'POST', body }), 'Save ho gaya')) { setF(null); reload(); }
  };
  return (
    <>
      <div className="top"><h1>Customers</h1><div className="row"><input placeholder="Naam ya phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: 220 }} /><button className="btn" onClick={() => setF({ name: '', phone: '', email: '', address: '', notes: '' })}>+ Naya</button></div></div>
      <p className="muted">Walk-in customer ke liye profile banana zaroori nahi — POS par seedha bill banta hai.</p>
      <State loading={loading} error={error} />
      {data && <div className="scroll"><table className="tbl"><thead><tr><th>Naam</th><th>Phone</th><th>Address</th><th></th></tr></thead><tbody>
        {data.items.map((c: any) => <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.address}</td><td className="right"><button className="btn sm sec" onClick={() => setF(c)}>Edit</button></td></tr>)}
        {data.items.length === 0 && <tr><td colSpan={4} className="muted">Koi customer nahi.</td></tr>}
      </tbody></table></div>}
      {data && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Pichla</button><span className="muted">Page {page}</span><button className="btn sec sm" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)}>Agla →</button></div>}
      {f && <Modal title="Customer" onClose={() => setF(null)}><form onSubmit={save}>
        <Field label="Naam *"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Address"><input value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="Notes"><input value={f.notes || ''} onChange={set('notes')} /></Field>
        <button className="btn">Save</button></form></Modal>}
    </>
  );
}

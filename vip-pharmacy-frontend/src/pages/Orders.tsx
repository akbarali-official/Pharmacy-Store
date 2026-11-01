import { useState } from 'react';
import { api } from '../api';
import { confirmBox, fmt, run, State, useLoad, dt } from '../ui';

const NEXT: Record<string, [string, string][]> = {
  NEW: [['CONFIRMED', 'Confirm (stock nikalta hai)'], ['REJECTED', 'Reject']],
  CONFIRMED: [['DISPATCHED', 'Dispatch'], ['CANCELLED', 'Cancel']],
  DISPATCHED: [['DELIVERED', 'Delivered'], ['CANCELLED', 'Cancel']],
};

export default function Orders() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useLoad(() => api('/orders' + (status ? '?status=' + status : '')), [status]);
  const move = async (o: any, s: string) => {
    if (['REJECTED', 'CANCELLED'].includes(s) && !confirmBox(`Order ${o.orderNo} ${s} karein?`)) return;
    if (await run(() => api(`/orders/${o.id}/status`, { method: 'PATCH', body: { status: s } }), 'Status badal gaya')) reload();
  };
  return (
    <>
      <div className="top"><h1>Online Orders</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 180 }} aria-label="Status filter"><option value="">Sab</option>{['NEW', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED'].map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      <p className="muted">Payment abhi sirf Cash on Delivery hai. Order "Confirm" karne par stock FEFO se nikalta hai (POS ke saath oversell nahi hota). Cancel karne par stock wapas aata hai.</p>
      <State loading={loading} error={error} />
      {data && data.length === 0 && <p className="muted">Koi order nahi.</p>}
      {data && data.map((o: any) => (
        <div key={o.id} className="card" style={{ marginBottom: 10 }}>
          <div className="row"><b className="grow">{o.orderNo}</b><span className={o.status === 'NEW' ? 'tag amber' : ['CANCELLED', 'REJECTED'].includes(o.status) ? 'tag red' : 'tag'}>{o.status}</span></div>
          <div className="muted">{dt(o.createdAt)} · {o.customerName} · {o.phone}</div>
          <div>{o.address}</div>
          {o.note && <div className="muted">Note: {o.note}</div>}
          <ul>{o.items.map((i: any) => <li key={i.id}>{i.nameSnap} × {i.qty} — {fmt(Number(i.unitPrice) * i.qty)}</li>)}</ul>
          <div className="row"><span className="grow muted">Delivery {fmt(o.deliveryFee)}</span><b>Total {fmt(o.total)} (COD)</b></div>
          <div className="row mt">{(NEXT[o.status] || []).map(([s, l]) => <button key={s} className={'btn sm' + (['REJECTED', 'CANCELLED'].includes(s) ? ' danger' : '')} onClick={() => move(o, s)}>{l}</button>)}</div>
        </div>
      ))}
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { fmt, Modal, run, toast } from '../ui';
import Receipt from './Receipt';

export default function POS() {
  const { settings } = useAuth();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [discount, setDiscount] = useState('0');
  const [method, setMethod] = useState('CASH');
  const [received, setReceived] = useState('');
  const [rx, setRx] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => api('/pos/search?q=' + encodeURIComponent(q)).then(setResults).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);

  const add = (m: any) => {
    if (m.stock <= 0) return toast('Stock nahi hai', 'err');
    setCart((c) => {
      const ex = c.find((x) => x.id === m.id);
      if (ex) return c.map((x) => (x.id === m.id ? { ...x, qty: Math.min(x.qty + 1, m.stock) } : x));
      return [...c, { ...m, qty: 1 }];
    });
    setQ(''); setResults([]); input.current?.focus();
  };
  const setQty = (id: number, v: string) => setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: Math.max(1, Math.min(Number(v) || 1, x.stock)) } : x)));

  const subtotal = cart.reduce((s, x) => s + Number(x.sellingPrice) * x.qty, 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const total = Math.round((subtotal - disc) * 100) / 100;
  const paid = received === '' ? total : Number(received);
  const change = Math.max(0, paid - total);
  const needRx = cart.some((x) => x.requiresPrescription);

  const checkout = async () => {
    setBusy(true);
    const sale = await run(() => api('/pos/checkout', { method: 'POST', body: { items: cart.map((x) => ({ medicineId: x.id, qty: x.qty })), discount: disc, payments: [{ method, amount: method === 'CASH' ? paid : total }], prescriptionVerified: needRx ? rx : undefined } }));
    setBusy(false);
    if (sale) { setDone(sale); setCart([]); setDiscount('0'); setReceived(''); setRx(false); }
  };

  return (
    <>
      <h1>POS / Billing</h1>
      <div className="pos">
        <div className="card">
          <input ref={input} autoFocus placeholder="Dawai ka naam, generic, barcode ya SKU…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && results.length >= 1 && add(results[0])} aria-label="Dawai search" />
          <div style={{ marginTop: 8 }}>
            {results.map((m) => (
              <button key={m.id} className="res" disabled={m.stock <= 0} onClick={() => add(m)}>
                <span>{m.name} {m.strength} <span className="muted">{m.form}</span> {m.requiresPrescription && <span className="tag amber">Rx</span>}</span>
                <span>{fmt(m.sellingPrice)} · <span className={m.stock <= 0 ? 'err' : 'muted'}>stock {m.stock}</span></span>
              </button>
            ))}
            {q && results.length === 0 && <p className="muted">Kuch nahi mila.</p>}
          </div>
        </div>
        <div className="card">
          <h2>Bill</h2>
          {cart.length === 0 && <p className="muted">Cart khali hai. Search karke dawai add karein (Enter dabane se pehli result add hoti hai).</p>}
          {cart.map((x) => (
            <div key={x.id} className="row" style={{ marginBottom: 6 }}>
              <span className="grow">{x.name} {x.strength}<br /><span className="muted">{fmt(x.sellingPrice)}</span></span>
              <input type="number" min={1} max={x.stock} value={x.qty} onChange={(e) => setQty(x.id, e.target.value)} style={{ width: 70 }} aria-label={'Quantity ' + x.name} />
              <b style={{ width: 80, textAlign: 'right' }}>{fmt(Number(x.sellingPrice) * x.qty)}</b>
              <button className="btn ghost" onClick={() => setCart(cart.filter((y) => y.id !== x.id))} aria-label="Hatayen">✕</button>
            </div>
          ))}
          {cart.length > 0 && (
            <>
              <hr />
              <div className="grid2">
                <label className="f"><span>Discount ({settings.currency})</span><input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
                <label className="f"><span>Payment</span>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK">Bank transfer</option><option value="OTHER">Other</option></select>
                </label>
              </div>
              {method === 'CASH' && <label className="f"><span>Customer ne diye (khali = exact)</span><input type="number" min={0} value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} /></label>}
              {needRx && <label className="row" style={{ marginBottom: 8 }}><input type="checkbox" checked={rx} onChange={(e) => setRx(e.target.checked)} /> Prescription dekh li gayi hai (pharmacist ne verify ki)</label>}
              <div className="row"><span className="grow muted">Subtotal {fmt(subtotal)}{disc > 0 && ` − ${fmt(disc)}`}</span><span className="total">{fmt(total)}</span></div>
              {method === 'CASH' && <div className="row"><span className="grow">Wapas karna hai</span><b>{fmt(change)}</b></div>}
              <button className="btn mt" style={{ width: '100%' }} disabled={busy || (needRx && !rx) || paid < total} onClick={checkout}>{busy ? 'Ho raha hai…' : 'Bill banayein'}</button>
            </>
          )}
        </div>
      </div>
      {done && <Modal title={'Bill ' + done.invoiceNo} onClose={() => setDone(null)}><Receipt sale={done} settings={settings} /></Modal>}
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { dt, fmt, Modal, run, toast } from '../ui';
import Receipt from './Receipt';

const HELD_KEY = 'vip_held_bills';
const loadHeld = (): any[] => { try { return JSON.parse(localStorage.getItem(HELD_KEY) || '[]'); } catch { return []; } };
const saveHeld = (h: any[]) => { try { localStorage.setItem(HELD_KEY, JSON.stringify(h)); } catch { /* ignore */ } };

export default function POS() {
  const { settings } = useAuth();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [discount, setDiscount] = useState('0');
  const [method, setMethod] = useState('CASH');
  const [received, setReceived] = useState('');
  const [paidNow, setPaidNow] = useState('');
  const [payNowMethod, setPayNowMethod] = useState('CASH');
  const [acct, setAcct] = useState<any>(null);
  const [rx, setRx] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [custQ, setCustQ] = useState('');
  const [custRes, setCustRes] = useState<any[]>([]);
  const [held, setHeld] = useState<any[]>(loadHeld());
  const [showHeld, setShowHeld] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const checkoutRef = useRef<() => void>(() => {});

  // Load the customer's credit account (limit, balance) when one is selected
  useEffect(() => {
    if (!customer) { setAcct(null); setMethod((m) => (m === 'CREDIT' ? 'CASH' : m)); return; }
    api('/credit/customers/' + customer.id + '/balance').then(setAcct).catch(() => setAcct(null));
  }, [customer]);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => api('/pos/search?q=' + encodeURIComponent(q)).then(setResults).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (custQ.trim().length < 2) return setCustRes([]);
    const t = setTimeout(() => api('/customers?' + qs({ q: custQ, pageSize: 5 })).then((d) => setCustRes(d.items)).catch(() => {}), 220);
    return () => clearTimeout(t);
  }, [custQ]);

  // Shortcuts: F2 = focus search, F9 = complete sale
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); input.current?.focus(); }
      if (e.key === 'F9') { e.preventDefault(); checkoutRef.current(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const add = (m: any) => {
    if (m.stock <= 0) return toast('Out of stock', 'err');
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
  const isCredit = method === 'CREDIT';
  const payNow = Number(paidNow) || 0;
  const owed = Math.max(0, Math.round((total - payNow) * 100) / 100);
  const creditOk = !!customer && !!acct && acct.creditLimit > 0 && payNow <= total && owed <= acct.available + 0.001;
  const canPay = cart.length > 0 && !(needRx && !rx) && (isCredit ? creditOk : paid >= total);

  const checkout = async () => {
    setBusy(true);
    const items = cart.map((x) => ({ medicineId: x.id, qty: x.qty }));
    const sale = await run(() => isCredit
      ? api('/pos/checkout-credit', { method: 'POST', body: { items, discount: disc, customerId: customer?.id, paidNow: payNow, method: payNowMethod, prescriptionVerified: needRx ? rx : undefined } })
      : api('/pos/checkout', { method: 'POST', body: { items, discount: disc, customerId: customer?.id, payments: [{ method, amount: method === 'CASH' ? paid : total }], prescriptionVerified: needRx ? rx : undefined } }));
    setBusy(false);
    if (sale) { setDone(sale); setCart([]); setDiscount('0'); setReceived(''); setPaidNow(''); setRx(false); setCustomer(null); }
  };
  checkoutRef.current = () => { if (canPay && !busy) checkout(); };

  const hold = () => {
    if (!cart.length) return;
    const h = [{ id: Date.now(), at: new Date().toISOString(), cart, customer }, ...loadHeld()].slice(0, 20);
    saveHeld(h); setHeld(h); setCart([]); setCustomer(null); setDiscount('0'); setReceived('');
    toast('Bill put on hold (see Held bills)');
  };
  const resume = (h: any) => {
    if (cart.length && !window.confirm('The current cart will be cleared. Restore the held bill?')) return;
    setCart(h.cart); setCustomer(h.customer);
    const rest = held.filter((x) => x.id !== h.id);
    saveHeld(rest); setHeld(rest); setShowHeld(false);
  };
  const dropHeld = (id: number) => { const rest = held.filter((x) => x.id !== id); saveHeld(rest); setHeld(rest); };

  return (
    <>
      <div className="top"><h1>POS / Billing</h1>
        <div className="row"><span className="muted">F2 = search · F9 = complete sale</span><button className="btn sec sm" onClick={() => setShowHeld(true)}>Held bills ({held.length})</button></div>
      </div>
      <div className="pos">
        <div className="card">
          <input ref={input} autoFocus placeholder="Medicine name, generic, barcode or SKU…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && results.length >= 1 && add(results[0])} aria-label="Medicine search" />
          <div style={{ marginTop: 8 }}>
            {results.map((m) => (
              <button key={m.id} className="res" disabled={m.stock <= 0} onClick={() => add(m)}>
                <span>{m.name} {m.strength} <span className="muted">{m.form}</span> {m.requiresPrescription && <span className="tag amber">Rx</span>}</span>
                <span>{fmt(m.sellingPrice)} · <span className={m.stock <= 0 ? 'err' : 'muted'}>stock {m.stock}</span></span>
              </button>
            ))}
            {q && results.length === 0 && <p className="muted">No results.</p>}
          </div>
        </div>
        <div className="card">
          <h2>Bill</h2>
          <div style={{ marginBottom: 8 }}>
            {customer ? (
              <span className="chip">👤 {customer.name} {customer.phone && `(${customer.phone})`} <button className="btn ghost sm" onClick={() => setCustomer(null)} aria-label="Remove customer">✕</button></span>
            ) : (
              <>
                <input placeholder="Customer (optional): name or phone…" value={custQ} onChange={(e) => setCustQ(e.target.value)} aria-label="Customer search" />
                {custRes.map((c) => <button key={c.id} className="res" onClick={() => { setCustomer(c); setCustQ(''); setCustRes([]); }}><span>{c.name}</span><span className="muted">{c.phone}</span></button>)}
              </>
            )}
          </div>
          {cart.length === 0 && <p className="muted">The cart is empty. Search for a medicine to add it (press Enter to add the first result).</p>}
          {cart.map((x) => (
            <div key={x.id} className="row" style={{ marginBottom: 6 }}>
              <span className="grow">{x.name} {x.strength}<br /><span className="muted">{fmt(x.sellingPrice)}</span></span>
              <input type="number" min={1} max={x.stock} value={x.qty} onChange={(e) => setQty(x.id, e.target.value)} style={{ width: 70 }} aria-label={'Quantity ' + x.name} />
              <b style={{ width: 80, textAlign: 'right' }}>{fmt(Number(x.sellingPrice) * x.qty)}</b>
              <button className="btn ghost" onClick={() => setCart(cart.filter((y) => y.id !== x.id))} aria-label="Remove">✕</button>
            </div>
          ))}
          {cart.length > 0 && (
            <>
              <hr />
              <div className="grid2">
                <label className="f"><span>Discount ({settings.currency})</span><input type="number" min={0} value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
                <label className="f"><span>Payment</span>
                  <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK">Bank transfer</option><option value="OTHER">Other</option>{customer && <option value="CREDIT">Credit (pay later)</option>}</select>
                </label>
              </div>
              {isCredit && (
                <div className="card" style={{ marginBottom: 8, background: '#f7fbf9' }}>
                  {acct && acct.creditLimit > 0 ? <p style={{ margin: '0 0 .5rem' }}>Balance owed: <b>{fmt(acct.balance)}</b> · Limit: <b>{fmt(acct.creditLimit)}</b> · Available: <b>{fmt(acct.available)}</b></p> : <p className="err" style={{ margin: '0 0 .5rem' }}>This customer has no credit limit. Ask a manager to set one under Customer Credit.</p>}
                  <div className="grid2">
                    <label className="f"><span>Paid now (optional)</span><input type="number" min={0} value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0" /></label>
                    <label className="f"><span>Paid with</span><select value={payNowMethod} onChange={(e) => setPayNowMethod(e.target.value)}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK">Bank transfer</option><option value="OTHER">Other</option></select></label>
                  </div>
                  <div className="row"><span className="grow">Goes on the customer's account</span><b>{fmt(owed)}</b></div>
                  {acct && acct.creditLimit > 0 && owed > acct.available + 0.001 && <p className="err" style={{ margin: '.4rem 0 0' }}>This is above the customer's available credit.</p>}
                </div>
              )}
              {method === 'CASH' && <label className="f"><span>Amount received from customer (blank = exact)</span><input type="number" min={0} value={received} onChange={(e) => setReceived(e.target.value)} placeholder={String(total)} /></label>}
              {needRx && <label className="row" style={{ marginBottom: 8 }}><input type="checkbox" checked={rx} onChange={(e) => setRx(e.target.checked)} /> Prescription has been checked (verified by pharmacist)</label>}
              <div className="row"><span className="grow muted">Subtotal {fmt(subtotal)}{disc > 0 && ` − ${fmt(disc)}`}</span><span className="total">{fmt(total)}</span></div>
              {method === 'CASH' && <div className="row"><span className="grow">Change due</span><b>{fmt(change)}</b></div>}
              <div className="row mt">
                <button className="btn grow" disabled={busy || !canPay} onClick={checkout}>{busy ? 'Please wait…' : 'Complete sale (F9)'}</button>
                <button className="btn sec" onClick={hold}>Hold</button>
              </div>
            </>
          )}
        </div>
      </div>
      {showHeld && (
        <Modal title="Held bills" onClose={() => setShowHeld(false)}>
          {held.length === 0 && <p className="muted">No held bills.</p>}
          {held.map((h) => (
            <div key={h.id} className="row" style={{ marginBottom: 8 }}>
              <span className="grow">{dt(h.at)} · {h.cart.length} items{h.customer ? ` · ${h.customer.name}` : ''}</span>
              <button className="btn sm" onClick={() => resume(h)}>Restore</button>
              <button className="btn sm ghost" onClick={() => dropHeld(h.id)}>Remove</button>
            </div>
          ))}
          <p className="muted">Held bills are stored only in this computer’s browser.</p>
        </Modal>
      )}
      {done && <Modal title={'Bill ' + done.invoiceNo} onClose={() => setDone(null)}><Receipt sale={done} settings={settings} /></Modal>}
    </>
  );
}

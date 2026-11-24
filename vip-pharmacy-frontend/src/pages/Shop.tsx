import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { fmt, Modal, toast, run, Field } from '../ui';

// Public online store for customers (no login). Payment: Cash on Delivery.
// Converts a Pakistani phone number to WhatsApp format (92...)
const waNum = (p: string) => { let d = (p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '92' + d.slice(1); return d; };
const COLORS = ['#0a6b50', '#1f7a8c', '#7a4fb3', '#c0662b', '#b23a6b', '#3d6fb4', '#6b8e23'];

export default function Shop() {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [catId, setCatId] = useState('');
  const [cats, setCats] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [prods, setProds] = useState<any>(null);
  const [cart, setCart] = useState<Record<number, { p: any; qty: number }>>(() => { try { return JSON.parse(localStorage.getItem('vip_shop_cart') || '{}'); } catch { return {}; } });
  const [showCart, setShowCart] = useState(false);
  const [track, setTrack] = useState(false);
  const [placed, setPlaced] = useState<any>(null);

  useEffect(() => { try { localStorage.setItem('vip_shop_cart', JSON.stringify(cart)); } catch { /* ignore */ } }, [cart]);
  useEffect(() => { api('/store/info').then(setInfo).catch((e) => setErr(e.message)); api('/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => { if (info?.storeName) document.title = info.storeName + ' — Online Pharmacy'; }, [info]);
  useEffect(() => {
    if (!info?.enabled) return;
    const t = setTimeout(() => api('/store/products?' + qs({ q, categoryId: catId, page })).then(setProds).catch((e) => setErr(e.message)), 200);
    return () => clearTimeout(t);
  }, [info, q, catId, page]);

  const items = Object.values(cart);
  const count = items.reduce((s, x) => s + x.qty, 0);
  const sub = items.reduce((s, x) => s + Number(x.p.sellingPrice) * x.qty, 0);
  const add = (p: any) => setCart((c) => ({ ...c, [p.id]: { p, qty: Math.min((c[p.id]?.qty || 0) + 1, p.available) } }));
  const dec = (p: any) => setCart((c) => { const n = { ...c }; const cur = n[p.id]?.qty || 0; if (cur <= 1) delete n[p.id]; else n[p.id] = { p, qty: cur - 1 }; return n; });

  if (err && !info) return <div className="shop-w"><p className="err">{err}</p></div>;
  if (!info) return <div className="shop-w"><div className="skeleton" style={{ height: 160, marginTop: 20 }} /></div>;

  return (
    <>
      <div className="shop-top"><div className="in">
        <div className="shop-brand"><i>✚</i>{info.storeName}</div>
        <span className="grow" />
        {info.phone && <a className="btn sec sm" href={'https://wa.me/' + waNum(info.phone)} target="_blank" rel="noreferrer">💬 WhatsApp</a>}
        <button className="btn sec sm" onClick={() => setTrack(true)}>Track order</button>
        <button className="btn sm cartbtn" onClick={() => setShowCart(true)} aria-label="Open cart">🛒 Cart{count > 0 && <b>{count}</b>}</button>
      </div></div>

      <section className="hero"><div className="in">
        <h1>Genuine medicines, delivered to your door</h1>
        <p>Search from our range of medicines and health products. Pay in cash when your order arrives.</p>
        {info.enabled && <input placeholder="Search medicines or generic names…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search medicines" />}
      </div></section>

      <div className="trust">
        <div><span>✅</span><b>Genuine products</b></div>
        <div><span>🚚</span><b>Home delivery</b></div>
        <div><span>💵</span><b>Cash on delivery</b></div>
      </div>

      <div className="shop-w">
        {!info.enabled ? (
          <div className="card" style={{ marginTop: 24 }}><h2>Our online store is currently closed</h2><p>Please visit the store in person for your medicines{info.phone && ` or contact us on ${info.phone}`}.</p></div>
        ) : (
          <>
            {info.notice && <p className="card" style={{ background: '#fff8e6', marginTop: 20 }}>ℹ️ {info.notice}</p>}
            <div className="chips" style={{ marginTop: 16 }}>
              <button className={catId === '' ? 'on' : ''} onClick={() => { setCatId(''); setPage(1); }}>All</button>
              {cats.map((c) => <button key={c.id} className={String(c.id) === catId ? 'on' : ''} onClick={() => { setCatId(String(c.id)); setPage(1); }}>{c.name}</button>)}
            </div>
            {!prods && <div className="pgrid">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="skeleton" style={{ height: 190 }} />)}</div>}
            {prods && prods.items.length === 0 && <p className="muted">No products found.</p>}
            <div className="pgrid">
              {prods?.items.map((p: any) => {
                const inCart = cart[p.id]?.qty || 0;
                return (
                  <div key={p.id} className="pcard">
                    <div className="pav" style={{ background: COLORS[(p.categoryId || p.id) % COLORS.length] }}>{String(p.name || '?').charAt(0).toUpperCase()}</div>
                    <div className="nm">{p.name} {p.strength}</div>
                    <div className="sub">{[p.genericName, p.form, p.packSize].filter(Boolean).join(' · ')}</div>
                    <div className="pr">{fmt(p.sellingPrice)}</div>
                    {!p.inStock ? <span className="tag red">Out of stock</span> : inCart === 0 ? (
                      <button className="btn sm" onClick={() => add(p)}>Add to cart</button>
                    ) : (
                      <div className="stepper"><button onClick={() => dec(p)} aria-label="Remove one">−</button><span>{inCart}</span><button onClick={() => add(p)} aria-label="Add one" disabled={inCart >= p.available}>+</button></div>
                    )}
                  </div>
                );
              })}
            </div>
            {prods && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button><span className="muted">Page {page}</span><button className="btn sec sm" disabled={page * prods.pageSize >= prods.total} onClick={() => setPage(page + 1)}>Next →</button></div>}
          </>
        )}
      </div>

      <footer className="shop-foot"><div className="in">
        <div><h4>{info.storeName}</h4>{info.address && <div>{info.address}</div>}{info.phone && <div>Phone: {info.phone}</div>}{info.email && <div>{info.email}</div>}</div>
        <div><h4>Good to know</h4><div>This website does not provide medical advice. Use medicines as directed by your doctor or pharmacist. Prescription-only medicines are not sold online.</div></div>
        <div><h4>Staff</h4><a href="/staff">Staff login</a></div>
      </div></footer>

      {count > 0 && <button className="floatcart" onClick={() => setShowCart(true)}><span>🛒 {count} item(s)</span><span>{fmt(sub)} · View cart</span></button>}
      {showCart && <Cart info={info} items={items} sub={sub} setCart={setCart} onClose={() => setShowCart(false)} onPlaced={(o: any) => { setPlaced(o); setCart({}); setShowCart(false); }} />}
      {track && <Track onClose={() => setTrack(false)} />}
      {placed && <Modal title="Order received ✔" onClose={() => setPlaced(null)}><p>Your order number: <b style={{ fontSize: '1.3rem' }}>{placed.orderNo}</b></p><p>Total (including delivery): <b>{fmt(placed.total)}</b> — Cash on Delivery.</p><p className="muted">Please save this order number and your phone number — you will need both to track your order. We will contact you shortly.</p></Modal>}
    </>
  );
}

function Cart({ info, items, sub, setCart, onClose, onPlaced }: any) {
  const [f, setF] = useState({ customerName: '', phone: '', address: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const fee = Number(info.deliveryFee);
  const place = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    const o = await run(() => api('/store/orders', { method: 'POST', body: { ...f, note: f.note || undefined, items: items.map((x: any) => ({ medicineId: x.p.id, qty: x.qty })) } }));
    setBusy(false);
    if (o) onPlaced(o);
  };
  return (
    <Modal title="Your cart" onClose={onClose}>
      {items.length === 0 && <p className="muted">Your cart is empty.</p>}
      {items.map((x: any) => (
        <div key={x.p.id} className="row" style={{ marginBottom: 6 }}>
          <span className="grow">{x.p.name} {x.p.strength}<br /><span className="muted">{fmt(x.p.sellingPrice)}</span></span>
          <input type="number" min={1} max={x.p.available} value={x.qty} style={{ width: 70 }} aria-label={'Quantity ' + x.p.name}
            onChange={(e) => setCart((c: any) => ({ ...c, [x.p.id]: { ...x, qty: Math.max(1, Math.min(Number(e.target.value) || 1, x.p.available)) } }))} />
          <button className="btn ghost" aria-label="Remove" onClick={() => setCart((c: any) => { const n = { ...c }; delete n[x.p.id]; return n; })}>✕</button>
        </div>
      ))}
      {items.length > 0 && (
        <form onSubmit={place}>
          <hr />
          <div className="row"><span className="grow">Items</span><b>{fmt(sub)}</b></div>
          <div className="row"><span className="grow">Delivery</span><b>{fmt(fee)}</b></div>
          <div className="row"><span className="grow"><b>Total (Cash on Delivery)</b></span><b>{fmt(sub + fee)}</b></div>
          {Number(info.minOrder) > sub && <p className="err">Minimum order amount is {fmt(info.minOrder)}.</p>}
          <Field label="Your name"><input value={f.customerName} onChange={set('customerName')} required minLength={2} autoComplete="name" /></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} required inputMode="tel" autoComplete="tel" /></Field>
          <Field label="Full address"><textarea value={f.address} onChange={set('address')} required minLength={8} rows={2} autoComplete="street-address" /></Field>
          <Field label="Note (optional)"><input value={f.note} onChange={set('note')} /></Field>
          <button className="btn" style={{ width: '100%' }} disabled={busy || Number(info.minOrder) > sub}>{busy ? 'Please wait…' : 'Place order'}</button>
        </form>
      )}
    </Modal>
  );
}

function Track({ onClose }: { onClose: () => void }) {
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState<any>(null);
  const go = async (e: any) => { e.preventDefault(); const r = await run(() => api('/store/track?' + qs({ orderNo: orderNo.trim().toUpperCase(), phone }))); if (r) setRes(r); else toast('Order not found', 'err'); };
  return (
    <Modal title="Track order" onClose={onClose}>
      <form onSubmit={go}>
        <Field label="Order number (WEB-00001)"><input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} required /></Field>
        <Field label="Phone number"><input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" /></Field>
        <button className="btn">Track</button>
      </form>
      {res && <div className="mt"><h3>{res.orderNo}: <span className="tag">{res.status}</span></h3>
        <ul>{res.items.map((i: any, k: number) => <li key={k}>{i.name} × {i.qty}</li>)}</ul>
        <p>Total: {fmt(res.total)}</p>
        {res.history.map((h: any, k: number) => <div key={k} className="muted">{new Date(h.at).toLocaleString('en-GB')} — {h.status}</div>)}</div>}
    </Modal>
  );
}

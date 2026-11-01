import { useEffect, useState } from 'react';
import { api, qs } from '../api';
import { fmt, Modal, toast, run, Field } from '../ui';

// Customers ke liye public online store (bina login). Payment: Cash on Delivery.
export default function Shop() {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [catId, setCatId] = useState('');
  const [cats, setCats] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [prods, setProds] = useState<any>(null);
  const [cart, setCart] = useState<Record<number, { p: any; qty: number }>>({});
  const [showCart, setShowCart] = useState(false);
  const [track, setTrack] = useState(false);
  const [placed, setPlaced] = useState<any>(null);

  useEffect(() => { api('/store/info').then(setInfo).catch((e) => setErr(e.message)); api('/categories').then(setCats).catch(() => {}); }, []);
  useEffect(() => {
    if (!info?.enabled) return;
    const t = setTimeout(() => api('/store/products?' + qs({ q, categoryId: catId, page })).then(setProds).catch((e) => setErr(e.message)), 200);
    return () => clearTimeout(t);
  }, [info, q, catId, page]);

  const items = Object.values(cart);
  const count = items.reduce((s, x) => s + x.qty, 0);
  const sub = items.reduce((s, x) => s + Number(x.p.sellingPrice) * x.qty, 0);
  const add = (p: any) => setCart((c) => ({ ...c, [p.id]: { p, qty: Math.min((c[p.id]?.qty || 0) + 1, p.available) } }));

  if (err && !info) return <div className="shop-w"><p className="err">{err}</p></div>;
  if (!info) return <p className="muted" style={{ padding: 20 }}>Load ho raha hai…</p>;

  return (
    <>
      <header className="shop-h">
        <div className="shop-w row" style={{ padding: 0 }}>
          <div className="grow"><b style={{ fontSize: '1.3rem' }}>{info.storeName}</b><div style={{ opacity: .85, fontSize: '.9rem' }}>{info.address} {info.phone && `· ${info.phone}`}</div></div>
          <button className="btn sec sm" onClick={() => setTrack(true)}>Order track karein</button>
          <button className="btn sm" style={{ background: '#fff', color: 'var(--green-d)' }} onClick={() => setShowCart(true)}>Cart ({count})</button>
        </div>
      </header>
      <div className="shop-w">
        {!info.enabled ? (
          <div className="card"><h2>Online store abhi band hai</h2><p>Dawai ke liye seedha dukaan par tashreef layein{info.phone && ` ya ${info.phone} par rabta karein`}.</p></div>
        ) : (
          <>
            {info.notice && <p className="card" style={{ background: '#fff8e6' }}>{info.notice}</p>}
            <div className="row" style={{ margin: '.8rem 0' }}>
              <input className="grow" placeholder="Dawai ya generic naam search karein…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search" />
              <select value={catId} onChange={(e) => { setCatId(e.target.value); setPage(1); }} style={{ width: 200 }} aria-label="Category"><option value="">Sab categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            {!prods && <p className="muted">Load ho raha hai…</p>}
            {prods && prods.items.length === 0 && <p className="muted">Koi cheez nahi mili.</p>}
            <div className="products">
              {prods?.items.map((p: any) => (
                <div key={p.id} className="prod">
                  <b>{p.name} {p.strength}</b>
                  <span className="muted">{p.genericName} {p.form && `· ${p.form}`} {p.packSize && `· ${p.packSize}`}</span>
                  <span className="price">{fmt(p.sellingPrice)}</span>
                  {p.inStock ? <button className="btn sm" onClick={() => add(p)}>Cart mein dalein</button> : <span className="tag red">Stock khatam</span>}
                </div>
              ))}
            </div>
            {prods && <div className="row mt"><button className="btn sec sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Pichla</button><span className="muted">Page {page}</span><button className="btn sec sm" disabled={page * prods.pageSize >= prods.total} onClick={() => setPage(page + 1)}>Agla →</button></div>}
          </>
        )}
        <p className="muted mt" style={{ fontSize: '.85rem' }}>Yeh website dawai ka mashwara nahi deti. Dawai doctor/pharmacist ki hidayat ke mutabiq istemal karein. Prescription wali dawaiyan online nahi bechi jati.</p>
        <p style={{ fontSize: '.8rem' }}><a href="/staff">Staff login</a></p>
      </div>
      {showCart && <Cart info={info} items={items} sub={sub} setCart={setCart} onClose={() => setShowCart(false)} onPlaced={(o: any) => { setPlaced(o); setCart({}); setShowCart(false); }} />}
      {track && <Track onClose={() => setTrack(false)} />}
      {placed && <Modal title="Order mosool ho gaya ✔" onClose={() => setPlaced(null)}><p>Aap ka order number: <b style={{ fontSize: '1.3rem' }}>{placed.orderNo}</b></p><p>Total (delivery samet): <b>{fmt(placed.total)}</b> — Cash on Delivery.</p><p className="muted">Yeh number aur apna phone number save kar lein, order track karne ke liye chahiye. Hum jald aap se rabta karenge.</p></Modal>}
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
    <Modal title="Aap ka cart" onClose={onClose}>
      {items.length === 0 && <p className="muted">Cart khali hai.</p>}
      {items.map((x: any) => (
        <div key={x.p.id} className="row" style={{ marginBottom: 6 }}>
          <span className="grow">{x.p.name} {x.p.strength}<br /><span className="muted">{fmt(x.p.sellingPrice)}</span></span>
          <input type="number" min={1} max={x.p.available} value={x.qty} style={{ width: 70 }} aria-label={'Quantity ' + x.p.name}
            onChange={(e) => setCart((c: any) => ({ ...c, [x.p.id]: { ...x, qty: Math.max(1, Math.min(Number(e.target.value) || 1, x.p.available)) } }))} />
          <button className="btn ghost" aria-label="Hatayen" onClick={() => setCart((c: any) => { const n = { ...c }; delete n[x.p.id]; return n; })}>✕</button>
        </div>
      ))}
      {items.length > 0 && (
        <form onSubmit={place}>
          <hr />
          <div className="row"><span className="grow">Items</span><b>{fmt(sub)}</b></div>
          <div className="row"><span className="grow">Delivery</span><b>{fmt(fee)}</b></div>
          <div className="row"><span className="grow"><b>Total (Cash on Delivery)</b></span><b>{fmt(sub + fee)}</b></div>
          {Number(info.minOrder) > sub && <p className="err">Kam az kam order {fmt(info.minOrder)} ka hona chahiye.</p>}
          <Field label="Aap ka naam"><input value={f.customerName} onChange={set('customerName')} required minLength={2} autoComplete="name" /></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} required inputMode="tel" autoComplete="tel" /></Field>
          <Field label="Poora address"><textarea value={f.address} onChange={set('address')} required minLength={8} rows={2} autoComplete="street-address" /></Field>
          <Field label="Note (optional)"><input value={f.note} onChange={set('note')} /></Field>
          <button className="btn" style={{ width: '100%' }} disabled={busy || Number(info.minOrder) > sub}>{busy ? 'Ho raha hai…' : 'Order karein'}</button>
        </form>
      )}
    </Modal>
  );
}

function Track({ onClose }: { onClose: () => void }) {
  const [orderNo, setOrderNo] = useState('');
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState<any>(null);
  const go = async (e: any) => { e.preventDefault(); const r = await run(() => api('/store/track?' + qs({ orderNo: orderNo.trim().toUpperCase(), phone }))); if (r) setRes(r); else toast('Order nahi mila', 'err'); };
  return (
    <Modal title="Order track karein" onClose={onClose}>
      <form onSubmit={go}>
        <Field label="Order number (WEB-00001)"><input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} required /></Field>
        <Field label="Phone number"><input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" /></Field>
        <button className="btn">Dekhein</button>
      </form>
      {res && <div className="mt"><h3>{res.orderNo}: <span className="tag">{res.status}</span></h3>
        <ul>{res.items.map((i: any, k: number) => <li key={k}>{i.name} × {i.qty}</li>)}</ul>
        <p>Total: {fmt(res.total)}</p>
        {res.history.map((h: any, k: number) => <div key={k} className="muted">{new Date(h.at).toLocaleString('en-GB')} — {h.status}</div>)}</div>}
    </Modal>
  );
}

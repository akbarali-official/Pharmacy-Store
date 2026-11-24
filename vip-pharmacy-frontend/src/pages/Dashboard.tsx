import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { dt, fmt, State, useLoad } from '../ui';

const SELL = ['OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER'];
const STOCK = ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY'];
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const localKey = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const short = (n: number) => (n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));

function SalesChart({ trend }: { trend: { day: string; total: number; count: number }[] }) {
  const map = new Map(trend.map((t) => [t.day, t]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const t = map.get(localKey(d));
    return { label: d.toLocaleDateString('en-GB', { weekday: 'short' }), total: t?.total || 0, count: t?.count || 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <svg viewBox="0 0 700 230" width="100%" role="img" aria-label="Sales for the last 7 days">
      <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2aa37f" /><stop offset="1" stopColor="#0a6b50" /></linearGradient></defs>
      {[0, 0.5, 1].map((f) => <line key={f} x1="30" x2="690" y1={190 - f * 150} y2={190 - f * 150} stroke="#e6eeea" />)}
      {days.map((d, i) => {
        const h = (d.total / max) * 150, x = 50 + i * 92;
        return (
          <g key={i}>
            <rect x={x} y={190 - h} width="56" height={Math.max(h, d.total > 0 ? 3 : 0)} rx="8" fill="url(#g1)"><title>{`${d.label}: ${fmt(d.total)} (${d.count} bills)`}</title></rect>
            {d.total > 0 && <text x={x + 28} y={182 - h} textAnchor="middle" fontSize="12" fontWeight="700" fill="#064535">{short(d.total)}</text>}
            <text x={x + 28} y="212" textAnchor="middle" fontSize="12" fill="#5f7169">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: d, loading, error } = useLoad(() => api('/reports/dashboard'));
  const first = String(user.name || '').split(' ')[0];
  const topMax = Math.max(1, ...(d?.top || []).map((t: any) => t.qty));

  const alerts: { tone: string; text: string }[] = [];
  if (d) {
    if (d.expired) alerts.push({ tone: 'red', text: `${d.expired} batch(es) have expired — remove them from the shelves.` });
    if (d.nearExpiry) alerts.push({ tone: 'amber', text: `${d.nearExpiry} batch(es) expire soon — plan discounts or a supplier return.` });
    if (d.outOfStock) alerts.push({ tone: 'red', text: `${d.outOfStock} medicine(s) are out of stock.` });
    if (d.lowStock) alerts.push({ tone: 'amber', text: `${d.lowStock} medicine(s) are running low — check the reorder list.` });
    if (d.pendingOrders) alerts.push({ tone: 'amber', text: `${d.pendingOrders} new online order(s) are waiting for confirmation.` });
  }

  return (
    <>
      <div className="hello">
        <div><h1 style={{ margin: 0 }}>{greet()}, {first} 👋</h1><p>Here is how the store is doing today.</p></div>
        <div className="quick">
          {SELL.includes(user.role) && <Link className="btn" to="/staff/pos">+ New sale</Link>}
          {STOCK.includes(user.role) && <Link className="btn sec" to="/staff/medicines">Add medicine</Link>}
          {['OWNER', 'MANAGER', 'INVENTORY'].includes(user.role) && <Link className="btn sec" to="/staff/purchases">Receive stock</Link>}
        </div>
      </div>
      <State loading={loading} error={error} />
      {loading && <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 78 }} />)}</div>}
      {d && (
        <>
          <div className="kpis">
            <div className="kpi"><div className="ic">💰</div><div><b>{fmt(d.todaySales)}</b><span>Sales today · {d.todayInvoices} bills</span></div></div>
            <div className="kpi gold"><div className="ic">✅</div><div><b>{fmt(d.todayNet)}</b><span>Net today (after refunds)</span></div></div>
            <Link className={'kpi' + (d.pendingOrders ? ' warn' : '')} to="/staff/orders"><div className="ic">🛒</div><div><b>{d.pendingOrders}</b><span>New online orders</span></div></Link>
            <Link className={'kpi' + (d.lowStock ? ' warn' : '')} to="/staff/inventory"><div className="ic">📉</div><div><b>{d.lowStock}</b><span>Low-stock medicines</span></div></Link>
            <Link className={'kpi' + (d.outOfStock ? ' bad' : '')} to="/staff/inventory"><div className="ic">⛔</div><div><b>{d.outOfStock}</b><span>Out of stock</span></div></Link>
            <Link className={'kpi' + (d.nearExpiry ? ' warn' : '')} to="/staff/inventory"><div className="ic">⏳</div><div><b>{d.nearExpiry}</b><span>Expiring soon</span></div></Link>
            <Link className={'kpi' + (d.expired ? ' bad' : '')} to="/staff/inventory"><div className="ic">🗑️</div><div><b>{d.expired}</b><span>Expired batches</span></div></Link>
          </div>
          <div className="dash">
            <div className="card"><h2>Sales — last 7 days</h2><SalesChart trend={d.trend} /></div>
            <div className="card">
              <h2>Needs attention</h2>
              {alerts.length === 0 && <div className="alertrow"><span className="dot" /><span>All clear — nothing needs attention right now.</span></div>}
              {alerts.map((a, i) => <div key={i} className="alertrow"><span className={'dot ' + a.tone} /><span>{a.text}</span></div>)}
            </div>
            <div className="card">
              <h2>Top sellers (7 days)</h2>
              {d.top.length === 0 && <p className="muted">No data yet.</p>}
              {d.top.map((t: any) => (
                <div key={t.name} className="hbar"><span style={{ width: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span><div className="t"><i style={{ width: `${(t.qty / topMax) * 100}%` }} /></div><b>{t.qty}</b></div>
              ))}
            </div>
            <div className="card">
              <h2>Recent sales</h2>
              {d.recent.length === 0 && <p className="muted">No sales yet.</p>}
              {d.recent.map((s: any) => <div key={s.id} className="row" style={{ padding: '.3rem 0' }}><span className="grow">{s.invoiceNo} <span className="muted">{dt(s.createdAt)}</span></span><b>{fmt(s.total)}</b></div>)}
            </div>
          </div>
        </>
      )}
    </>
  );
}

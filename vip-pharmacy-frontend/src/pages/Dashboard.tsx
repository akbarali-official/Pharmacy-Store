import { api } from '../api';
import { useAuth } from '../auth';
import { dt, fmt, State, useLoad } from '../ui';

export default function Dashboard() {
  const { user } = useAuth();
  const { data: d, loading, error } = useLoad(() => api('/reports/dashboard'));
  const max = Math.max(1, ...(d?.trend || []).map((t: any) => t.total));
  return (
    <>
      <div className="top"><h1>Dashboard</h1><span className="muted">Salam, {user.name}</span></div>
      <State loading={loading} error={error} />
      {d && (
        <>
          <div className="stats">
            <div className="card stat"><b>{fmt(d.todaySales)}</b><span>Aaj ki sale ({d.todayInvoices} bills)</span></div>
            <div className="card stat"><b>{fmt(d.todayNet)}</b><span>Aaj net (refund ke baad)</span></div>
            <div className={'card stat' + (d.lowStock ? ' warn' : '')}><b>{d.lowStock}</b><span>Low stock dawaiyan</span></div>
            <div className={'card stat' + (d.outOfStock ? ' bad' : '')}><b>{d.outOfStock}</b><span>Stock khatam</span></div>
            <div className={'card stat' + (d.nearExpiry ? ' warn' : '')}><b>{d.nearExpiry}</b><span>Jald expire hone wali batches</span></div>
            <div className={'card stat' + (d.expired ? ' bad' : '')}><b>{d.expired}</b><span>Expire ho chuki (bechi nahi jati)</span></div>
            <div className={'card stat' + (d.pendingOrders ? ' warn' : '')}><b>{d.pendingOrders}</b><span>Nayi online orders</span></div>
          </div>
          <div className="pos">
            <div className="card">
              <h2>Pichle 7 din ki sale</h2>
              {d.trend.length === 0 && <p className="muted">Abhi koi sale nahi.</p>}
              {d.trend.map((t: any) => (
                <div key={t.day} className="row" style={{ marginBottom: 4 }}>
                  <span style={{ width: 90 }}>{t.day}</span>
                  <div style={{ background: 'var(--green)', height: 14, width: `${(t.total / max) * 100}%`, minWidth: 3, borderRadius: 3 }} />
                  <span>{fmt(t.total)}</span>
                </div>
              ))}
              <h2 className="mt">Top bikne wali (7 din)</h2>
              {d.top.length === 0 && <p className="muted">Data nahi.</p>}
              {d.top.map((t: any) => <div key={t.name} className="row"><span className="grow">{t.name}</span><b>{t.qty}</b></div>)}
            </div>
            <div className="card">
              <h2>Haal ki sales</h2>
              {d.recent.length === 0 && <p className="muted">Abhi koi sale nahi.</p>}
              {d.recent.map((s: any) => <div key={s.id} className="row"><span className="grow">{s.invoiceNo} <span className="muted">{dt(s.createdAt)}</span></span><b>{fmt(s.total)}</b></div>)}
            </div>
          </div>
        </>
      )}
    </>
  );
}

import { useState } from 'react';
import { api, download, qs } from '../api';
import { useAuth } from '../auth';
import { fmt, run, State, Tabs, today, useLoad } from '../ui';

function PrintHeader({ title, sub }: { title: string; sub?: string }) {
  const { settings } = useAuth();
  return (
    <div className="print-title">
      <h2 style={{ margin: 0 }}>{settings.storeName}</h2>
      <div>{title}{sub ? ` — ${sub}` : ''}</div>
      <div className="muted">Printed {new Date().toLocaleString('en-GB')}</div>
    </div>
  );
}

export default function Tools() {
  const [tab, setTab] = useState('reorder');
  return (
    <>
      <div className="top no-print"><h1>Business Tools</h1></div>
      <div className="no-print">
        <Tabs value={tab} onChange={setTab} tabs={[['reorder', 'Reorder list'], ['closing', 'Daily closing'], ['cashiers', 'Cashier performance'], ['expiry', 'Expiry report']]} />
      </div>
      {tab === 'reorder' && <Reorder />}
      {tab === 'closing' && <Closing />}
      {tab === 'cashiers' && <Cashiers />}
      {tab === 'expiry' && <Expiry />}
    </>
  );
}

function Reorder() {
  const { data, loading, error } = useLoad(() => api('/tools/reorder'));
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <span className="muted grow">Medicines at or below their reorder level. Suggested quantity tops stock up to twice the reorder level.</span>
        <button className="btn sec sm" onClick={() => run(() => download('/tools/reorder.csv', 'reorder-list.csv'))}>Export CSV</button>
        <button className="btn sm" onClick={() => window.print()}>Print</button>
      </div>
      <PrintHeader title="Reorder list" />
      <State loading={loading} error={error} />
      {data && (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Medicine</th><th className="right">In stock</th><th className="right">Reorder level</th><th className="right">Suggested qty</th><th className="right">Unit cost</th><th className="right">Estimated cost</th></tr></thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={6} className="muted">Nothing to reorder right now.</td></tr>}
            {data.items.map((i: any) => (
              <tr key={i.id}><td>{i.name} {i.strength} <span className="muted">{i.form}</span></td><td className="right">{i.stock === 0 ? <span className="tag red">0</span> : i.stock}</td><td className="right">{i.reorderLevel}</td><td className="right"><b>{i.suggested}</b></td><td className="right">{fmt(i.unitCost)}</td><td className="right">{fmt(i.estCost)}</td></tr>
            ))}
          </tbody>
          {data.items.length > 0 && <tfoot><tr><td colSpan={5} className="right"><b>Total estimated cost</b></td><td className="right"><b>{fmt(data.totalEstCost)}</b></td></tr></tfoot>}
        </table></div>
      )}
    </>
  );
}

function Closing() {
  const [date, setDate] = useState(today());
  const { data: d, loading, error } = useLoad(() => api('/tools/closing?' + qs({ date })), [date]);
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} aria-label="Report date" />
        <span className="grow" />
        <button className="btn sm" onClick={() => window.print()}>Print</button>
      </div>
      <PrintHeader title="Daily closing report" sub={date} />
      <State loading={loading} error={error} />
      {d && (
        <>
          <div className="stats">
            <div className="card stat"><b>{d.invoices}</b><span>Invoices</span></div>
            <div className="card stat"><b>{fmt(d.grossSales)}</b><span>Gross sales</span></div>
            <div className="card stat"><b>{fmt(d.discounts)}</b><span>Discounts given</span></div>
            <div className="card stat"><b>{fmt(d.refunds)}</b><span>Refunds ({d.refundCount})</span></div>
            <div className="card stat"><b>{fmt(d.netSales)}</b><span>Net sales</span></div>
            <div className="card stat"><b>{fmt(d.totalExpenses)}</b><span>Expenses (cash {fmt(d.cashExpenses)})</span></div>
          </div>
          <div className="grid2">
            <div>
              <h2>Payments received</h2>
              <table className="tbl"><tbody>
                {d.payments.length === 0 && <tr><td className="muted">No payments.</td></tr>}
                {d.payments.map((p: any) => <tr key={p.method}><td>{p.method}</td><td className="right">{fmt(p.amount)}</td></tr>)}
              </tbody></table>
              <h2 className="mt">Sales by cashier</h2>
              <table className="tbl"><thead><tr><th>Cashier</th><th className="right">Invoices</th><th className="right">Total</th></tr></thead><tbody>
                {d.cashiers.length === 0 && <tr><td colSpan={3} className="muted">No sales.</td></tr>}
                {d.cashiers.map((c: any) => <tr key={c.name}><td>{c.name}</td><td className="right">{c.invoices}</td><td className="right">{fmt(c.total)}</td></tr>)}
              </tbody></table>
            </div>
            <div>
              <h2>Top items today</h2>
              <table className="tbl"><thead><tr><th>Medicine</th><th className="right">Qty</th><th className="right">Revenue</th></tr></thead><tbody>
                {d.topItems.length === 0 && <tr><td colSpan={3} className="muted">No sales.</td></tr>}
                {d.topItems.map((t: any) => <tr key={t.name}><td>{t.name}</td><td className="right">{t.qty}</td><td className="right">{fmt(t.revenue)}</td></tr>)}
              </tbody></table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Cashiers() {
  const [from, setFrom] = useState(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today());
  const { data, loading, error } = useLoad(() => api('/tools/cashiers?' + qs({ from, to })), [from, to]);
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} aria-label="From" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} aria-label="To" />
        <span className="grow" />
        <button className="btn sm" onClick={() => window.print()}>Print</button>
      </div>
      <PrintHeader title="Cashier performance" sub={`${from} to ${to}`} />
      <State loading={loading} error={error} />
      {data && (
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Staff member</th><th>Role</th><th className="right">Invoices</th><th className="right">Sales total</th><th className="right">Average bill</th><th className="right">Discounts</th><th className="right">Refunds</th></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={7} className="muted">No activity in this period.</td></tr>}
            {data.map((c: any) => <tr key={c.name}><td>{c.name}</td><td>{c.role}</td><td className="right">{c.invoices}</td><td className="right">{fmt(c.total)}</td><td className="right">{fmt(c.avgBill)}</td><td className="right">{fmt(c.discounts)}</td><td className="right">{fmt(c.refunds)} ({c.refundCount})</td></tr>)}
          </tbody>
        </table></div>
      )}
    </>
  );
}

function Expiry() {
  const [days, setDays] = useState('90');
  const { data, loading, error } = useLoad(() => api('/tools/expiry?days=' + days), [days]);
  return (
    <>
      <div className="row no-print" style={{ marginBottom: 10 }}>
        <select value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 220 }} aria-label="Expiry window">
          <option value="30">Expired + next 30 days</option><option value="60">Expired + next 60 days</option><option value="90">Expired + next 90 days</option><option value="180">Expired + next 180 days</option>
        </select>
        <span className="grow" />
        <button className="btn sec sm" onClick={() => run(() => download('/tools/expiry.csv?days=' + days, 'expiry-report.csv'))}>Export CSV</button>
        <button className="btn sm" onClick={() => window.print()}>Print</button>
      </div>
      <PrintHeader title="Expiry report" sub={`expired and expiring within ${days} days`} />
      <State loading={loading} error={error} />
      {data && (
        <>
          <p>Total value at cost: <b>{fmt(data.totalValue)}</b> · Already expired: <b className="err">{fmt(data.expiredValue)}</b></p>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Medicine</th><th>Batch</th><th>Expiry date</th><th className="right">Qty</th><th>Status</th><th className="right">Value at cost</th></tr></thead>
            <tbody>
              {data.items.length === 0 && <tr><td colSpan={6} className="muted">No batches in this window.</td></tr>}
              {data.items.map((i: any, k: number) => <tr key={k}><td>{i.medicine}</td><td>{i.batchNo}</td><td>{i.expiryDate}</td><td className="right">{i.qty}</td><td><span className={i.status === 'EXPIRED' ? 'tag red' : 'tag amber'}>{i.status === 'EXPIRED' ? 'Expired' : 'Expiring soon'}</span></td><td className="right">{fmt(i.valueAtCost)}</td></tr>)}
            </tbody>
          </table></div>
        </>
      )}
    </>
  );
}

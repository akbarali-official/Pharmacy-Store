import { useState } from 'react';
import { api, download, qs } from '../api';
import { fmt, run, State, useLoad } from '../ui';

export default function Reports() {
  const [from, setFrom] = useState(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data: d, loading, error } = useLoad(() => api('/reports/summary?' + qs({ from, to })), [from, to]);
  return (
    <>
      <div className="top"><h1>Reports</h1>
        <div className="row">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} aria-label="Se" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} aria-label="Tak" />
          <button className="btn sec sm" onClick={() => run(() => download('/reports/sales.csv?' + qs({ from, to }), 'sales.csv'))}>Sales CSV</button>
          <button className="btn sec sm" onClick={() => run(() => download('/reports/stock.csv', 'stock.csv'))}>Stock CSV</button>
        </div>
      </div>
      <State loading={loading} error={error} />
      {d && (
        <>
          <div className="stats">
            <div className="card stat"><b>{fmt(d.grossSales)}</b><span>Gross sales ({d.invoices} bills)</span></div>
            <div className="card stat"><b>{fmt(d.discounts)}</b><span>Discounts</span></div>
            <div className="card stat"><b>{fmt(d.refunds)}</b><span>Refunds</span></div>
            <div className="card stat"><b>{fmt(d.netSales)}</b><span>Net sales</span></div>
            <div className="card stat"><b>{fmt(d.estimatedProfit)}</b><span>Andaazan munafa (cost ke baad)</span></div>
            <div className="card stat"><b>{fmt(d.expenses)}</b><span>Kharche</span></div>
            <div className="card stat"><b>{fmt(d.profitAfterExpenses)}</b><span>Munafa kharche ke baad</span></div>
            <div className="card stat"><b>{fmt(d.stockValuationAtCost)}</b><span>Stock ki qeemat (cost par)</span></div>
          </div>
          <p className="muted">{d.estimatedProfitNote}</p>
          <div className="grid2">
            <div><h2>Payment methods</h2><table className="tbl"><tbody>{d.payments.map((p: any) => <tr key={p.method}><td>{p.method}</td><td className="right">{fmt(p.amount)}</td></tr>)}{d.payments.length === 0 && <tr><td className="muted">Data nahi</td></tr>}</tbody></table>
              <h2 className="mt">Kharche (category)</h2><table className="tbl"><tbody>{d.expensesByCategory.map((p: any) => <tr key={p.category}><td>{p.category}</td><td className="right">{fmt(p.amount)}</td></tr>)}{d.expensesByCategory.length === 0 && <tr><td className="muted">Data nahi</td></tr>}</tbody></table></div>
            <div><h2>Roz ki sale</h2><table className="tbl"><tbody>{d.byDay.map((p: any) => <tr key={p.day}><td>{p.day}</td><td>{p.count} bills</td><td className="right">{fmt(p.total)}</td></tr>)}{d.byDay.length === 0 && <tr><td className="muted">Data nahi</td></tr>}</tbody></table></div>
          </div>
          <h2 className="mt">Top dawaiyan</h2>
          <div className="scroll"><table className="tbl"><thead><tr><th>Dawai</th><th className="right">Qty</th><th className="right">Amdani</th></tr></thead><tbody>{d.topItems.map((t: any) => <tr key={t.name}><td>{t.name}</td><td className="right">{t.qty}</td><td className="right">{fmt(t.revenue)}</td></tr>)}</tbody></table></div>
        </>
      )}
    </>
  );
}

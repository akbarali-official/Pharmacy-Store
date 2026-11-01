import { dt, fmt } from '../ui';

// 80mm thermal printer ke liye; browser print (Ctrl+P) se chalta hai
export default function Receipt({ sale, settings }: { sale: any; settings: any }) {
  return (
    <div>
      <div className="receipt">
        <div className="c"><b>{settings.storeName}</b></div>
        {settings.address && <div className="c">{settings.address}</div>}
        {settings.phone && <div className="c">Tel: {settings.phone}</div>}
        {settings.receiptHeader && <div className="c">{settings.receiptHeader}</div>}
        <hr />
        <div>Invoice: {sale.invoiceNo}</div>
        <div>Date: {dt(sale.createdAt)}</div>
        <div>Cashier: {sale.cashier?.name}</div>
        {sale.customer && <div>Customer: {sale.customer.name}</div>}
        <hr />
        <table><tbody>
          {sale.items.map((i: any) => (
            <tr key={i.id}><td>{i.nameSnap}<br />{i.qty} x {Number(i.unitPrice)}</td><td className="r">{Number(i.lineTotal).toFixed(2)}</td></tr>
          ))}
        </tbody></table>
        <hr />
        <table><tbody>
          <tr><td>Subtotal</td><td className="r">{Number(sale.subtotal).toFixed(2)}</td></tr>
          {Number(sale.discount) > 0 && <tr><td>Discount</td><td className="r">-{Number(sale.discount).toFixed(2)}</td></tr>}
          <tr><td><b>TOTAL</b></td><td className="r"><b>{Number(sale.total).toFixed(2)}</b></td></tr>
          {sale.payments.map((p: any) => <tr key={p.id}><td>{p.method}</td><td className="r">{Number(p.amount).toFixed(2)}</td></tr>)}
          {Number(sale.changeDue) > 0 && <tr><td>Change</td><td className="r">{Number(sale.changeDue).toFixed(2)}</td></tr>}
        </tbody></table>
        <hr />
        <div className="c">{settings.receiptFooter}</div>
      </div>
      <div className="row mt" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => window.print()}>Print / Reprint</button>
        <span className="muted">Total {fmt(sale.total)}</span>
      </div>
    </div>
  );
}

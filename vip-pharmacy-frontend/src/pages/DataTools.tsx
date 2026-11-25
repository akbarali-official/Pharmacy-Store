import { useState } from 'react';
import { api, download } from '../api';
import { run, toast } from '../ui';

// ---------- CSV helpers (no external libraries) ----------
function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
const toCsv = (rows: any[][]) => '\uFEFF' + rows.map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
const saveText = (name: string, text: string) => { const u = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };

const ALIAS: Record<string, string> = {
  name: 'name', medicine: 'name', medicinename: 'name', product: 'name', productname: 'name', item: 'name',
  generic: 'genericName', genericname: 'genericName', salt: 'genericName', brand: 'brand', strength: 'strength', form: 'form', type: 'form',
  manufacturer: 'manufacturer', company: 'manufacturer', barcode: 'barcode', packsize: 'packSize', pack: 'packSize', category: 'category',
  purchaseprice: 'purchasePrice', costprice: 'purchasePrice', cost: 'purchasePrice', sellingprice: 'sellingPrice', saleprice: 'sellingPrice', price: 'sellingPrice', mrp: 'sellingPrice', retailprice: 'sellingPrice',
  reorderlevel: 'reorderLevel', minstock: 'reorderLevel', requiresprescription: 'requiresPrescription', prescription: 'requiresPrescription', rx: 'requiresPrescription',
  batchno: 'batchNo', batchnumber: 'batchNo', batch: 'batchNo', expirydate: 'expiryDate', expiry: 'expiryDate', exp: 'expiryDate',
  qty: 'qty', quantity: 'qty', stock: 'qty', openingstock: 'qty',
};
const normKey = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');

// 31/12/2027, 12/31/2027 (when day > 12 is unambiguous), 12/2027, 2027-12-31  ->  YYYY-MM-DD
function fixDate(v: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[\/.-](\d{4})$/);
  if (m) { const last = new Date(Number(m[2]), Number(m[1]), 0).getDate(); return `${m[2]}-${m[1].padStart(2, '0')}-${String(last).padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // DD/MM/YYYY
  return s;
}

const TEMPLATE = [
  ['name', 'genericName', 'strength', 'form', 'manufacturer', 'barcode', 'category', 'purchasePrice', 'sellingPrice', 'reorderLevel', 'requiresPrescription', 'batchNo', 'expiryDate', 'qty'],
  ['Panadol', 'Paracetamol', '500mg', 'Tablet', 'GSK', '', 'Pain & Fever', '2.5', '3.5', '50', 'no', 'B1001', '2028-06-30', '200'],
  ['Augmentin', 'Amoxicillin + Clavulanate', '625mg', 'Tablet', 'GSK', '', 'Antibiotics', '38', '55', '20', 'yes', 'A2002', '2027-12-31', '60'],
];
const CHUNK = 400;

export default function DataTools() {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [onDup, setOnDup] = useState<'skip' | 'update'>('skip');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<any>(null);

  const onFile = async (e: any) => {
    const f = e.target.files?.[0];
    setReport(null); setRows([]); setUnknown([]); setMissing([]);
    if (!f) return;
    setFileName(f.name);
    const table = parseCsv(await f.text());
    if (table.length < 2) return toast('The file has no data rows', 'err');
    const headers = table[0].map((h) => ALIAS[normKey(h)] || '');
    setUnknown(table[0].filter((_, i) => !headers[i]));
    const need = ['name', 'purchasePrice', 'sellingPrice'].filter((k) => !headers.includes(k));
    setMissing(need);
    const out = table.slice(1).map((r, idx) => {
      const o: any = { __row: idx + 2 };
      headers.forEach((k, i) => { if (k) o[k] = (r[i] ?? '').trim(); });
      if (o.expiryDate) o.expiryDate = fixDate(o.expiryDate);
      return o;
    });
    setRows(out);
  };

  const runImport = async (dryRun: boolean) => {
    setBusy(true); setProgress(0); setReport(null);
    const total = { created: 0, updated: 0, skipped: 0, batchesCreated: 0, errors: [] as any[], dryRun };
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const r = await api('/import/medicines', { method: 'POST', body: { rows: rows.slice(i, i + CHUNK), onDuplicate: onDup, dryRun } });
        total.created += r.created; total.updated += r.updated; total.skipped += r.skipped; total.batchesCreated += r.batchesCreated; total.errors.push(...r.errors);
        setProgress(Math.min(100, Math.round(((i + CHUNK) / rows.length) * 100)));
      }
      setReport(total);
      if (!dryRun) toast('Import finished');
    } catch (e: any) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const errorCsv = () => saveText('import-errors.csv', toCsv([['row', 'problem'], ...report.errors.map((x: any) => [x.row, x.message])]));

  return (
    <>
      <div className="top"><h1>Import & Export</h1></div>

      <div className="card">
        <h2>Import medicines from a CSV file</h2>
        <p className="muted">Use this to set up a new store quickly. In Excel choose <b>File → Save As → CSV UTF-8</b>, then select the file below. You can include opening stock (batch number, expiry date and quantity) in the same file.</p>
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn sec sm" onClick={() => saveText('medicines-template.csv', toCsv(TEMPLATE))}>⬇ Download template</button>
          <input type="file" accept=".csv,text/csv" onChange={onFile} aria-label="Choose CSV file" style={{ maxWidth: 360 }} />
        </div>

        {missing.length > 0 && <p className="err">Required column(s) not found: <b>{missing.join(', ')}</b>. Check the header row of your file or use the template.</p>}
        {unknown.length > 0 && <p className="muted">These columns were not recognised and will be ignored: {unknown.join(', ')}</p>}

        {rows.length > 0 && missing.length === 0 && (
          <>
            <p><b>{fileName}</b> — {rows.length} data row(s) found. Preview of the first rows:</p>
            <div className="scroll"><table className="tbl">
              <thead><tr><th>Row</th><th>Name</th><th>Strength</th><th>Form</th><th>Category</th><th className="right">Cost</th><th className="right">Price</th><th>Batch</th><th>Expiry</th><th className="right">Qty</th></tr></thead>
              <tbody>{rows.slice(0, 8).map((r) => <tr key={r.__row}><td>{r.__row}</td><td>{r.name}</td><td>{r.strength}</td><td>{r.form}</td><td>{r.category}</td><td className="right">{r.purchasePrice}</td><td className="right">{r.sellingPrice}</td><td>{r.batchNo}</td><td>{r.expiryDate}</td><td className="right">{r.qty}</td></tr>)}</tbody>
            </table></div>
            <div className="row mt">
              <label className="row"><span>If a medicine already exists:</span>
                <select value={onDup} onChange={(e) => setOnDup(e.target.value as any)} style={{ width: 230 }}>
                  <option value="skip">Skip it (keep what is in the system)</option>
                  <option value="update">Update its details and prices</option>
                </select>
              </label>
            </div>
            <div className="row mt">
              <button className="btn sec" disabled={busy} onClick={() => runImport(true)}>1. Check file (no changes made)</button>
              <button className="btn" disabled={busy || !report || report.dryRun === false || report.errors.length > 0 && report.created + report.updated === 0} onClick={() => { if (window.confirm(`Import ${rows.length} row(s) now?`)) runImport(false); }}>2. Import now</button>
              {busy && <span className="muted">Working… {progress}%</span>}
            </div>
          </>
        )}

        {report && (
          <div className="mt">
            <h3>{report.dryRun ? 'Check result (nothing has been imported yet)' : 'Import complete'}</h3>
            <div className="stats">
              <div className="card stat"><b>{report.created}</b><span>{report.dryRun ? 'Will be created' : 'Created'}</span></div>
              <div className="card stat"><b>{report.updated}</b><span>{report.dryRun ? 'Will be updated' : 'Updated'}</span></div>
              <div className="card stat"><b>{report.skipped}</b><span>Skipped (already exist)</span></div>
              <div className="card stat"><b>{report.batchesCreated}</b><span>{report.dryRun ? 'Stock batches to add' : 'Stock batches added'}</span></div>
              <div className={'card stat' + (report.errors.length ? ' bad' : '')}><b>{report.errors.length}</b><span>Rows with problems</span></div>
            </div>
            {report.errors.length > 0 && (
              <>
                <div className="scroll"><table className="tbl"><thead><tr><th>Row</th><th>Problem</th></tr></thead>
                  <tbody>{report.errors.slice(0, 50).map((x: any, i: number) => <tr key={i}><td>{x.row}</td><td>{x.message}</td></tr>)}</tbody></table></div>
                {report.errors.length > 50 && <p className="muted">Showing the first 50 problems.</p>}
                <button className="btn sec sm mt" onClick={errorCsv}>⬇ Download full problem list</button>
                <p className="muted">Rows with problems are skipped. Fix them in your file and import again; medicines that were already imported are skipped automatically.</p>
              </>
            )}
            {report.dryRun && report.errors.length === 0 && <p>✔ The file looks good. Click <b>Import now</b>.</p>}
          </div>
        )}
      </div>

      <div className="card mt">
        <h2>Export your data</h2>
        <p className="muted">Download your data as CSV files (opens in Excel). The medicines file can be re-imported later.</p>
        <div className="row">
          <button className="btn sec" onClick={() => run(() => download('/export/medicines.csv', 'medicines.csv'))}>⬇ Medicines</button>
          <button className="btn sec" onClick={() => run(() => download('/export/customers.csv', 'customers.csv'))}>⬇ Customers</button>
          <button className="btn sec" onClick={() => run(() => download('/export/suppliers.csv', 'suppliers.csv'))}>⬇ Suppliers</button>
          <button className="btn sec" onClick={() => run(() => download('/reports/stock.csv', 'stock.csv'))}>⬇ Stock (by batch)</button>
          <button className="btn sec" onClick={() => run(() => download('/reports/sales.csv', 'sales.csv'))}>⬇ Sales (last 7 days)</button>
        </div>
      </div>
    </>
  );
}

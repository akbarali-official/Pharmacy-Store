import { Router } from 'express';
import { z } from 'zod';
import { prisma, D } from '../db';
import { auth, wrap, audit, HttpError } from '../middleware';

export const r = Router();
const IMPORT_ROLES = ['OWNER', 'MANAGER', 'INVENTORY'];
const MED_EXPORT = ['OWNER', 'MANAGER', 'INVENTORY', 'PHARMACIST', 'ACCOUNTANT'];
const PEOPLE_EXPORT = ['OWNER', 'MANAGER', 'ACCOUNTANT'];

const csvCell = (v: any) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formula-injection protection
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const sendCsv = (res: any, filename: string, header: string[], rows: any[][]) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + [header.join(','), ...rows.map((x) => x.map(csvCell).join(','))].join('\n'));
};

// ---------------- Import ----------------
const opt = (max: number) => z.string().trim().max(max).optional();
const rowSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(120),
  genericName: opt(120), brand: opt(120), strength: opt(40), form: opt(40), manufacturer: opt(120),
  barcode: opt(60), packSize: opt(40), category: opt(60),
  purchasePrice: z.coerce.number({ invalid_type_error: 'must be a number' }).min(0),
  sellingPrice: z.coerce.number({ invalid_type_error: 'must be a number' }).min(0),
  reorderLevel: z.coerce.number().int().min(0).optional(),
  requiresPrescription: z.union([z.boolean(), z.string()]).optional(),
  batchNo: opt(40), expiryDate: opt(20), qty: z.coerce.number().int().min(0).optional(),
});
const truthy = (v: any) => v === true || /^(1|y|yes|true|rx|required)$/i.test(String(v ?? '').trim());
const keyOf = (n: string, s?: string | null, f?: string | null) => [n, s || '', f || ''].map((x) => x.trim().toLowerCase()).join('|');

r.post('/import/medicines', auth(...IMPORT_ROLES), wrap(async (req: any, res: any) => {
  const b = z.object({
    rows: z.array(z.record(z.any())).min(1).max(500),
    onDuplicate: z.enum(['skip', 'update']).default('skip'),
    dryRun: z.boolean().default(false),
  }).parse(req.body);
  const branchId = req.user.branchId;
  const errors: { row: number; message: string }[] = [];
  const good: any[] = [];
  const seen = new Map<string, number>();

  b.rows.forEach((raw, i) => {
    const rowNo = Number(raw.__row) || i + 1;
    const clean: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === '__row') continue;
      clean[k] = typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v;
    }
    const p = rowSchema.safeParse(clean);
    if (!p.success) { errors.push({ row: rowNo, message: p.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`).join('; ') }); return; }
    const d = p.data;
    if ((d.qty || 0) > 0) {
      if (!d.batchNo) { errors.push({ row: rowNo, message: 'batchNo is required when qty is greater than 0' }); return; }
      if (!d.expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(d.expiryDate) || Number.isNaN(+new Date(d.expiryDate))) { errors.push({ row: rowNo, message: 'expiryDate must be a valid date (YYYY-MM-DD) when qty is greater than 0' }); return; }
    }
    const key = d.barcode ? 'bc:' + d.barcode : keyOf(d.name, d.strength, d.form);
    if (seen.has(key)) { errors.push({ row: rowNo, message: `duplicate of row ${seen.get(key)} in this file` }); return; }
    seen.set(key, rowNo);
    good.push({ ...d, rowNo, rx: truthy(d.requiresPrescription) });
  });

  // match against what already exists
  const existingMeds = await prisma.medicine.findMany({ select: { id: true, name: true, strength: true, form: true, barcode: true } });
  const byBarcode = new Map(existingMeds.filter((m) => m.barcode).map((m) => [m.barcode as string, m]));
  const byKey = new Map(existingMeds.map((m) => [keyOf(m.name, m.strength, m.form), m]));
  const toCreate: any[] = [], toUpdate: any[] = [];
  let skipped = 0;
  for (const g of good) {
    const ex = (g.barcode && byBarcode.get(g.barcode)) || byKey.get(keyOf(g.name, g.strength, g.form));
    if (!ex) toCreate.push(g);
    else if (b.onDuplicate === 'update') toUpdate.push({ ...g, id: ex.id });
    else skipped++;
  }
  const withBatch = [...toCreate, ...toUpdate].filter((g) => (g.qty || 0) > 0);
  if (b.dryRun) return res.json({ dryRun: true, created: toCreate.length, updated: toUpdate.length, skipped, batchesCreated: withBatch.length, errors });

  const result = await prisma.$transaction(async (tx) => {
    // categories: find or create
    const wanted = [...new Set([...toCreate, ...toUpdate].map((g) => g.category).filter(Boolean) as string[])];
    const cats = await tx.category.findMany();
    const catId = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
    const missing = wanted.filter((n) => !catId.has(n.toLowerCase()));
    if (missing.length) {
      await tx.category.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
      (await tx.category.findMany()).forEach((c) => catId.set(c.name.toLowerCase(), c.id));
    }
    const base = Date.now().toString(36).toUpperCase();
    const fields = (g: any) => ({
      name: g.name, genericName: g.genericName ?? null, brand: g.brand ?? null, strength: g.strength ?? null, form: g.form ?? null,
      manufacturer: g.manufacturer ?? null, packSize: g.packSize ?? null, purchasePrice: D(g.purchasePrice), sellingPrice: D(g.sellingPrice),
      requiresPrescription: g.rx, categoryId: g.category ? catId.get(g.category.toLowerCase()) ?? null : null,
      ...(g.reorderLevel !== undefined ? { reorderLevel: g.reorderLevel } : {}),
    });
    const skuOf = new Map<number, string>();
    if (toCreate.length) {
      await tx.medicine.createMany({
        data: toCreate.map((g) => { const sku = `MED-${base}-${g.rowNo}`; skuOf.set(g.rowNo, sku); return { ...fields(g), barcode: g.barcode ?? null, sku }; }),
      });
    }
    for (const g of toUpdate) await tx.medicine.update({ where: { id: g.id }, data: fields(g) });

    // resolve ids for rows that carry opening stock
    const created = toCreate.length ? await tx.medicine.findMany({ where: { sku: { in: [...skuOf.values()] } }, select: { id: true, sku: true } }) : [];
    const idBySku = new Map(created.map((m) => [m.sku, m.id]));
    const stockRows = withBatch.map((g) => ({ medicineId: g.id ?? (idBySku.get(skuOf.get(g.rowNo) as string) as number), g }));
    let batchesCreated = 0;
    if (stockRows.length) {
      const ids = [...new Set(stockRows.map((s) => s.medicineId))];
      const existing = await tx.batch.findMany({ where: { branchId, medicineId: { in: ids } }, select: { medicineId: true, batchNo: true } });
      const have = new Set(existing.map((e) => e.medicineId + '|' + e.batchNo));
      const fresh = stockRows.filter((s) => !have.has(s.medicineId + '|' + s.g.batchNo));
      if (fresh.length) {
        await tx.batch.createMany({
          data: fresh.map((s) => ({ medicineId: s.medicineId, branchId, batchNo: s.g.batchNo, expiryDate: new Date(s.g.expiryDate), costPrice: D(s.g.purchasePrice), receivedQty: s.g.qty, availableQty: s.g.qty })),
          skipDuplicates: true,
        });
        const made = await tx.batch.findMany({ where: { branchId, medicineId: { in: ids } }, select: { id: true, medicineId: true, batchNo: true } });
        const idByKey = new Map(made.map((m) => [m.medicineId + '|' + m.batchNo, m.id]));
        await tx.stockMovement.createMany({
          data: fresh.map((s) => ({ batchId: idByKey.get(s.medicineId + '|' + s.g.batchNo) as number, medicineId: s.medicineId, branchId, type: 'ADJUST_IN' as const, qty: s.g.qty, reason: 'Import: opening stock', userId: req.user.id })),
        });
        batchesCreated = fresh.length;
      }
    }
    return { created: toCreate.length, updated: toUpdate.length, skipped, batchesCreated };
  }, { timeout: 30000 });

  await audit(req, 'IMPORT', 'Medicine', null, { ...result, errors: errors.length });
  res.json({ dryRun: false, ...result, errors });
}));

// ---------------- Export ----------------
r.get('/export/medicines.csv', auth(...MED_EXPORT), wrap(async (_req: any, res: any) => {
  const meds = await prisma.medicine.findMany({ where: { active: true }, include: { category: true }, orderBy: { name: 'asc' } });
  sendCsv(res, 'medicines.csv',
    ['name', 'genericName', 'brand', 'strength', 'form', 'manufacturer', 'barcode', 'packSize', 'category', 'purchasePrice', 'sellingPrice', 'reorderLevel', 'requiresPrescription'],
    meds.map((m) => [m.name, m.genericName, m.brand, m.strength, m.form, m.manufacturer, m.barcode, m.packSize, m.category?.name, m.purchasePrice, m.sellingPrice, m.reorderLevel, m.requiresPrescription ? 'yes' : 'no']));
}));
r.get('/export/customers.csv', auth(...PEOPLE_EXPORT), wrap(async (_req: any, res: any) => {
  const rows = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
  sendCsv(res, 'customers.csv', ['name', 'phone', 'email', 'address', 'notes', 'createdAt'], rows.map((c) => [c.name, c.phone, c.email, c.address, c.notes, c.createdAt.toISOString().slice(0, 10)]));
}));
r.get('/export/suppliers.csv', auth(...PEOPLE_EXPORT), wrap(async (_req: any, res: any) => {
  const rows = await prisma.supplier.findMany({ orderBy: { name: 'asc' } });
  sendCsv(res, 'suppliers.csv', ['name', 'phone', 'email', 'address', 'paymentTerms', 'notes'], rows.map((s) => [s.name, s.phone, s.email, s.address, s.paymentTerms, s.notes]));
}));

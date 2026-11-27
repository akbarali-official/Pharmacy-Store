import { Router } from 'express';
import { z } from 'zod';
import { prisma, D } from '../db';
import { auth, wrap, audit, HttpError } from '../middleware';

export const r = Router();
const sc = prisma as any;
const num = (v: any) => Number(v ?? 0);
const COUNTERS = ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY'];
const VIEW = [...COUNTERS, 'ACCOUNTANT'];
const APPROVE = ['OWNER', 'MANAGER'];

const csvCell = (v: any) => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

async function loadCount(id: number, branchId: number) {
  const count = await sc.stockCount.findFirst({ where: { id, branchId } });
  if (!count) throw new HttpError(404, 'Stock count not found');
  const items = await sc.stockCountItem.findMany({
    where: { countId: id },
    include: { batch: { select: { batchNo: true, expiryDate: true, costPrice: true, availableQty: true, medicine: { select: { name: true, strength: true, form: true } } } } },
  });
  const rows = items.map((i: any) => {
    const variance = i.countedQty == null ? null : i.countedQty - i.systemQty;
    return {
      id: i.id, batchId: i.batchId, medicine: i.batch.medicine.name + (i.batch.medicine.strength ? ' ' + i.batch.medicine.strength : ''), form: i.batch.medicine.form,
      batchNo: i.batch.batchNo, expiryDate: i.batch.expiryDate, systemQty: i.systemQty, countedQty: i.countedQty, variance,
      unitCost: num(i.batch.costPrice), varianceValue: variance == null ? null : variance * num(i.batch.costPrice),
    };
  }).sort((a: any, b: any) => a.medicine.localeCompare(b.medicine) || String(a.expiryDate).localeCompare(String(b.expiryDate)));
  const counted = rows.filter((x: any) => x.countedQty != null);
  const diffs = counted.filter((x: any) => x.variance !== 0);
  return {
    count, rows,
    summary: {
      total: rows.length, counted: counted.length, uncounted: rows.length - counted.length, withDifferences: diffs.length,
      varianceUnits: diffs.reduce((s: number, x: any) => s + x.variance, 0),
      varianceValue: diffs.reduce((s: number, x: any) => s + x.varianceValue, 0),
      shortageValue: diffs.filter((x: any) => x.variance < 0).reduce((s: number, x: any) => s + x.varianceValue, 0),
      surplusValue: diffs.filter((x: any) => x.variance > 0).reduce((s: number, x: any) => s + x.varianceValue, 0),
    },
  };
}

r.get('/stock-counts', auth(...VIEW), wrap(async (req: any, res: any) => {
  const counts = await sc.stockCount.findMany({ where: { branchId: req.user.branchId }, orderBy: { id: 'desc' }, take: 50 });
  const ids = counts.map((c: any) => c.id);
  const [tot, done] = await Promise.all([
    sc.stockCountItem.groupBy({ by: ['countId'], where: { countId: { in: ids } }, _count: { _all: true } }),
    sc.stockCountItem.groupBy({ by: ['countId'], where: { countId: { in: ids }, countedQty: { not: null } }, _count: { _all: true } }),
  ]);
  const t = new Map(tot.map((x: any) => [x.countId, x._count._all])), d = new Map(done.map((x: any) => [x.countId, x._count._all]));
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(counts.map((c: any) => c.userId))] as number[] } }, select: { id: true, name: true } });
  const nm = new Map(users.map((u) => [u.id, u.name]));
  res.json(counts.map((c: any) => ({ ...c, varianceValue: num(c.varianceValue), startedBy: nm.get(c.userId) || '', totalItems: t.get(c.id) || 0, countedItems: d.get(c.id) || 0 })));
}));

r.post('/stock-counts', auth(...COUNTERS), wrap(async (req: any, res: any) => {
  const b = z.object({ note: z.string().max(200).optional(), categoryId: z.number().int().optional() }).parse(req.body);
  const branchId = req.user.branchId;
  const open = await sc.stockCount.findFirst({ where: { branchId, status: 'OPEN' } });
  if (open) throw new HttpError(409, `A stock count is already in progress (count #${open.id}). Complete or cancel it first.`);
  const batches = await prisma.batch.findMany({ where: { branchId, availableQty: { gt: 0 }, ...(b.categoryId ? { medicine: { categoryId: b.categoryId } } : {}) }, select: { id: true, availableQty: true } });
  if (!batches.length) throw new HttpError(422, 'There is no stock to count' + (b.categoryId ? ' in that category' : ''));
  const created = await prisma.$transaction(async (tx: any) => {
    const c = await tx.stockCount.create({ data: { branchId, userId: req.user.id, categoryId: b.categoryId ?? null, note: b.note } });
    await tx.stockCountItem.createMany({ data: batches.map((x) => ({ countId: c.id, batchId: x.id, systemQty: x.availableQty })) });
    return c;
  }, { timeout: 30000 });
  await audit(req, 'START', 'StockCount', created.id, { items: batches.length });
  res.json(created);
}));

r.get('/stock-counts/:id', auth(...VIEW), wrap(async (req: any, res: any) => res.json(await loadCount(Number(req.params.id), req.user.branchId))));

r.patch('/stock-counts/:id/items', auth(...COUNTERS), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const b = z.object({ items: z.array(z.object({ id: z.number().int(), countedQty: z.number().int().min(0).max(1000000).nullable() })).min(1).max(1000) }).parse(req.body);
  const count = await sc.stockCount.findFirst({ where: { id, branchId: req.user.branchId } });
  if (!count) throw new HttpError(404, 'Stock count not found');
  if (count.status !== 'OPEN') throw new HttpError(409, 'This stock count is already closed');
  await prisma.$transaction(b.items.map((i) => sc.stockCountItem.updateMany({ where: { id: i.id, countId: id }, data: { countedQty: i.countedQty } })));
  res.json({ ok: true, saved: b.items.length });
}));

r.post('/stock-counts/:id/complete', auth(...APPROVE), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id), branchId = req.user.branchId;
  const result = await prisma.$transaction(async (tx: any) => {
    const flip = await tx.stockCount.updateMany({ where: { id, branchId, status: 'OPEN' }, data: { status: 'COMPLETED', completedAt: new Date(), completedById: req.user.id } });
    if (flip.count === 0) throw new HttpError(409, 'This stock count is not open (already completed or cancelled)');
    const items = await tx.stockCountItem.findMany({ where: { countId: id, countedQty: { not: null } }, include: { batch: { select: { batchNo: true, medicineId: true, costPrice: true, medicine: { select: { name: true } } } } } });
    let units = 0, value = 0, adjusted = 0;
    for (const i of items) {
      const diff = i.countedQty - i.systemQty;
      if (diff === 0) continue;
      if (diff > 0) await tx.batch.update({ where: { id: i.batchId }, data: { availableQty: { increment: diff } } });
      else {
        const ok = await tx.batch.updateMany({ where: { id: i.batchId, availableQty: { gte: -diff } }, data: { availableQty: { decrement: -diff } } });
        if (ok.count === 0) throw new HttpError(409, `${i.batch.medicine.name} (batch ${i.batch.batchNo}): stock changed since the count started, so the shortage cannot be applied. Cancel this count and recount.`);
      }
      await tx.stockMovement.create({ data: { batchId: i.batchId, medicineId: i.batch.medicineId, branchId, type: diff > 0 ? 'ADJUST_IN' : 'ADJUST_OUT', qty: diff, reason: `Stock count #${id}`, refType: 'STOCK_COUNT', refId: id, userId: req.user.id } });
      units += diff; value += diff * num(i.batch.costPrice); adjusted++;
    }
    await tx.stockCount.update({ where: { id }, data: { varianceUnits: units, varianceValue: D(value).toDecimalPlaces(2) } });
    return { adjusted, varianceUnits: units, varianceValue: value, uncounted: await tx.stockCountItem.count({ where: { countId: id, countedQty: null } }) };
  }, { timeout: 60000 });
  await audit(req, 'COMPLETE', 'StockCount', id, result);
  res.json(result);
}));

r.post('/stock-counts/:id/cancel', auth(...APPROVE), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const x = await sc.stockCount.updateMany({ where: { id, branchId: req.user.branchId, status: 'OPEN' }, data: { status: 'CANCELLED' } });
  if (!x.count) throw new HttpError(409, 'Only an open stock count can be cancelled');
  await audit(req, 'CANCEL', 'StockCount', id);
  res.json({ ok: true });
}));

r.get('/stock-counts/:id/export.csv', auth(...VIEW), wrap(async (req: any, res: any) => {
  const { rows } = await loadCount(Number(req.params.id), req.user.branchId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stock-count-${req.params.id}.csv"`);
  res.send('\uFEFF' + ['Medicine,Batch,Expiry,System qty,Counted qty,Variance,Unit cost,Variance value',
    ...rows.map((x: any) => [x.medicine, x.batchNo, String(x.expiryDate).slice(0, 10), x.systemQty, x.countedQty ?? '', x.variance ?? '', x.unitCost, x.varianceValue ?? ''].map(csvCell).join(','))].join('\n'));
}));

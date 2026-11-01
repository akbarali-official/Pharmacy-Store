import { Router } from 'express';
import { z } from 'zod';
import { prisma, D } from '../db';
import { auth, GROUPS, wrap, audit, HttpError, pageOf } from '../middleware';
import { todayDate, takeFromBatch, validBatchWhere } from '../stock';
import { getSettings } from './settings';

export const r = Router();

r.get('/inventory/batches', auth(...GROUPS.all), wrap(async (req: any, res: any) => {
  const { filter, medicineId } = req.query;
  const { page, pageSize, skip, take } = pageOf(req.query);
  const s = await getSettings();
  const soon = new Date(todayDate().getTime() + Number(s.nearExpiryDays) * 86400000);
  const where: any = { branchId: req.user.branchId };
  if (medicineId) where.medicineId = Number(medicineId);
  if (filter === 'expired') Object.assign(where, { expiryDate: { lt: todayDate() }, availableQty: { gt: 0 } });
  if (filter === 'expiring') Object.assign(where, { expiryDate: { gte: todayDate(), lte: soon }, availableQty: { gt: 0 } });
  if (filter === 'instock') where.availableQty = { gt: 0 };
  const [total, items] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({ where, include: { medicine: { select: { name: true, strength: true, sku: true } } }, orderBy: [{ expiryDate: 'asc' }], skip, take }),
  ]);
  res.json({ total, page, pageSize, items });
}));

r.get('/inventory/alerts', auth(...GROUPS.all), wrap(async (req: any, res: any) => {
  const branchId = req.user.branchId;
  const meds = await prisma.medicine.findMany({ where: { active: true }, select: { id: true, name: true, strength: true, reorderLevel: true } });
  const sums = await prisma.batch.groupBy({ by: ['medicineId'], where: validBatchWhere(branchId) as any, _sum: { availableQty: true } });
  const map = new Map(sums.map((x) => [x.medicineId, x._sum.availableQty || 0]));
  const withStock = meds.map((m) => ({ ...m, stock: map.get(m.id) || 0 }));
  const s = await getSettings();
  const soon = new Date(todayDate().getTime() + Number(s.nearExpiryDays) * 86400000);
  const inc = { medicine: { select: { name: true, strength: true } } };
  const [nearExpiry, expired] = await Promise.all([
    prisma.batch.findMany({ where: { branchId, availableQty: { gt: 0 }, expiryDate: { gte: todayDate(), lte: soon } }, include: inc, orderBy: { expiryDate: 'asc' }, take: 100 }),
    prisma.batch.findMany({ where: { branchId, availableQty: { gt: 0 }, expiryDate: { lt: todayDate() } }, include: inc, orderBy: { expiryDate: 'asc' }, take: 100 }),
  ]);
  res.json({
    outOfStock: withStock.filter((m) => m.stock === 0),
    lowStock: withStock.filter((m) => m.stock > 0 && m.stock <= m.reorderLevel),
    nearExpiry,
    expired,
  });
}));

// Opening stock / manual stock-in (purchase ke baghair)
r.post('/inventory/batches', auth(...GROUPS.stock), wrap(async (req: any, res: any) => {
  const b = z.object({ medicineId: z.number().int(), batchNo: z.string().min(1).max(40), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), qty: z.number().int().positive(), costPrice: z.number().min(0), reason: z.string().max(200).default('Opening stock') }).parse(req.body);
  const branchId = req.user.branchId;
  const batch = await prisma.$transaction(async (tx) => {
    const exist = await tx.batch.findUnique({ where: { medicineId_branchId_batchNo: { medicineId: b.medicineId, branchId, batchNo: b.batchNo } } });
    const row = exist
      ? await tx.batch.update({ where: { id: exist.id }, data: { availableQty: { increment: b.qty }, receivedQty: { increment: b.qty } } })
      : await tx.batch.create({ data: { medicineId: b.medicineId, branchId, batchNo: b.batchNo, expiryDate: new Date(b.expiryDate), costPrice: D(b.costPrice), receivedQty: b.qty, availableQty: b.qty } });
    await tx.stockMovement.create({ data: { batchId: row.id, medicineId: b.medicineId, branchId, type: 'ADJUST_IN', qty: b.qty, reason: b.reason, userId: req.user.id } });
    return row;
  });
  await audit(req, 'STOCK_IN', 'Batch', batch.id, { qty: b.qty });
  res.json(batch);
}));

// Adjustment: reason lazmi, minus mein stock negative nahi ho sakta
r.post('/inventory/adjust', auth(...GROUPS.stock), wrap(async (req: any, res: any) => {
  const b = z.object({ batchId: z.number().int(), delta: z.number().int().refine((n) => n !== 0, 'delta 0 nahi ho sakta'), reason: z.string().min(3).max(200) }).parse(req.body);
  await prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findFirst({ where: { id: b.batchId, branchId: req.user.branchId } });
    if (!batch) throw new HttpError(404, 'Batch nahi mili');
    if (b.delta < 0) await takeFromBatch(tx, batch.id, -b.delta);
    else await tx.batch.update({ where: { id: batch.id }, data: { availableQty: { increment: b.delta } } });
    await tx.stockMovement.create({ data: { batchId: batch.id, medicineId: batch.medicineId, branchId: batch.branchId, type: b.delta > 0 ? 'ADJUST_IN' : 'ADJUST_OUT', qty: b.delta, reason: b.reason, userId: req.user.id } });
  });
  await audit(req, 'ADJUST', 'Batch', b.batchId, { delta: b.delta, reason: b.reason });
  res.json({ ok: true });
}));

r.patch('/inventory/batches/:id', auth(...GROUPS.stock), wrap(async (req: any, res: any) => {
  const b = z.object({ status: z.enum(['ACTIVE', 'QUARANTINE']) }).parse(req.body);
  const id = Number(req.params.id);
  const row = await prisma.batch.updateMany({ where: { id, branchId: req.user.branchId }, data: { status: b.status } });
  if (!row.count) throw new HttpError(404, 'Batch nahi mili');
  await audit(req, 'BATCH_STATUS', 'Batch', id, b);
  res.json({ ok: true });
}));

r.get('/inventory/movements', auth(...GROUPS.stock, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const { page, pageSize, skip, take } = pageOf(req.query);
  const where: any = { branchId: req.user.branchId };
  if (req.query.batchId) where.batchId = Number(req.query.batchId);
  const [total, items] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({ where, orderBy: { id: 'desc' }, skip, take, include: { batch: { select: { batchNo: true, medicine: { select: { name: true } } } } } }),
  ]);
  res.json({ total, page, pageSize, items });
}));

// Reconcile: har batch ka balance = movements ka jama? Farq ho to dikhao
r.get('/inventory/reconcile', auth(...GROUPS.boss, 'ACCOUNTANT', 'INVENTORY'), wrap(async (req: any, res: any) => {
  const batches = await prisma.batch.findMany({ where: { branchId: req.user.branchId }, include: { medicine: { select: { name: true } } } });
  const sums = await prisma.stockMovement.groupBy({ by: ['batchId'], where: { branchId: req.user.branchId }, _sum: { qty: true } });
  const m = new Map(sums.map((s) => [s.batchId, s._sum.qty || 0]));
  const bad = batches
    .filter((b) => (m.get(b.id) || 0) !== b.availableQty)
    .map((b) => ({ batchId: b.id, medicine: b.medicine.name, batchNo: b.batchNo, balance: b.availableQty, movementsTotal: m.get(b.id) || 0 }));
  res.json({ checked: batches.length, mismatches: bad });
}));

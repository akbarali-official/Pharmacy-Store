import { Router } from 'express';
import { z } from 'zod';
import { prisma, D } from '../db';
import { auth, wrap, audit, HttpError } from '../middleware';
import { takeFromBatch } from '../stock';

export const r = Router();
const num = (v: any) => Number(v ?? 0);
const VIEW = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'INVENTORY'];
const PAY = ['OWNER', 'MANAGER', 'ACCOUNTANT'];
const RETURN = ['OWNER', 'MANAGER', 'INVENTORY'];
const sumMap = (rows: any[], key: string) => new Map<number, number>(rows.map((x) => [x.supplierId, num(x._sum[key])]));

// ---------- Supplier balances: purchased - returned - paid ----------
r.get('/payables', auth(...VIEW), wrap(async (req: any, res: any) => {
  const branchId = req.user.branchId;
  const [suppliers, bought, returned, paid] = await Promise.all([
    prisma.supplier.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.purchase.groupBy({ by: ['supplierId'], where: { branchId, status: 'RECEIVED' }, _sum: { total: true } }),
    prisma.purchaseReturn.groupBy({ by: ['supplierId'], where: { branchId }, _sum: { total: true } }),
    prisma.supplierPayment.groupBy({ by: ['supplierId'], where: { branchId }, _sum: { amount: true } }),
  ]);
  const b = sumMap(bought, 'total'), rt = sumMap(returned, 'total'), p = sumMap(paid, 'amount');
  const items = suppliers.map((s) => {
    const purchased = b.get(s.id) || 0, ret = rt.get(s.id) || 0, pd = p.get(s.id) || 0;
    return { id: s.id, name: s.name, phone: s.phone, paymentTerms: s.paymentTerms, purchased, returned: ret, paid: pd, balance: purchased - ret - pd };
  });
  res.json({ items, totalPayable: items.reduce((t, i) => t + Math.max(i.balance, 0), 0) });
}));

// ---------- Statement (chronological ledger with running balance) ----------
r.get('/payables/:id/statement', auth(...VIEW), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id), branchId = req.user.branchId;
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new HttpError(404, 'Supplier not found');
  const [pur, ret, pay] = await Promise.all([
    prisma.purchase.findMany({ where: { supplierId: id, branchId, status: 'RECEIVED' }, select: { id: true, invoiceNo: true, purchaseDate: true, total: true } }),
    prisma.purchaseReturn.findMany({ where: { supplierId: id, branchId }, select: { id: true, reason: true, total: true, createdAt: true } }),
    prisma.supplierPayment.findMany({ where: { supplierId: id, branchId }, select: { id: true, amount: true, method: true, reference: true, note: true, paidAt: true } }),
  ]);
  const rows: any[] = [
    ...pur.map((x) => ({ date: x.purchaseDate, type: 'Purchase', ref: x.invoiceNo || 'PO-' + x.id, note: '', charge: num(x.total), credit: 0 })),
    ...ret.map((x) => ({ date: x.createdAt, type: 'Purchase return', ref: 'PR-' + x.id, note: x.reason, charge: 0, credit: num(x.total) })),
    ...pay.map((x) => ({ date: x.paidAt, type: 'Payment (' + x.method + ')', ref: x.reference || 'PAY-' + x.id, note: x.note || '', charge: 0, credit: num(x.amount) })),
  ].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  let bal = 0;
  rows.forEach((x) => { bal += x.charge - x.credit; x.balance = bal; });
  res.json({ supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone }, rows, balance: bal });
}));

// ---------- Record a payment to a supplier ----------
r.post('/payables/:id/payments', auth(...PAY), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const b = z.object({
    amount: z.number().positive(), method: z.enum(['CASH', 'CARD', 'BANK', 'OTHER']).default('BANK'),
    reference: z.string().max(80).optional(), note: z.string().max(200).optional(), paidAt: z.string().optional(),
  }).parse(req.body);
  if (!(await prisma.supplier.findUnique({ where: { id } }))) throw new HttpError(404, 'Supplier not found');
  const p = await prisma.supplierPayment.create({
    data: { supplierId: id, branchId: req.user.branchId, userId: req.user.id, amount: D(b.amount), method: b.method, reference: b.reference, note: b.note, paidAt: b.paidAt ? new Date(b.paidAt) : new Date() },
  });
  await audit(req, 'CREATE', 'SupplierPayment', p.id, { supplierId: id, amount: b.amount, method: b.method });
  res.json(p);
}));

// ---------- Purchase returns (stock leaves, supplier balance decreases) ----------
r.get('/purchase-returns', auth(...VIEW), wrap(async (req: any, res: any) => {
  res.json(await prisma.purchaseReturn.findMany({
    where: { branchId: req.user.branchId }, orderBy: { id: 'desc' }, take: 100,
    include: { supplier: { select: { name: true } }, items: { include: { batch: { select: { batchNo: true, expiryDate: true, medicine: { select: { name: true, strength: true } } } } } } },
  }));
}));

r.post('/purchase-returns', auth(...RETURN), wrap(async (req: any, res: any) => {
  const b = z.object({
    supplierId: z.number().int(), reason: z.string().min(3).max(200),
    items: z.array(z.object({ batchId: z.number().int(), qty: z.number().int().positive() })).min(1).max(50),
  }).parse(req.body);
  const branchId = req.user.branchId;
  const created = await prisma.$transaction(async (tx) => {
    if (!(await tx.supplier.findUnique({ where: { id: b.supplierId } }))) throw new HttpError(404, 'Supplier not found');
    const merged = new Map<number, number>();
    b.items.forEach((i) => merged.set(i.batchId, (merged.get(i.batchId) || 0) + i.qty));
    const batches = await tx.batch.findMany({ where: { id: { in: [...merged.keys()] }, branchId } });
    if (batches.length !== merged.size) throw new HttpError(400, 'One of the selected batches was not found');
    let total = D(0);
    const rows: any[] = [];
    for (const bt of batches) {
      const qty = merged.get(bt.id)!;
      await takeFromBatch(tx, bt.id, qty); // atomic: stock can never go negative
      total = total.add(bt.costPrice.mul(qty));
      rows.push({ batchId: bt.id, medicineId: bt.medicineId, qty, unitCost: bt.costPrice });
    }
    const ret = await tx.purchaseReturn.create({
      data: { supplierId: b.supplierId, branchId, userId: req.user.id, reason: b.reason, total: total.toDecimalPlaces(2), items: { create: rows.map((x) => ({ batchId: x.batchId, qty: x.qty, unitCost: x.unitCost })) } },
    });
    await tx.stockMovement.createMany({
      data: rows.map((x) => ({ batchId: x.batchId, medicineId: x.medicineId, branchId, type: 'ADJUST_OUT' as const, qty: -x.qty, reason: 'Purchase return: ' + b.reason, refType: 'PURCHASE_RETURN', refId: ret.id, userId: req.user.id })),
    });
    return ret;
  });
  await audit(req, 'CREATE', 'PurchaseReturn', created.id, { supplierId: b.supplierId, total: String(created.total) });
  res.json(created);
}));

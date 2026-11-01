import { Router } from 'express';
import { z } from 'zod';
import { prisma, D } from '../db';
import { auth, GROUPS, wrap, audit, HttpError, pageOf } from '../middleware';
import { allocateFefo, takeFromBatch, nextNumber, todayDate } from '../stock';
import { getSettings } from './settings';

export const r = Router();
const METHOD = z.enum(['CASH', 'CARD', 'BANK', 'OTHER']);

// ================= CHECKOUT (ek transaction, FEFO, oversell-safe) =================
r.post('/pos/checkout', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = z.object({
    items: z.array(z.object({ medicineId: z.number().int(), qty: z.number().int().positive().max(10000) })).min(1).max(100),
    discount: z.number().min(0).default(0),
    payments: z.array(z.object({ method: METHOD, amount: z.number().positive() })).min(1),
    customerId: z.number().int().optional(),
    note: z.string().max(300).optional(),
    prescriptionVerified: z.boolean().optional(),
  }).parse(req.body);
  const user = req.user;

  const merged = new Map<number, number>();
  b.items.forEach((i) => merged.set(i.medicineId, (merged.get(i.medicineId) || 0) + i.qty));

  const saleId = await prisma.$transaction(async (tx) => {
    const meds = await tx.medicine.findMany({ where: { id: { in: [...merged.keys()] }, active: true } });
    if (meds.length !== merged.size) throw new HttpError(400, 'Koi dawai mojood nahi ya inactive hai');
    if (meds.some((m) => m.requiresPrescription) && !b.prescriptionVerified)
      throw new HttpError(422, 'Prescription wali dawai hai: pehle prescription check karke tick karein');

    const lines: any[] = [];
    let subtotal = D(0);
    for (const m of meds) {
      const alloc = await allocateFefo(tx, m.id, user.branchId, merged.get(m.id)!, m.name);
      for (const a of alloc) {
        await takeFromBatch(tx, a.batch.id, a.qty);
        const lineTotal = m.sellingPrice.mul(a.qty);
        subtotal = subtotal.add(lineTotal);
        lines.push({ m, a, lineTotal });
      }
    }
    const discount = D(b.discount).toDecimalPlaces(2);
    if (discount.gt(subtotal)) throw new HttpError(422, 'Discount bill se zyada nahi ho sakta');
    const total = subtotal.sub(discount).toDecimalPlaces(2);

    const paid = b.payments.reduce((s, p) => s.add(D(p.amount)), D(0));
    if (paid.lt(total)) throw new HttpError(422, 'Payment poori nahi hai');
    const change = paid.sub(total);
    const pays = b.payments.map((p) => ({ method: p.method, amount: D(p.amount) }));
    if (change.gt(0)) {
      const cash = pays.find((p) => p.method === 'CASH' && p.amount.gte(change));
      if (!cash) throw new HttpError(422, 'Zyada payment sirf cash mein wapas ho sakti hai');
      cash.amount = cash.amount.sub(change);
    }

    const num = await nextNumber(tx, 'invoice');
    const session = await tx.cashSession.findFirst({ where: { userId: user.id, status: 'OPEN' } });
    const sale = await tx.sale.create({
      data: {
        invoiceNo: 'INV-' + String(num).padStart(6, '0'),
        branchId: user.branchId,
        cashierId: user.id,
        customerId: b.customerId,
        cashSessionId: session?.id,
        subtotal, discount, total, paid, changeDue: change,
        note: b.note,
        items: {
          create: lines.map((l) => ({
            medicineId: l.m.id, batchId: l.a.batch.id,
            nameSnap: l.m.name + (l.m.strength ? ' ' + l.m.strength : ''),
            skuSnap: l.m.sku, batchNoSnap: l.a.batch.batchNo, expirySnap: l.a.batch.expiryDate,
            qty: l.a.qty, unitPrice: l.m.sellingPrice, costPrice: l.a.batch.costPrice, lineTotal: l.lineTotal,
          })),
        },
        payments: { create: pays.filter((p) => p.amount.gt(0)) },
      },
    });
    await tx.stockMovement.createMany({
      data: lines.map((l) => ({ batchId: l.a.batch.id, medicineId: l.m.id, branchId: user.branchId, type: 'SALE' as const, qty: -l.a.qty, refType: 'SALE', refId: sale.id, userId: user.id })),
    });
    return sale.id;
  }, { timeout: 20000 });

  await audit(req, 'SALE', 'Sale', saleId);
  res.json(await loadSale(saleId));
}));

const saleInclude = {
  items: { include: { returnItems: true } },
  payments: true,
  returns: { include: { items: true } },
  cashier: { select: { name: true } },
  customer: { select: { name: true, phone: true } },
  branch: { select: { name: true, address: true, phone: true } },
};
const loadSale = (id: number) => prisma.sale.findUnique({ where: { id }, include: saleInclude as any });

// ================= SALES LIST / DETAIL =================
r.get('/sales', auth(...GROUPS.sell, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const { from, to, invoice } = req.query;
  const { page, pageSize, skip, take } = pageOf(req.query);
  const where: any = { branchId: req.user.branchId };
  if (req.user.role === 'CASHIER') where.cashierId = req.user.id; // cashier sirf apni sales dekhe
  if (invoice) where.invoiceNo = { contains: String(invoice), mode: 'insensitive' };
  if (from || to) where.createdAt = { ...(from ? { gte: new Date(from + 'T00:00:00') } : {}), ...(to ? { lt: new Date(new Date(to + 'T00:00:00').getTime() + 86400000) } : {}) };
  const [total, items] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({ where, orderBy: { id: 'desc' }, skip, take, include: { cashier: { select: { name: true } }, payments: true, returns: { select: { refundAmount: true } } } }),
  ]);
  res.json({ total, page, pageSize, items });
}));

r.get('/sales/:id', auth(...GROUPS.sell, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const sale = await loadSale(Number(req.params.id));
  if (!sale || sale.branchId !== req.user.branchId) throw new HttpError(404, 'Sale nahi mili');
  if (req.user.role === 'CASHIER' && sale.cashierId !== req.user.id) throw new HttpError(403, 'Yeh bill aap ka nahi');
  res.json(sale);
}));

// ================= RETURNS / REFUNDS =================
r.post('/sales/:id/return', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = z.object({
    items: z.array(z.object({ saleItemId: z.number().int(), qty: z.number().int().positive() })).min(1),
    refundMethod: METHOD,
    restock: z.boolean(),
    reason: z.string().min(3).max(200),
  }).parse(req.body);
  const settings = await getSettings();
  const saleId = Number(req.params.id);

  const ret = await prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: { include: { returnItems: true } } } });
    if (!sale || sale.branchId !== req.user.branchId) throw new HttpError(404, 'Sale nahi mili');
    const factor = sale.subtotal.gt(0) ? sale.total.div(sale.subtotal) : D(1); // bill discount ka hissa
    let refund = D(0);
    const rows: any[] = [];
    for (const it of b.items) {
      const si = sale.items.find((x) => x.id === it.saleItemId);
      if (!si) throw new HttpError(400, 'Item is bill ka nahi');
      const already = si.returnItems.reduce((s, x) => s + x.qty, 0);
      if (it.qty > si.qty - already) throw new HttpError(422, `${si.nameSnap}: sirf ${si.qty - already} wapas ho sakti hai`);
      const amount = si.unitPrice.mul(it.qty).mul(factor).toDecimalPlaces(2);
      refund = refund.add(amount);
      const expired = si.expirySnap < todayDate();
      rows.push({ si, qty: it.qty, amount, restock: b.restock && !expired });
    }
    if (req.user.role === 'CASHIER' && refund.gt(D(settings.returnApprovalLimit)))
      throw new HttpError(403, `Rs ${settings.returnApprovalLimit} se zyada refund ke liye manager chahiye`);
    const session = await tx.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } });
    const created = await tx.saleReturn.create({
      data: {
        saleId, userId: req.user.id, cashSessionId: session?.id, refundMethod: b.refundMethod, refundAmount: refund, reason: b.reason,
        items: { create: rows.map((x) => ({ saleItemId: x.si.id, qty: x.qty, restocked: x.restock, amount: x.amount })) },
      },
    });
    for (const x of rows) {
      if (!x.restock) continue;
      await tx.batch.update({ where: { id: x.si.batchId }, data: { availableQty: { increment: x.qty } } });
      await tx.stockMovement.create({ data: { batchId: x.si.batchId, medicineId: x.si.medicineId, branchId: sale.branchId, type: 'RETURN_IN', qty: x.qty, reason: b.reason, refType: 'RETURN', refId: created.id, userId: req.user.id } });
    }
    return created;
  });
  await audit(req, 'RETURN', 'Sale', saleId, { returnId: ret.id, amount: String(ret.refundAmount) });
  res.json(await loadSale(saleId));
}));

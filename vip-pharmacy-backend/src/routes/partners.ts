import { Router } from 'express';
import { z } from 'zod';
import { prisma, D } from '../db';
import { auth, GROUPS, wrap, audit, HttpError, pageOf } from '../middleware';

export const r = Router();

// ---------- Suppliers ----------
const supSchema = z.object({
  name: z.string().min(2).max(120), phone: z.string().max(30).nullish(), email: z.string().email().nullish().or(z.literal('')),
  address: z.string().max(200).nullish(), paymentTerms: z.string().max(100).nullish(), notes: z.string().max(300).nullish(), active: z.boolean().optional(),
});
r.get('/suppliers', auth(...GROUPS.buy, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const q = req.query.q ? String(req.query.q) : '';
  res.json(await prisma.supplier.findMany({ where: q ? { name: { contains: q, mode: 'insensitive' } } : {}, orderBy: { name: 'asc' } }));
}));
r.post('/suppliers', auth(...GROUPS.buy), wrap(async (req: any, res: any) => {
  const b = supSchema.parse(req.body);
  const s = await prisma.supplier.create({ data: { ...b, email: b.email || null } });
  await audit(req, 'CREATE', 'Supplier', s.id);
  res.json(s);
}));
r.patch('/suppliers/:id', auth(...GROUPS.buy), wrap(async (req: any, res: any) => {
  const b = supSchema.partial().parse(req.body);
  res.json(await prisma.supplier.update({ where: { id: Number(req.params.id) }, data: { ...b, email: b.email || null } }));
}));

// ---------- Customers ----------
const custSchema = z.object({ name: z.string().min(2).max(100), phone: z.string().max(30).nullish().transform((v) => v || null), email: z.string().email().nullish().or(z.literal('')), address: z.string().max(200).nullish(), notes: z.string().max(300).nullish() });
r.get('/customers', auth(...GROUPS.sell, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const q = req.query.q ? String(req.query.q) : '';
  const { page, pageSize, skip, take } = pageOf(req.query);
  const where: any = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {};
  const [total, items] = await Promise.all([prisma.customer.count({ where }), prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip, take })]);
  res.json({ total, page, pageSize, items });
}));
r.post('/customers', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = custSchema.parse(req.body);
  res.json(await prisma.customer.create({ data: { ...b, email: b.email || null } }));
}));
r.patch('/customers/:id', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = custSchema.partial().parse(req.body);
  res.json(await prisma.customer.update({ where: { id: Number(req.params.id) }, data: { ...b, email: b.email || null } }));
}));
r.get('/customers/:id/sales', auth(...GROUPS.boss, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  res.json(await prisma.sale.findMany({ where: { customerId: Number(req.params.id) }, orderBy: { id: 'desc' }, take: 100, select: { id: true, invoiceNo: true, total: true, createdAt: true } }));
}));

// ---------- Purchases ----------
r.get('/purchases', auth(...GROUPS.buy, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const { page, pageSize, skip, take } = pageOf(req.query);
  const where = { branchId: req.user.branchId };
  const [total, items] = await Promise.all([
    prisma.purchase.count({ where }),
    prisma.purchase.findMany({ where, orderBy: { id: 'desc' }, skip, take, include: { supplier: { select: { name: true } }, items: { include: { medicine: { select: { name: true, strength: true } } } } } }),
  ]);
  res.json({ total, page, pageSize, items });
}));

r.post('/purchases', auth(...GROUPS.buy), wrap(async (req: any, res: any) => {
  const b = z.object({
    supplierId: z.number().int(), invoiceNo: z.string().max(60).optional(), discount: z.number().min(0).default(0), note: z.string().max(300).optional(),
    items: z.array(z.object({ medicineId: z.number().int(), batchNo: z.string().min(1).max(40), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), qty: z.number().int().positive(), costPrice: z.number().min(0) })).min(1),
  }).parse(req.body);
  let total = b.items.reduce((s, i) => s.add(D(i.costPrice).mul(i.qty)), D(0)).sub(D(b.discount));
  if (total.lt(0)) throw new HttpError(422, 'Discount total se zyada hai');
  const p = await prisma.purchase.create({
    data: {
      supplierId: b.supplierId, branchId: req.user.branchId, createdById: req.user.id, invoiceNo: b.invoiceNo, discount: D(b.discount), total: total.toDecimalPlaces(2), note: b.note,
      items: { create: b.items.map((i) => ({ medicineId: i.medicineId, batchNo: i.batchNo, expiryDate: new Date(i.expiryDate), qty: i.qty, costPrice: D(i.costPrice) })) },
    },
  });
  await audit(req, 'CREATE', 'Purchase', p.id);
  res.json(p);
}));

// Maal wasool: batches banti/barhti hain + stock movements
r.post('/purchases/:id/receive', auth(...GROUPS.buy), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const flip = await tx.purchase.updateMany({ where: { id, branchId: req.user.branchId, status: 'DRAFT' }, data: { status: 'RECEIVED' } }); // double-receive se bachao
    if (flip.count === 0) throw new HttpError(409, 'Yeh purchase draft nahi hai (pehle receive ho chuki ya cancel)');
    const p = await tx.purchase.findUnique({ where: { id }, include: { items: true } });
    for (const i of p!.items) {
      const exist = await tx.batch.findUnique({ where: { medicineId_branchId_batchNo: { medicineId: i.medicineId, branchId: p!.branchId, batchNo: i.batchNo } } });
      const batch = exist
        ? await tx.batch.update({ where: { id: exist.id }, data: { availableQty: { increment: i.qty }, receivedQty: { increment: i.qty }, costPrice: i.costPrice } })
        : await tx.batch.create({ data: { medicineId: i.medicineId, branchId: p!.branchId, batchNo: i.batchNo, expiryDate: i.expiryDate, costPrice: i.costPrice, receivedQty: i.qty, availableQty: i.qty, purchaseId: id } });
      await tx.stockMovement.create({ data: { batchId: batch.id, medicineId: i.medicineId, branchId: p!.branchId, type: 'PURCHASE', qty: i.qty, refType: 'PURCHASE', refId: id, userId: req.user.id } });
      await tx.medicine.update({ where: { id: i.medicineId }, data: { purchasePrice: i.costPrice } });
    }
  });
  await audit(req, 'RECEIVE', 'Purchase', id);
  res.json({ ok: true });
}));

r.post('/purchases/:id/cancel', auth(...GROUPS.buy), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const x = await prisma.purchase.updateMany({ where: { id, branchId: req.user.branchId, status: 'DRAFT' }, data: { status: 'CANCELLED' } });
  if (!x.count) throw new HttpError(409, 'Sirf draft purchase cancel ho sakti hai');
  await audit(req, 'CANCEL', 'Purchase', id);
  res.json({ ok: true });
}));

import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma, D } from '../db';
import { auth, GROUPS, wrap, audit, HttpError, pageOf } from '../middleware';
import { allocateFefo, takeFromBatch, nextNumber, sellableStock } from '../stock';
import { getSettings } from './settings';

export const r = Router();

async function requireStore() {
  const s = await getSettings();
  if (s.storeEnabled !== 'true') throw new HttpError(403, 'Online store abhi band hai');
  return s;
}

// ================= PUBLIC (customers, bina login) =================
r.get('/store/info', wrap(async (_req: any, res: any) => {
  const s = await getSettings();
  res.json({ enabled: s.storeEnabled === 'true', storeName: s.storeName, address: s.address, phone: s.phone, email: s.email, currency: s.currency, deliveryFee: s.deliveryFee, minOrder: s.minOrder, notice: s.storeNotice });
}));

r.get('/store/products', wrap(async (req: any, res: any) => {
  await requireStore();
  const branch = await prisma.branch.findFirst({ where: { active: true }, orderBy: { id: 'asc' } });
  const { q, categoryId } = req.query;
  const { page, pageSize, skip, take } = pageOf({ ...req.query, pageSize: req.query.pageSize || 24 });
  const where: any = { active: true, showOnline: true, requiresPrescription: false };
  if (categoryId) where.categoryId = Number(categoryId);
  if (q) where.OR = ['name', 'genericName', 'brand'].map((f) => ({ [f]: { contains: String(q), mode: 'insensitive' } }));
  const [total, items] = await Promise.all([
    prisma.medicine.count({ where }),
    prisma.medicine.findMany({ where, orderBy: { name: 'asc' }, skip, take, select: { id: true, name: true, genericName: true, brand: true, strength: true, form: true, packSize: true, sellingPrice: true, categoryId: true } }),
  ]);
  const stock = await sellableStock(items.map((m) => m.id), branch!.id);
  res.json({ total, page, pageSize, items: items.map((m) => ({ ...m, inStock: (stock.get(m.id) || 0) > 0, available: Math.min(stock.get(m.id) || 0, 50) })) });
}));

const orderLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false, message: { error: 'Bohat zyada orders, thori dair baad koshish karein' } });

r.post('/store/orders', orderLimiter, wrap(async (req: any, res: any) => {
  const s = await requireStore();
  const b = z.object({
    customerName: z.string().min(2).max(80),
    phone: z.string().regex(/^[0-9+\-\s]{9,18}$/, 'Phone number theek likhein'),
    address: z.string().min(8).max(300),
    note: z.string().max(300).optional(),
    items: z.array(z.object({ medicineId: z.number().int(), qty: z.number().int().positive().max(100) })).min(1).max(40),
  }).parse(req.body);
  const branch = await prisma.branch.findFirst({ where: { active: true }, orderBy: { id: 'asc' } });
  const merged = new Map<number, number>();
  b.items.forEach((i) => merged.set(i.medicineId, (merged.get(i.medicineId) || 0) + i.qty));

  const order = await prisma.$transaction(async (tx) => {
    const meds = await tx.medicine.findMany({ where: { id: { in: [...merged.keys()] }, active: true, showOnline: true, requiresPrescription: false } });
    if (meds.length !== merged.size) throw new HttpError(400, 'Koi item online available nahi');
    const stock = await sellableStock(meds.map((m) => m.id), branch!.id);
    let subtotal = D(0);
    for (const m of meds) {
      if ((stock.get(m.id) || 0) < merged.get(m.id)!) throw new HttpError(409, `${m.name}: itna stock mojood nahi`);
      subtotal = subtotal.add(m.sellingPrice.mul(merged.get(m.id)!));
    }
    if (subtotal.lt(D(s.minOrder))) throw new HttpError(422, `Kam az kam order Rs ${s.minOrder} ka hona chahiye`);
    const fee = D(s.deliveryFee);
    const num = await nextNumber(tx, 'online');
    return tx.onlineOrder.create({
      data: {
        orderNo: 'WEB-' + String(num).padStart(5, '0'), branchId: branch!.id, customerName: b.customerName, phone: b.phone.trim(), address: b.address, note: b.note,
        subtotal, deliveryFee: fee, total: subtotal.add(fee),
        items: { create: meds.map((m) => ({ medicineId: m.id, nameSnap: m.name + (m.strength ? ' ' + m.strength : ''), qty: merged.get(m.id)!, unitPrice: m.sellingPrice })) },
        history: { create: { status: 'NEW', note: 'Order mosool hua' } },
      },
    });
  });
  res.json({ orderNo: order.orderNo, total: order.total, status: order.status });
}));

r.get('/store/track', wrap(async (req: any, res: any) => {
  await requireStore();
  const o = await prisma.onlineOrder.findUnique({ where: { orderNo: String(req.query.orderNo || '') }, include: { items: true, history: { orderBy: { id: 'asc' } } } });
  const clean = (p: string) => p.replace(/\D/g, '').slice(-9);
  if (!o || clean(o.phone) !== clean(String(req.query.phone || ''))) throw new HttpError(404, 'Order nahi mila (order number aur phone check karein)');
  res.json({ orderNo: o.orderNo, status: o.status, total: o.total, deliveryFee: o.deliveryFee, createdAt: o.createdAt, items: o.items.map((i) => ({ name: i.nameSnap, qty: i.qty, unitPrice: i.unitPrice })), history: o.history.map((h) => ({ status: h.status, at: h.createdAt })) });
}));

// ================= STAFF: online orders =================
r.get('/orders', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const where: any = { branchId: req.user.branchId };
  if (req.query.status) where.status = String(req.query.status);
  res.json(await prisma.onlineOrder.findMany({ where, orderBy: { id: 'desc' }, take: 100, include: { items: true, history: { orderBy: { id: 'asc' } } } }));
}));

const NEXT: Record<string, string[]> = {
  NEW: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [], CANCELLED: [], REJECTED: [],
};

r.patch('/orders/:id/status', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = z.object({ status: z.enum(['CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED']), note: z.string().max(200).optional() }).parse(req.body);
  const id = Number(req.params.id);
  await prisma.$transaction(async (tx) => {
    const o = await tx.onlineOrder.findFirst({ where: { id, branchId: req.user.branchId }, include: { items: true } });
    if (!o) throw new HttpError(404, 'Order nahi mila');
    if (!NEXT[o.status].includes(b.status)) throw new HttpError(422, `${o.status} se ${b.status} nahi ho sakta`);
    if (b.status === 'CONFIRMED') {
      // Confirm par stock nikalta hai taake POS aur online dono mein oversell na ho
      for (const it of o.items) {
        const alloc = await allocateFefo(tx, it.medicineId, o.branchId, it.qty, it.nameSnap);
        for (const a of alloc) {
          await takeFromBatch(tx, a.batch.id, a.qty);
          await tx.stockMovement.create({ data: { batchId: a.batch.id, medicineId: it.medicineId, branchId: o.branchId, type: 'ONLINE_OUT', qty: -a.qty, refType: 'ONLINE_ORDER', refId: o.id, userId: req.user.id } });
        }
      }
    }
    if (b.status === 'CANCELLED' && o.status !== 'NEW') {
      const outs = await tx.stockMovement.findMany({ where: { refType: 'ONLINE_ORDER', refId: o.id, type: 'ONLINE_OUT' } });
      for (const m of outs) {
        await tx.batch.update({ where: { id: m.batchId }, data: { availableQty: { increment: -m.qty } } });
        await tx.stockMovement.create({ data: { batchId: m.batchId, medicineId: m.medicineId, branchId: m.branchId, type: 'ONLINE_RESTORE', qty: -m.qty, refType: 'ONLINE_ORDER', refId: o.id, userId: req.user.id } });
      }
    }
    await tx.onlineOrder.update({ where: { id }, data: { status: b.status, history: { create: { status: b.status, note: b.note, userId: req.user.id } } } });
  });
  await audit(req, 'ORDER_STATUS', 'OnlineOrder', id, { status: b.status });
  res.json({ ok: true });
}));

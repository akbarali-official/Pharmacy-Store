import { Router } from 'express';
import { z } from 'zod';
import { prisma, D, Tx } from '../db';
import { auth, GROUPS, wrap, audit, HttpError } from '../middleware';
import { allocateFefo, takeFromBatch, nextNumber } from '../stock';

export const r = Router();
const num = (v: any) => Number(v ?? 0);
const SELL = GROUPS.sell;
const VIEW = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'PHARMACIST', 'CASHIER'];
const MANAGE = ['OWNER', 'MANAGER'];
const METHOD = z.enum(['CASH', 'CARD', 'BANK', 'OTHER']);

// balance = credit sales - payments - adjustments (credit notes / write-offs)
async function balanceOf(client: any, customerId: number) {
  const rows = await client.customerLedger.groupBy({ by: ['type'], where: { customerId }, _sum: { amount: true } });
  return rows.reduce((b: number, x: any) => b + (x.type === 'CREDIT_SALE' ? 1 : -1) * num(x._sum.amount), 0);
}

// ================= Credit sale at the POS =================
r.post('/pos/checkout-credit', auth(...SELL), wrap(async (req: any, res: any) => {
  const b = z.object({
    items: z.array(z.object({ medicineId: z.number().int(), qty: z.number().int().positive().max(10000) })).min(1).max(100),
    discount: z.number().min(0).default(0),
    customerId: z.number().int(),
    paidNow: z.number().min(0).default(0),
    method: METHOD.default('CASH'),
    note: z.string().max(300).optional(),
    prescriptionVerified: z.boolean().optional(),
  }).parse(req.body);
  const user = req.user;
  const merged = new Map<number, number>();
  b.items.forEach((i) => merged.set(i.medicineId, (merged.get(i.medicineId) || 0) + i.qty));

  const saleId = await prisma.$transaction(async (tx: Tx) => {
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${b.customerId} FOR UPDATE`; // serialise credit checks per customer
    const customer = await tx.customer.findUnique({ where: { id: b.customerId } });
    if (!customer) throw new HttpError(404, 'Customer not found');
    const limit = num((customer as any).creditLimit);
    if (!(limit > 0)) throw new HttpError(422, 'This customer has no credit limit. Set one under Customer Credit first.');

    const meds = await tx.medicine.findMany({ where: { id: { in: [...merged.keys()] }, active: true } });
    if (meds.length !== merged.size) throw new HttpError(400, 'A medicine is missing or inactive');
    if (meds.some((m) => m.requiresPrescription) && !b.prescriptionVerified) throw new HttpError(422, 'A prescription medicine is in the cart: check the prescription and tick the confirmation first');

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
    if (discount.gt(subtotal)) throw new HttpError(422, 'Discount cannot exceed the bill total');
    const total = subtotal.sub(discount).toDecimalPlaces(2);
    const paidNow = D(b.paidNow).toDecimalPlaces(2);
    if (paidNow.gt(total)) throw new HttpError(422, 'The amount paid now cannot be more than the bill total');
    const owed = total.sub(paidNow);

    const balance = await balanceOf(tx, customer.id);
    if (balance + num(owed) > limit + 0.001) throw new HttpError(422, `Credit limit exceeded: current balance ${balance.toFixed(2)} + this sale ${num(owed).toFixed(2)} is above the limit of ${limit.toFixed(2)}`);

    const n = await nextNumber(tx, 'invoice');
    const session = await tx.cashSession.findFirst({ where: { userId: user.id, status: 'OPEN' } });
    const invoiceNo = 'INV-' + String(n).padStart(6, '0');
    const sale = await tx.sale.create({
      data: {
        invoiceNo, branchId: user.branchId, cashierId: user.id, customerId: customer.id, cashSessionId: session?.id,
        subtotal, discount, total, paid: paidNow, changeDue: D(0), note: [b.note, 'CREDIT SALE'].filter(Boolean).join(' · '),
        items: {
          create: lines.map((l) => ({
            medicineId: l.m.id, batchId: l.a.batch.id, nameSnap: l.m.name + (l.m.strength ? ' ' + l.m.strength : ''), skuSnap: l.m.sku,
            batchNoSnap: l.a.batch.batchNo, expirySnap: l.a.batch.expiryDate, qty: l.a.qty, unitPrice: l.m.sellingPrice, costPrice: l.a.batch.costPrice, lineTotal: l.lineTotal,
          })),
        },
        payments: paidNow.gt(0) ? { create: [{ method: b.method, amount: paidNow }] } : undefined,
      },
    });
    await tx.stockMovement.createMany({
      data: lines.map((l) => ({ batchId: l.a.batch.id, medicineId: l.m.id, branchId: user.branchId, type: 'SALE' as const, qty: -l.a.qty, refType: 'SALE', refId: sale.id, userId: user.id })),
    });
    if (owed.gt(0)) {
      await (tx as any).customerLedger.create({ data: { customerId: customer.id, branchId: user.branchId, userId: user.id, type: 'CREDIT_SALE', amount: owed, saleId: sale.id, cashSessionId: session?.id, note: invoiceNo } });
    }
    return sale.id;
  }, { timeout: 20000 });

  await audit(req, 'CREDIT_SALE', 'Sale', saleId, { customerId: b.customerId });
  res.json(await prisma.sale.findUnique({
    where: { id: saleId },
    include: { items: { include: { returnItems: true } }, payments: true, returns: { include: { items: true } }, cashier: { select: { name: true } }, customer: { select: { name: true, phone: true } }, branch: { select: { name: true, address: true, phone: true } } },
  }));
}));

// ================= Customer accounts =================
r.get('/credit/customers', auth(...VIEW), wrap(async (req: any, res: any) => {
  const q = req.query.q ? String(req.query.q) : '';
  const all = req.query.all === '1';
  const where: any = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {};
  const [customers, ledger] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { name: 'asc' }, take: 1000 }),
    (prisma as any).customerLedger.groupBy({ by: ['customerId', 'type'], _sum: { amount: true } }),
  ]);
  const bal = new Map<number, number>();
  ledger.forEach((x: any) => bal.set(x.customerId, (bal.get(x.customerId) || 0) + (x.type === 'CREDIT_SALE' ? 1 : -1) * num(x._sum.amount)));
  let items = customers.map((c: any) => { const balance = bal.get(c.id) || 0; const limit = num(c.creditLimit); return { id: c.id, name: c.name, phone: c.phone, creditLimit: limit, balance, available: Math.max(0, limit - balance) }; });
  if (!all) items = items.filter((c) => c.creditLimit > 0 || Math.abs(c.balance) > 0.004);
  items.sort((a, b) => b.balance - a.balance);
  res.json({ items, totalReceivable: items.reduce((s, c) => s + Math.max(c.balance, 0), 0) });
}));

// Used by the POS to show a customer's balance before selling on credit
r.get('/credit/customers/:id/balance', auth(...VIEW), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const c: any = await prisma.customer.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Customer not found');
  const balance = await balanceOf(prisma, id);
  const limit = num(c.creditLimit);
  res.json({ balance, creditLimit: limit, available: Math.max(0, limit - balance) });
}));

r.get('/credit/customers/:id/statement', auth(...VIEW), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const c: any = await prisma.customer.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, 'Customer not found');
  const rows = await (prisma as any).customerLedger.findMany({ where: { customerId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  let bal = 0;
  const out = rows.map((x: any) => {
    const charge = x.type === 'CREDIT_SALE' ? num(x.amount) : 0, credit = x.type === 'CREDIT_SALE' ? 0 : num(x.amount);
    bal += charge - credit;
    const label = x.type === 'CREDIT_SALE' ? 'Credit sale' : x.type === 'PAYMENT' ? 'Payment received' + (x.method ? ' (' + x.method + ')' : '') : 'Adjustment / credit note';
    return { date: x.createdAt, type: label, ref: x.type === 'CREDIT_SALE' ? x.note || '' : '', note: x.type === 'CREDIT_SALE' ? '' : x.note || '', charge, credit, balance: bal };
  });
  res.json({ customer: { id: c.id, name: c.name, phone: c.phone, creditLimit: num(c.creditLimit) }, rows: out, balance: bal });
}));

r.post('/credit/customers/:id/payments', auth(...SELL, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const b = z.object({ amount: z.number().positive(), method: METHOD.default('CASH'), note: z.string().max(200).optional() }).parse(req.body);
  if (!(await prisma.customer.findUnique({ where: { id } }))) throw new HttpError(404, 'Customer not found');
  const session = b.method === 'CASH' ? await prisma.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } }) : null;
  const row = await (prisma as any).customerLedger.create({ data: { customerId: id, branchId: req.user.branchId, userId: req.user.id, type: 'PAYMENT', amount: D(b.amount), method: b.method, cashSessionId: session?.id, note: b.note } });
  await audit(req, 'CREDIT_PAYMENT', 'Customer', id, { amount: b.amount, method: b.method });
  res.json(row);
}));

r.post('/credit/customers/:id/adjustments', auth(...MANAGE), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const b = z.object({ amount: z.number().positive(), reason: z.string().min(3).max(200) }).parse(req.body);
  if (!(await prisma.customer.findUnique({ where: { id } }))) throw new HttpError(404, 'Customer not found');
  const row = await (prisma as any).customerLedger.create({ data: { customerId: id, branchId: req.user.branchId, userId: req.user.id, type: 'ADJUSTMENT', amount: D(b.amount), note: b.reason } });
  await audit(req, 'CREDIT_ADJUSTMENT', 'Customer', id, { amount: b.amount, reason: b.reason });
  res.json(row);
}));

r.patch('/credit/customers/:id/limit', auth(...MANAGE), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const b = z.object({ creditLimit: z.number().min(0) }).parse(req.body);
  await prisma.customer.update({ where: { id }, data: { creditLimit: D(b.creditLimit) } as any });
  await audit(req, 'CREDIT_LIMIT', 'Customer', id, { creditLimit: b.creditLimit });
  res.json({ ok: true });
}));

// ================= Cash register: include customer payments received in cash =================
// (mounted before the original /cash routes so these versions take precedence)
async function expectedCash(s: any) {
  const [sales, refunds, exp, custCash] = await Promise.all([
    prisma.payment.aggregate({ where: { method: 'CASH', sale: { cashSessionId: s.id } }, _sum: { amount: true } }),
    prisma.saleReturn.aggregate({ where: { cashSessionId: s.id, refundMethod: 'CASH' }, _sum: { refundAmount: true } }),
    prisma.expense.aggregate({ where: { cashSessionId: s.id, method: 'CASH' }, _sum: { amount: true } }),
    (prisma as any).customerLedger.aggregate({ where: { cashSessionId: s.id, type: 'PAYMENT', method: 'CASH' }, _sum: { amount: true } }),
  ]);
  const cashIn = D(sales._sum.amount), cashRefund = D(refunds._sum.refundAmount), cashExp = D(exp._sum.amount), customerCash = D(custCash._sum.amount);
  return { cashIn, cashRefund, cashExp, customerCash, expected: D(s.openingCash).add(cashIn).add(customerCash).sub(cashRefund).sub(cashExp) };
}
r.get('/cash/current', auth(...GROUPS.sell, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const s = await prisma.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } });
  if (!s) return res.json(null);
  res.json({ ...s, ...(await expectedCash(s)) });
}));
r.post('/cash/close', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = z.object({ countedCash: z.number().min(0), note: z.string().max(300).optional() }).parse(req.body);
  const s = await prisma.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } });
  if (!s) throw new HttpError(404, 'There is no open cash session');
  const { expected } = await expectedCash(s);
  const closed = await prisma.cashSession.update({ where: { id: s.id }, data: { status: 'CLOSED', closedAt: new Date(), closingCash: D(b.countedCash), expectedCash: expected, variance: D(b.countedCash).sub(expected), note: b.note } });
  await audit(req, 'CLOSE', 'CashSession', s.id, { variance: String(closed.variance) });
  res.json(closed);
}));

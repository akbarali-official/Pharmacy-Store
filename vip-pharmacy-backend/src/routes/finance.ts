import { Router } from 'express';
import { z } from 'zod';
import { prisma, D } from '../db';
import { auth, GROUPS, wrap, audit, HttpError, pageOf } from '../middleware';

export const r = Router();

// ---------- Expenses ----------
r.get('/expenses', auth(...GROUPS.money), wrap(async (req: any, res: any) => {
  const { from, to } = req.query;
  const { page, pageSize, skip, take } = pageOf(req.query);
  const where: any = { branchId: req.user.branchId };
  if (from || to) where.date = { ...(from ? { gte: new Date(from + 'T00:00:00') } : {}), ...(to ? { lt: new Date(new Date(to + 'T00:00:00').getTime() + 86400000) } : {}) };
  const [total, items, sum] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({ where, orderBy: { date: 'desc' }, skip, take, include: { user: { select: { name: true } } } }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);
  res.json({ total, page, pageSize, items, sum: sum._sum.amount || 0 });
}));

r.post('/expenses', auth(...GROUPS.money), wrap(async (req: any, res: any) => {
  const b = z.object({ category: z.string().min(2).max(60), amount: z.number().positive(), method: z.enum(['CASH', 'CARD', 'BANK', 'OTHER']).default('CASH'), description: z.string().max(300).optional(), date: z.string().optional() }).parse(req.body);
  const session = b.method === 'CASH' ? await prisma.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } }) : null;
  const e = await prisma.expense.create({ data: { branchId: req.user.branchId, userId: req.user.id, cashSessionId: session?.id, category: b.category, amount: D(b.amount), method: b.method, description: b.description, date: b.date ? new Date(b.date) : new Date() } });
  await audit(req, 'CREATE', 'Expense', e.id, { amount: b.amount, category: b.category });
  res.json(e);
}));

// ---------- Cash register ----------
async function expectedCash(s: any) {
  const [sales, refunds, exp] = await Promise.all([
    prisma.payment.aggregate({ where: { method: 'CASH', sale: { cashSessionId: s.id } }, _sum: { amount: true } }),
    prisma.saleReturn.aggregate({ where: { cashSessionId: s.id, refundMethod: 'CASH' }, _sum: { refundAmount: true } }),
    prisma.expense.aggregate({ where: { cashSessionId: s.id, method: 'CASH' }, _sum: { amount: true } }),
  ]);
  const cashIn = D(sales._sum.amount), cashRefund = D(refunds._sum.refundAmount), cashExp = D(exp._sum.amount);
  return { cashIn, cashRefund, cashExp, expected: D(s.openingCash).add(cashIn).sub(cashRefund).sub(cashExp) };
}

r.get('/cash/current', auth(...GROUPS.sell, 'ACCOUNTANT'), wrap(async (req: any, res: any) => {
  const s = await prisma.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } });
  if (!s) return res.json(null);
  res.json({ ...s, ...(await expectedCash(s)) });
}));

r.post('/cash/open', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = z.object({ openingCash: z.number().min(0) }).parse(req.body);
  if (await prisma.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } })) throw new HttpError(409, 'Aap ka cash session pehle se khula hai');
  const s = await prisma.cashSession.create({ data: { branchId: req.user.branchId, userId: req.user.id, openingCash: D(b.openingCash) } });
  await audit(req, 'OPEN', 'CashSession', s.id, { openingCash: b.openingCash });
  res.json(s);
}));

r.post('/cash/close', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const b = z.object({ countedCash: z.number().min(0), note: z.string().max(300).optional() }).parse(req.body);
  const s = await prisma.cashSession.findFirst({ where: { userId: req.user.id, status: 'OPEN' } });
  if (!s) throw new HttpError(404, 'Koi khula cash session nahi');
  const { expected } = await expectedCash(s);
  const closed = await prisma.cashSession.update({ where: { id: s.id }, data: { status: 'CLOSED', closedAt: new Date(), closingCash: D(b.countedCash), expectedCash: expected, variance: D(b.countedCash).sub(expected), note: b.note } });
  await audit(req, 'CLOSE', 'CashSession', s.id, { variance: String(closed.variance) });
  res.json(closed);
}));

r.get('/cash/sessions', auth(...GROUPS.money), wrap(async (req: any, res: any) => {
  res.json(await prisma.cashSession.findMany({ where: { branchId: req.user.branchId }, orderBy: { id: 'desc' }, take: 60, include: { user: { select: { name: true } } } }));
}));

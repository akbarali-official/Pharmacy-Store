import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { auth, wrap } from '../middleware';
import { sellableStock, todayDate } from '../stock';

export const r = Router();
const num = (v: any) => Number(v ?? 0);
const STOCK_VIEW = ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY', 'ACCOUNTANT'];
const MONEY_VIEW = ['OWNER', 'MANAGER', 'ACCOUNTANT'];

// Formula-injection protection: cells starting with = + - @ get a leading apostrophe
const csvCell = (v: any) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const sendCsv = (res: any, filename: string, header: string[], rows: any[][]) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + [header.join(','), ...rows.map((x) => x.map(csvCell).join(','))].join('\n'));
};
const dayStart = (s?: any) => {
  const d = s ? new Date(String(s) + 'T00:00:00') : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ---------------- Reorder list ----------------
async function reorderRows(branchId: number) {
  const meds = await prisma.medicine.findMany({
    where: { active: true, reorderLevel: { gt: 0 } },
    select: { id: true, name: true, strength: true, form: true, reorderLevel: true, purchasePrice: true },
    orderBy: { name: 'asc' },
  });
  const stock = await sellableStock(meds.map((m) => m.id), branchId);
  return meds
    .map((m) => ({ ...m, stock: stock.get(m.id) || 0 }))
    .filter((m) => m.stock <= m.reorderLevel)
    .map((m) => {
      const suggested = Math.max(m.reorderLevel * 2 - m.stock, 1); // top up to 2x the reorder level
      return { id: m.id, name: m.name, strength: m.strength, form: m.form, stock: m.stock, reorderLevel: m.reorderLevel, suggested, unitCost: num(m.purchasePrice), estCost: suggested * num(m.purchasePrice) };
    });
}
r.get('/tools/reorder', auth(...STOCK_VIEW), wrap(async (req: any, res: any) => {
  const items = await reorderRows(req.user.branchId);
  res.json({ items, totalEstCost: items.reduce((s, i) => s + i.estCost, 0) });
}));
r.get('/tools/reorder.csv', auth(...STOCK_VIEW), wrap(async (req: any, res: any) => {
  const items = await reorderRows(req.user.branchId);
  sendCsv(res, 'reorder-list.csv', ['Medicine', 'Form', 'In stock', 'Reorder level', 'Suggested qty', 'Unit cost', 'Estimated cost'],
    items.map((i) => [i.name + (i.strength ? ' ' + i.strength : ''), i.form, i.stock, i.reorderLevel, i.suggested, i.unitCost, i.estCost]));
}));

// ---------------- Daily closing report ----------------
r.get('/tools/closing', auth(...MONEY_VIEW), wrap(async (req: any, res: any) => {
  const branchId = req.user.branchId;
  const from = dayStart(req.query.date);
  const to = new Date(from.getTime() + 86400000);
  const saleWhere = { branchId, createdAt: { gte: from, lt: to } };
  const [sales, refunds, pay, cashExp, allExp, byCashier, top] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { subtotal: true, discount: true, total: true }, _count: true }),
    prisma.saleReturn.aggregate({ where: { sale: { branchId }, createdAt: { gte: from, lt: to } }, _sum: { refundAmount: true }, _count: true }),
    prisma.payment.groupBy({ by: ['method'], where: { sale: saleWhere }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { branchId, method: 'CASH', date: { gte: from, lt: to } }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { branchId, date: { gte: from, lt: to } }, _sum: { amount: true } }),
    prisma.sale.groupBy({ by: ['cashierId'], where: saleWhere, _sum: { total: true }, _count: true }),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT si."nameSnap" AS name, SUM(si."qty") AS qty, SUM(si."lineTotal") AS revenue FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" WHERE s."branchId" = ${branchId} AND s."createdAt" >= ${from} AND s."createdAt" < ${to} GROUP BY 1 ORDER BY 3 DESC LIMIT 10`),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: byCashier.map((c) => c.cashierId) } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  const gross = num(sales._sum.total), refunded = num(refunds._sum.refundAmount);
  res.json({
    date: from.toISOString().slice(0, 10),
    invoices: sales._count, subtotal: num(sales._sum.subtotal), discounts: num(sales._sum.discount), grossSales: gross,
    refundCount: refunds._count, refunds: refunded, netSales: gross - refunded,
    payments: pay.map((p) => ({ method: p.method, amount: num(p._sum.amount) })),
    cashExpenses: num(cashExp._sum.amount), totalExpenses: num(allExp._sum.amount),
    cashiers: byCashier.map((c) => ({ name: name.get(c.cashierId) || 'Unknown', invoices: c._count, total: num(c._sum.total) })),
    topItems: top.map((t) => ({ name: t.name, qty: num(t.qty), revenue: num(t.revenue) })),
  });
}));

// ---------------- Cashier performance ----------------
r.get('/tools/cashiers', auth(...MONEY_VIEW), wrap(async (req: any, res: any) => {
  const branchId = req.user.branchId;
  const from = req.query.from ? dayStart(req.query.from) : new Date(dayStart().getTime() - 6 * 86400000);
  const to = new Date(dayStart(req.query.to).getTime() + 86400000);
  const [sales, refunds] = await Promise.all([
    prisma.sale.groupBy({ by: ['cashierId'], where: { branchId, createdAt: { gte: from, lt: to } }, _sum: { total: true, discount: true }, _count: true }),
    prisma.saleReturn.groupBy({ by: ['userId'], where: { sale: { branchId }, createdAt: { gte: from, lt: to } }, _sum: { refundAmount: true }, _count: true }),
  ]);
  const ids = [...new Set([...sales.map((s) => s.cashierId), ...refunds.map((x) => x.userId)])];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } });
  res.json(users.map((u) => {
    const s = sales.find((x) => x.cashierId === u.id), f = refunds.find((x) => x.userId === u.id);
    const total = num(s?._sum.total);
    return { name: u.name, role: u.role, invoices: s?._count || 0, total, discounts: num(s?._sum.discount), avgBill: s?._count ? total / s._count : 0, refunds: num(f?._sum.refundAmount), refundCount: f?._count || 0 };
  }).sort((a, b) => b.total - a.total));
}));

// ---------------- Expiry report ----------------
async function expiryRows(branchId: number, days: number) {
  const limit = new Date(todayDate().getTime() + days * 86400000);
  const rows = await prisma.batch.findMany({
    where: { branchId, availableQty: { gt: 0 }, expiryDate: { lte: limit } },
    include: { medicine: { select: { name: true, strength: true } } },
    orderBy: { expiryDate: 'asc' },
  });
  const today = todayDate();
  return rows.map((b) => ({
    medicine: b.medicine.name + (b.medicine.strength ? ' ' + b.medicine.strength : ''), batchNo: b.batchNo,
    expiryDate: b.expiryDate.toISOString().slice(0, 10), qty: b.availableQty, status: b.expiryDate < today ? 'EXPIRED' : 'EXPIRING',
    unitCost: num(b.costPrice), valueAtCost: num(b.costPrice) * b.availableQty,
  }));
}
const daysOf = (q: any) => Math.min(730, Math.max(1, Number(q.days) || 90));
r.get('/tools/expiry', auth(...STOCK_VIEW), wrap(async (req: any, res: any) => {
  const items = await expiryRows(req.user.branchId, daysOf(req.query));
  res.json({ items, totalValue: items.reduce((s, i) => s + i.valueAtCost, 0), expiredValue: items.filter((i) => i.status === 'EXPIRED').reduce((s, i) => s + i.valueAtCost, 0) });
}));
r.get('/tools/expiry.csv', auth(...STOCK_VIEW), wrap(async (req: any, res: any) => {
  const items = await expiryRows(req.user.branchId, daysOf(req.query));
  sendCsv(res, 'expiry-report.csv', ['Medicine', 'Batch', 'Expiry date', 'Qty', 'Status', 'Unit cost', 'Value at cost'],
    items.map((i) => [i.medicine, i.batchNo, i.expiryDate, i.qty, i.status, i.unitCost, i.valueAtCost]));
}));

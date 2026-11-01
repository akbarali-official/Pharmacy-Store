import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { auth, GROUPS, wrap } from '../middleware';
import { todayDate, validBatchWhere } from '../stock';
import { getSettings } from './settings';

export const r = Router();
const num = (v: any) => Number(v ?? 0);

function range(q: any) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const from = q.from ? new Date(q.from + 'T00:00:00') : new Date(today.getTime() - 6 * 86400000);
  const to = q.to ? new Date(new Date(q.to + 'T00:00:00').getTime() + 86400000) : new Date(today.getTime() + 86400000);
  return { from, to };
}

// ---------- Dashboard (sab data database se) ----------
r.get('/reports/dashboard', auth(...GROUPS.all), wrap(async (req: any, res: any) => {
  const branchId = req.user.branchId;
  const s = await getSettings();
  const tz = s.timezone;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  const soon = new Date(todayDate().getTime() + Number(s.nearExpiryDays) * 86400000);
  const wk = new Date(start.getTime() - 6 * 86400000);
  const [today, refunds, near, expired, recent, trend, top, pendingOrders, sums, meds] = await Promise.all([
    prisma.sale.aggregate({ where: { branchId, createdAt: { gte: start, lt: end } }, _sum: { total: true }, _count: true }),
    prisma.saleReturn.aggregate({ where: { sale: { branchId }, createdAt: { gte: start, lt: end } }, _sum: { refundAmount: true } }),
    prisma.batch.count({ where: { branchId, availableQty: { gt: 0 }, expiryDate: { gte: todayDate(), lte: soon } } }),
    prisma.batch.count({ where: { branchId, availableQty: { gt: 0 }, expiryDate: { lt: todayDate() } } }),
    prisma.sale.findMany({ where: { branchId }, orderBy: { id: 'desc' }, take: 8, select: { id: true, invoiceNo: true, total: true, createdAt: true } }),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, SUM("total") AS total, COUNT(*) AS count FROM "Sale" WHERE "branchId" = ${branchId} AND "createdAt" >= ${wk} GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT si."nameSnap" AS name, SUM(si."qty") AS qty FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" WHERE s."branchId" = ${branchId} AND s."createdAt" >= ${wk} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`),
    prisma.onlineOrder.count({ where: { branchId, status: 'NEW' } }),
    prisma.batch.groupBy({ by: ['medicineId'], where: validBatchWhere(branchId) as any, _sum: { availableQty: true } }),
    prisma.medicine.findMany({ where: { active: true }, select: { id: true, reorderLevel: true } }),
  ]);
  const m = new Map(sums.map((x) => [x.medicineId, x._sum.availableQty || 0]));
  const stockOf = (id: number) => m.get(id) || 0;
  res.json({
    todaySales: num(today._sum.total), todayInvoices: today._count, todayRefunds: num(refunds._sum.refundAmount),
    todayNet: num(today._sum.total) - num(refunds._sum.refundAmount),
    lowStock: meds.filter((x) => stockOf(x.id) > 0 && stockOf(x.id) <= x.reorderLevel).length,
    outOfStock: meds.filter((x) => stockOf(x.id) === 0).length,
    nearExpiry: near, expired, pendingOrders,
    recent,
    trend: trend.map((t) => ({ day: t.day, total: num(t.total), count: num(t.count) })),
    top: top.map((t) => ({ name: t.name, qty: num(t.qty) })),
  });
}));

// ---------- Summary ----------
async function summary(branchId: number, from: Date, to: Date) {
  const tz = (await getSettings()).timezone;
  const saleWhere = { branchId, createdAt: { gte: from, lt: to } };
  const [sales, refunds, pay, exp, cogs, retCogs, byDay, topItems, valuation] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { subtotal: true, discount: true, total: true }, _count: true }),
    prisma.saleReturn.aggregate({ where: { sale: { branchId }, createdAt: { gte: from, lt: to } }, _sum: { refundAmount: true } }),
    prisma.payment.groupBy({ by: ['method'], where: { sale: saleWhere }, _sum: { amount: true } }),
    prisma.expense.groupBy({ by: ['category'], where: { branchId, date: { gte: from, lt: to } }, _sum: { amount: true } }),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT COALESCE(SUM(si."costPrice" * si."qty"),0) AS v FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" WHERE s."branchId" = ${branchId} AND s."createdAt" >= ${from} AND s."createdAt" < ${to}`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT COALESCE(SUM(si."costPrice" * ri."qty"),0) AS v FROM "SaleReturnItem" ri JOIN "SaleItem" si ON si.id = ri."saleItemId" JOIN "SaleReturn" r ON r.id = ri."returnId" JOIN "Sale" s ON s.id = r."saleId" WHERE s."branchId" = ${branchId} AND r."createdAt" >= ${from} AND r."createdAt" < ${to} AND ri."restocked" = true`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day, SUM("total") AS total, COUNT(*) AS count FROM "Sale" WHERE "branchId" = ${branchId} AND "createdAt" >= ${from} AND "createdAt" < ${to} GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT si."nameSnap" AS name, SUM(si."qty") AS qty, SUM(si."lineTotal") AS revenue FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" WHERE s."branchId" = ${branchId} AND s."createdAt" >= ${from} AND s."createdAt" < ${to} GROUP BY 1 ORDER BY 3 DESC LIMIT 15`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT COALESCE(SUM("availableQty" * "costPrice"),0) AS v FROM "Batch" WHERE "branchId" = ${branchId} AND "status" = 'ACTIVE' AND "expiryDate" >= ${todayDate()}`),
  ]);
  const gross = num(sales._sum.total), refunded = num(refunds._sum.refundAmount);
  const expenses = exp.reduce((s, e) => s + num(e._sum.amount), 0);
  const cost = num(cogs[0].v) - num(retCogs[0].v);
  const net = gross - refunded;
  return {
    from, to, invoices: sales._count, grossSales: gross, discounts: num(sales._sum.discount), refunds: refunded, netSales: net,
    estimatedProfit: net - cost, estimatedProfitNote: 'Andaza: net sales - sale ke waqt ki cost (batch cost snapshot). Expenses alag.',
    expenses, expensesByCategory: exp.map((e) => ({ category: e.category, amount: num(e._sum.amount) })),
    profitAfterExpenses: net - cost - expenses,
    payments: pay.map((p) => ({ method: p.method, amount: num(p._sum.amount) })),
    byDay: byDay.map((d) => ({ day: d.day, total: num(d.total), count: num(d.count) })),
    topItems: topItems.map((t) => ({ name: t.name, qty: num(t.qty), revenue: num(t.revenue) })),
    stockValuationAtCost: num(valuation[0].v),
  };
}

r.get('/reports/summary', auth(...GROUPS.money), wrap(async (req: any, res: any) => {
  const { from, to } = range(req.query);
  res.json(await summary(req.user.branchId, from, to));
}));

// CSV (formula-injection se bachao: = + - @ se shuru ho to aage ' laga do)
const csvCell = (v: any) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
r.get('/reports/sales.csv', auth(...GROUPS.money), wrap(async (req: any, res: any) => {
  const { from, to } = range(req.query);
  const rows = await prisma.sale.findMany({ where: { branchId: req.user.branchId, createdAt: { gte: from, lt: to } }, orderBy: { id: 'asc' }, include: { cashier: { select: { name: true } }, payments: true } });
  const lines = ['Invoice,Date,Cashier,Subtotal,Discount,Total,Payments'];
  rows.forEach((s) => lines.push([s.invoiceNo, s.createdAt.toISOString(), s.cashier.name, s.subtotal, s.discount, s.total, s.payments.map((p) => `${p.method}:${p.amount}`).join(' | ')].map(csvCell).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sales.csv"');
  res.send('\uFEFF' + lines.join('\n'));
}));
r.get('/reports/stock.csv', auth(...GROUPS.money, 'INVENTORY'), wrap(async (req: any, res: any) => {
  const rows = await prisma.batch.findMany({ where: { branchId: req.user.branchId, availableQty: { gt: 0 } }, include: { medicine: { select: { name: true, strength: true } } }, orderBy: { expiryDate: 'asc' } });
  const lines = ['Medicine,Batch,Expiry,Qty,Cost,Value'];
  rows.forEach((b) => lines.push([b.medicine.name + (b.medicine.strength ? ' ' + b.medicine.strength : ''), b.batchNo, b.expiryDate.toISOString().slice(0, 10), b.availableQty, b.costPrice, Number(b.costPrice) * b.availableQty].map(csvCell).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="stock.csv"');
  res.send('\uFEFF' + lines.join('\n'));
}));

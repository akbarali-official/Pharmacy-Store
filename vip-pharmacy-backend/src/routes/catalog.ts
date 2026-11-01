import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { auth, GROUPS, wrap, audit, HttpError, pageOf } from '../middleware';
import { sellableStock } from '../stock';

export const r = Router();

// ---- Categories ----
r.get('/categories', wrap(async (_req: any, res: any) => res.json(await prisma.category.findMany({ where: { active: true }, orderBy: { name: 'asc' } }))));
r.post('/categories', auth(...GROUPS.stock), wrap(async (req: any, res: any) => {
  const b = z.object({ name: z.string().min(2).max(60) }).parse(req.body);
  const c = await prisma.category.create({ data: { name: b.name } });
  await audit(req, 'CREATE', 'Category', c.id);
  res.json(c);
}));

// ---- Medicines ----
const medSchema = z.object({
  name: z.string().min(1).max(120),
  genericName: z.string().max(120).nullish(),
  brand: z.string().max(120).nullish(),
  strength: z.string().max(40).nullish(),
  form: z.string().max(40).nullish(),
  manufacturer: z.string().max(120).nullish(),
  barcode: z.string().max(60).nullish().transform((v) => v || null),
  sku: z.string().max(40).optional(),
  packSize: z.string().max(40).nullish(),
  unit: z.string().max(20).default('pcs'),
  purchasePrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().int().min(0).default(10),
  requiresPrescription: z.boolean().default(false),
  showOnline: z.boolean().default(false),
  storageNotes: z.string().max(300).nullish(),
  categoryId: z.coerce.number().int().nullish(),
  active: z.boolean().optional(),
  force: z.boolean().optional(),
});

r.get('/medicines', auth(...GROUPS.all), wrap(async (req: any, res: any) => {
  const { q, categoryId, active } = req.query;
  const { page, pageSize, skip, take } = pageOf(req.query);
  const where: any = { active: active === 'false' ? false : true };
  if (categoryId) where.categoryId = Number(categoryId);
  if (q) {
    const s = String(q);
    where.OR = ['name', 'genericName', 'brand', 'barcode', 'sku'].map((f) => ({ [f]: { contains: s, mode: 'insensitive' } }));
  }
  const [total, items] = await Promise.all([
    prisma.medicine.count({ where }),
    prisma.medicine.findMany({ where, orderBy: { name: 'asc' }, skip, take, include: { category: true } }),
  ]);
  const stock = await sellableStock(items.map((m) => m.id), req.user.branchId);
  res.json({ total, page, pageSize, items: items.map((m) => ({ ...m, stock: stock.get(m.id) || 0 })) });
}));

r.post('/medicines', auth(...GROUPS.stock), wrap(async (req: any, res: any) => {
  const b = medSchema.parse(req.body);
  if (!b.force) {
    const dup = await prisma.medicine.findFirst({ where: { name: { equals: b.name, mode: 'insensitive' }, strength: b.strength ?? null, form: b.form ?? null, active: true } });
    if (dup) throw new HttpError(409, `Shayad yeh dawai pehle se hai: "${dup.name}". Phir bhi banani hai to "force" tick karein.`);
  }
  const { force, sku, ...data } = b;
  const m = await prisma.medicine.create({ data: { ...data, sku: sku || 'MED-' + Date.now().toString(36).toUpperCase() } });
  await audit(req, 'CREATE', 'Medicine', m.id, { name: m.name });
  res.json(m);
}));

r.patch('/medicines/:id', auth(...GROUPS.stock), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const { force, sku, ...data } = medSchema.partial().parse(req.body);
  const old = await prisma.medicine.findUnique({ where: { id } });
  if (!old) throw new HttpError(404, 'Dawai nahi mili');
  const m = await prisma.medicine.update({ where: { id }, data });
  await audit(req, 'UPDATE', 'Medicine', id, { sellingPrice: [String(old.sellingPrice), String(m.sellingPrice)], purchasePrice: [String(old.purchasePrice), String(m.purchasePrice)], active: m.active });
  res.json(m);
}));

// ---- POS search (barcode / name / generic / sku) ----
r.get('/pos/search', auth(...GROUPS.sell), wrap(async (req: any, res: any) => {
  const s = String(req.query.q || '').trim();
  if (!s) return res.json([]);
  const items = await prisma.medicine.findMany({
    where: { active: true, OR: ['name', 'genericName', 'brand', 'barcode', 'sku'].map((f) => ({ [f]: { contains: s, mode: 'insensitive' } })) },
    orderBy: { name: 'asc' },
    take: 20,
  });
  const stock = await sellableStock(items.map((m) => m.id), req.user.branchId);
  res.json(items.map((m) => ({ id: m.id, name: m.name, genericName: m.genericName, strength: m.strength, form: m.form, sku: m.sku, barcode: m.barcode, sellingPrice: m.sellingPrice, requiresPrescription: m.requiresPrescription, stock: stock.get(m.id) || 0 })));
}));

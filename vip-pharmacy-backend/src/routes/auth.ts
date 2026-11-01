import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db';
import { config } from '../config';
import { wrap, HttpError, auth, GROUPS, audit } from '../middleware';
import { setSettings } from './settings';

export const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Bohat zyada koshishain, 15 minute baad dobara try karein' } });
const sign = (u: any) => jwt.sign({ uid: u.id }, config.jwtSecret, { expiresIn: '12h' });
const safe = (u: any) => ({ id: u.id, name: u.name, email: u.email, role: u.role, branchId: u.branchId, active: u.active, lastLoginAt: u.lastLoginAt });
const ROLES = ['OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY', 'ACCOUNTANT'] as const;

r.get('/auth/status', wrap(async (_q: any, res: any) => res.json({ needsSetup: (await prisma.user.count()) === 0 })));

// Pehli dafa owner banane ka raasta (sirf jab koi user na ho)
r.post('/auth/setup', limiter, wrap(async (req: any, res: any) => {
  if ((await prisma.user.count()) > 0) throw new HttpError(403, 'Setup pehle ho chuka hai');
  const b = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), storeName: z.string().min(2) }).parse(req.body);
  let branch = await prisma.branch.findFirst();
  if (!branch) branch = await prisma.branch.create({ data: { name: 'Main Branch' } });
  const u = await prisma.user.create({ data: { name: b.name, email: b.email.toLowerCase(), passwordHash: await bcrypt.hash(b.password, 12), role: 'OWNER', branchId: branch.id } });
  await setSettings({ storeName: b.storeName });
  await prisma.auditLog.create({ data: { userId: u.id, action: 'SETUP', entity: 'User', entityId: String(u.id) } });
  res.json({ token: sign(u), user: safe(u) });
}));

r.post('/auth/login', limiter, wrap(async (req: any, res: any) => {
  const b = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: b.email.toLowerCase() } });
  const ok = u && u.active && (await bcrypt.compare(b.password, u.passwordHash));
  if (!ok) {
    await prisma.auditLog.create({ data: { action: 'LOGIN_FAIL', entity: 'User', meta: { email: b.email.toLowerCase() } } }).catch(() => {});
    throw new HttpError(401, 'Email ya password ghalat hai');
  }
  await prisma.user.update({ where: { id: u!.id }, data: { lastLoginAt: new Date() } });
  res.json({ token: sign(u), user: safe(u) });
}));

r.get('/auth/me', auth(), wrap(async (req: any, res: any) => res.json(safe(req.user))));

r.post('/auth/change-password', auth(), wrap(async (req: any, res: any) => {
  const b = z.object({ oldPassword: z.string(), newPassword: z.string().min(8) }).parse(req.body);
  if (!(await bcrypt.compare(b.oldPassword, req.user.passwordHash))) throw new HttpError(400, 'Purana password ghalat hai');
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(b.newPassword, 12) } });
  await audit(req, 'CHANGE_PASSWORD', 'User', req.user.id);
  res.json({ ok: true });
}));

// --- Staff management ---
r.get('/users', auth(...GROUPS.boss), wrap(async (_req: any, res: any) => {
  res.json((await prisma.user.findMany({ orderBy: { id: 'asc' } })).map(safe));
}));
r.post('/users', auth(...GROUPS.owner), wrap(async (req: any, res: any) => {
  const b = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.enum(ROLES) }).parse(req.body);
  const u = await prisma.user.create({ data: { name: b.name, email: b.email.toLowerCase(), passwordHash: await bcrypt.hash(b.password, 12), role: b.role, branchId: req.user.branchId } });
  await audit(req, 'CREATE', 'User', u.id, { role: b.role });
  res.json(safe(u));
}));
r.patch('/users/:id', auth(...GROUPS.owner), wrap(async (req: any, res: any) => {
  const id = Number(req.params.id);
  const b = z.object({ name: z.string().min(2).optional(), role: z.enum(ROLES).optional(), active: z.boolean().optional(), password: z.string().min(8).optional() }).parse(req.body);
  if (id === req.user.id && (b.active === false || (b.role && b.role !== 'OWNER'))) throw new HttpError(400, 'Apna owner account band/kam nahi kar sakte');
  const data: any = { name: b.name, role: b.role, active: b.active };
  if (b.password) data.passwordHash = await bcrypt.hash(b.password, 12);
  const u = await prisma.user.update({ where: { id }, data });
  await audit(req, 'UPDATE', 'User', id, { role: b.role, active: b.active, passwordReset: !!b.password });
  res.json(safe(u));
}));

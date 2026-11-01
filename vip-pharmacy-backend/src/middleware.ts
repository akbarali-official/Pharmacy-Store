import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { config } from './config';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const wrap = (fn: any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Role groups (server-side permission checks)
export const GROUPS = {
  all: ['OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY', 'ACCOUNTANT'],
  sell: ['OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER'],
  stock: ['OWNER', 'MANAGER', 'PHARMACIST', 'INVENTORY'],
  buy: ['OWNER', 'MANAGER', 'INVENTORY'],
  money: ['OWNER', 'MANAGER', 'ACCOUNTANT'],
  boss: ['OWNER', 'MANAGER'],
  owner: ['OWNER'],
};

export function auth(...allowed: string[]) {
  return wrap(async (req: any, _res: Response, next: NextFunction) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Login zaroori hai');
    let payload: any;
    try {
      payload = jwt.verify(h.slice(7), config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Session khatam ho gaya, dobara login karein');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.uid } });
    if (!user || !user.active) throw new HttpError(401, 'Account band hai ya mojood nahi');
    if (allowed.length && !allowed.includes(user.role)) throw new HttpError(403, 'Aap ko is kaam ki ijazat nahi');
    req.user = user;
    next();
  });
}

export const audit = (req: any, action: string, entity: string, entityId?: any, meta?: any) =>
  prisma.auditLog
    .create({ data: { userId: req.user?.id ?? null, action, entity, entityId: entityId != null ? String(entityId) : null, meta: meta ?? undefined } })
    .catch(() => {});

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError)
    return res.status(400).json({ error: 'Data theek nahi: ' + err.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ') });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Yeh record pehle se mojood hai (duplicate)' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Record nahi mila' });
    if (err.code === 'P2003') return res.status(409).json({ error: 'Yeh record doosre records se juda hai' });
  }
  console.error('ERROR:', err?.message); // body/password kabhi log nahi hota
  res.status(500).json({ error: 'Server mein masla aa gaya' });
}

export const pageOf = (q: any) => {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { auth, GROUPS, wrap, audit } from '../middleware';

export const DEFAULTS: Record<string, string> = {
  storeName: 'Mashallah Medical Store',
  address: '',
  phone: '',
  email: '',
  currency: 'Rs',
  timezone: 'Asia/Karachi',
  receiptHeader: '',
  receiptFooter: 'Shukriya! Dawai wapsi ke liye receipt saath laayein.',
  nearExpiryDays: '90',
  returnApprovalLimit: '5000',
  storeEnabled: 'false',
  deliveryFee: '150',
  minOrder: '0',
  storeNotice: 'Prescription wali dawaiyan online nahi bechi jati.',
};

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const s = { ...DEFAULTS };
  rows.forEach((r) => (s[r.key] = r.value));
  return s;
}
export async function setSettings(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in DEFAULTS)) continue;
    await prisma.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
  }
}

export const r = Router();
r.get('/settings', auth(...GROUPS.all), wrap(async (_req: any, res: any) => res.json(await getSettings())));
r.put('/settings', auth(...GROUPS.owner), wrap(async (req: any, res: any) => {
  const body = z.record(z.string().max(500)).parse(req.body);
  await setSettings(body);
  await audit(req, 'UPDATE', 'Settings', null, { keys: Object.keys(body) });
  res.json(await getSettings());
}));
r.get('/branches', auth(...GROUPS.all), wrap(async (_req: any, res: any) => res.json(await prisma.branch.findMany({ orderBy: { id: 'asc' } }))));
r.get('/audit', auth(...GROUPS.owner), wrap(async (_req: any, res: any) => {
  res.json(await prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: 200 }));
}));

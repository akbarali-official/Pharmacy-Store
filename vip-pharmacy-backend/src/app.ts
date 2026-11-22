import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { prisma } from './db.js';
import { errorHandler, wrap } from './middleware.js';
import { r as authR } from './routes/auth.js';
import { r as settingsR } from './routes/settings.js';
import { r as catalogR } from './routes/catalog.js';
import { r as inventoryR } from './routes/inventory.js';
import { r as posR } from './routes/pos.js';
import { r as partnersR } from './routes/partners.js';
import { r as financeR } from './routes/finance.js';
import { r as reportsR } from './routes/reports.js';
import { r as storeR } from './routes/store.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, cb) => (!origin || config.corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS: Website access is restricted'))),
}));
app.use(express.json({ limit: '1mb' }));

const api = express.Router();
api.get('/health', wrap(async (_req: any, res: any) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, time: new Date().toISOString() });
}));
[authR, settingsR, catalogR, inventoryR, posR, partnersR, financeR, reportsR, storeR].forEach((rt) => api.use(rt));
app.use('/api/v1', api);
app.use((_req, res) => res.status(404).json({ error: 'No alternative route is available' }));
app.use(errorHandler);

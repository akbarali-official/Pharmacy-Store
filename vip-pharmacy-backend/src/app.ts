import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { prisma } from './db';
import { errorHandler, wrap } from './middleware';
import { r as authR } from './routes/auth';
import { r as settingsR } from './routes/settings';
import { r as catalogR } from './routes/catalog';
import { r as inventoryR } from './routes/inventory';
import { r as posR } from './routes/pos';
import { r as partnersR } from './routes/partners';
import { r as financeR } from './routes/finance';
import { r as reportsR } from './routes/reports';
import { r as storeR } from './routes/store';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, cb) => (!origin || config.corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('CORS: yeh website allowed nahi'))),
}));
app.use(express.json({ limit: '1mb' }));

const api = express.Router();
api.get('/health', wrap(async (_req: any, res: any) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, time: new Date().toISOString() });
}));
[authR, settingsR, catalogR, inventoryR, posR, partnersR, financeR, reportsR, storeR].forEach((rt) => api.use(rt));
app.use('/api/v1', api);
app.use((_req, res) => res.status(404).json({ error: 'Raasta nahi mila' }));
app.use(errorHandler);

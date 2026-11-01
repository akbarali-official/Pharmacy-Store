import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export const D = (v: any) => new Prisma.Decimal(v ?? 0);
export type Tx = Prisma.TransactionClient;

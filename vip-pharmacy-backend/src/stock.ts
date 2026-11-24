import { prisma, Tx } from './db';
import { HttpError } from './middleware';

// Date-only (UTC midnight) for today. A batch can be sold up to and including its expiry date.
export const todayDate = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

export const validBatchWhere = (branchId: number, medicineId?: number | { in: number[] }) => ({
  ...(medicineId !== undefined ? { medicineId } : {}),
  branchId,
  status: 'ACTIVE',
  availableQty: { gt: 0 },
  expiryDate: { gte: todayDate() },
});

// FEFO: the batch that expires first is sold first
export async function allocateFefo(tx: Tx, medicineId: number, branchId: number, qty: number, name: string) {
  const batches = await tx.batch.findMany({
    where: validBatchWhere(branchId, medicineId) as any,
    orderBy: [{ expiryDate: 'asc' }, { id: 'asc' }],
  });
  let need = qty;
  const out: { batch: any; qty: number }[] = [];
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(need, b.availableQty);
    out.push({ batch: b, qty: take });
    need -= take;
  }
  if (need > 0) throw new HttpError(409, `Not enough valid stock for: ${name}`);
  return out;
}

// Atomic guard: stock can never go negative, even if two cashiers sell at the same time
export async function takeFromBatch(tx: Tx, batchId: number, qty: number) {
  const r = await tx.batch.updateMany({ where: { id: batchId, availableQty: { gte: qty } }, data: { availableQty: { decrement: qty } } });
  if (r.count === 0) throw new HttpError(409, 'This stock was just sold in another sale — please try again');
}

export async function nextNumber(tx: Tx, key: string) {
  const c = await tx.counter.upsert({ where: { key }, update: { value: { increment: 1 } }, create: { key, value: 1 } });
  return c.value;
}

export async function sellableStock(medicineIds: number[], branchId: number) {
  const rows = await prisma.batch.groupBy({
    by: ['medicineId'],
    where: validBatchWhere(branchId, { in: medicineIds }) as any,
    _sum: { availableQty: true },
  });
  return new Map(rows.map((r) => [r.medicineId, r._sum.availableQty || 0]));
}

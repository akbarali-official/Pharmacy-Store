// DEMO DATA — sirf test ke liye. Asli dukaan par chalane se pehle demo dawaiyan archive/delete kar dein.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const inDays = (n: number) => new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + n));

async function main() {
  const branch = (await prisma.branch.findFirst()) ?? (await prisma.branch.create({ data: { name: 'Main Branch' } }));
  const cats: Record<string, number> = {};
  for (const name of ['Pain & Fever', 'Antibiotics', 'Vitamins', 'Stomach', 'Cough & Cold', 'First Aid']) {
    cats[name] = (await prisma.category.upsert({ where: { name }, update: {}, create: { name } })).id;
  }
  await prisma.supplier.upsert({ where: { name: 'DEMO Supplier' }, update: {}, create: { name: 'DEMO Supplier', phone: '0300-0000000', notes: 'DEMO DATA' } });

  const demo = [
    ['Panadol', 'Paracetamol', '500mg', 'Tablet', 'Pain & Fever', 2.5, 3.5, false, true],
    ['Brufen', 'Ibuprofen', '400mg', 'Tablet', 'Pain & Fever', 4, 6, false, true],
    ['Augmentin', 'Amoxicillin+Clavulanate', '625mg', 'Tablet', 'Antibiotics', 38, 55, true, false],
    ['Calpol', 'Paracetamol', '120mg/5ml', 'Syrup', 'Pain & Fever', 70, 95, false, true],
    ['Surbex Z', 'Multivitamin+Zinc', '', 'Tablet', 'Vitamins', 18, 26, false, true],
    ['Risek', 'Omeprazole', '20mg', 'Capsule', 'Stomach', 14, 20, false, true],
    ['ORS Sachet', 'Oral Rehydration Salts', '', 'Sachet', 'Stomach', 12, 20, false, true],
    ['Ventolin', 'Salbutamol', '100mcg', 'Inhaler', 'Cough & Cold', 380, 480, true, false],
    ['Benadryl', 'Diphenhydramine', '', 'Syrup', 'Cough & Cold', 110, 150, false, true],
    ['Dettol Antiseptic', '', '250ml', 'Liquid', 'First Aid', 220, 290, false, true],
    ['Bandage Roll', '', '4 inch', 'Pcs', 'First Aid', 25, 40, false, true],
    ['Disprin', 'Aspirin', '300mg', 'Tablet', 'Pain & Fever', 1.5, 2.5, false, true],
  ] as const;

  let i = 0;
  for (const [name, generic, strength, form, cat, cost, price, rx, online] of demo) {
    i++;
    const sku = 'DEMO-' + String(i).padStart(3, '0');
    const med = await prisma.medicine.upsert({
      where: { sku },
      update: {},
      create: { name, genericName: generic || null, strength: strength || null, form, sku, categoryId: cats[cat], purchasePrice: cost, sellingPrice: price, requiresPrescription: rx, showOnline: online, reorderLevel: 20, storageNotes: 'DEMO DATA' },
    });
    // Do batches: ek aam, ek jald expire hone wali (FEFO test ke liye)
    for (const [suffix, days, qty] of [['A', 400, 120], ['B', i % 4 === 0 ? 30 : 200, 40]] as const) {
      const batchNo = `D${i}${suffix}`;
      const exists = await prisma.batch.findUnique({ where: { medicineId_branchId_batchNo: { medicineId: med.id, branchId: branch.id, batchNo } } });
      if (exists) continue;
      const b = await prisma.batch.create({ data: { medicineId: med.id, branchId: branch.id, batchNo, expiryDate: inDays(days), costPrice: cost, receivedQty: qty, availableQty: qty } });
      await prisma.stockMovement.create({ data: { batchId: b.id, medicineId: med.id, branchId: branch.id, type: 'ADJUST_IN', qty, reason: 'DEMO opening stock' } });
    }
  }
  console.log('Demo data tayyar. (Admin user "Setup" screen se banega, yahan nahi.)');
}
main().finally(() => prisma.$disconnect());

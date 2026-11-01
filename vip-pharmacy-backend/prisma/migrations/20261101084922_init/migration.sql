-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'PHARMACIST', 'CASHIER', 'INVENTORY', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "MoveType" AS ENUM ('PURCHASE', 'SALE', 'RETURN_IN', 'ADJUST_IN', 'ADJUST_OUT', 'ONLINE_OUT', 'ONLINE_RESTORE');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('CASH', 'CARD', 'BANK', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "Branch" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "branchId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicine" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "brand" TEXT,
    "strength" TEXT,
    "form" TEXT,
    "manufacturer" TEXT,
    "barcode" TEXT,
    "sku" TEXT NOT NULL,
    "packSize" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "purchasePrice" DECIMAL(12,2) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "reorderLevel" INTEGER NOT NULL DEFAULT 10,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "showOnline" BOOLEAN NOT NULL DEFAULT false,
    "storageNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" SERIAL NOT NULL,
    "medicineId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "receivedQty" INTEGER NOT NULL,
    "availableQty" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "purchaseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "batchId" INTEGER NOT NULL,
    "medicineId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "type" "MoveType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT,
    "refType" TEXT,
    "refId" INTEGER,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "invoiceNo" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" SERIAL NOT NULL,
    "purchaseId" INTEGER NOT NULL,
    "medicineId" INTEGER NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" DATE NOT NULL,
    "qty" INTEGER NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "CashSession" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingCash" DECIMAL(12,2) NOT NULL,
    "closingCash" DECIMAL(12,2),
    "expectedCash" DECIMAL(12,2),
    "variance" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT,

    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "cashierId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "cashSessionId" INTEGER,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paid" DECIMAL(12,2) NOT NULL,
    "changeDue" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "medicineId" INTEGER NOT NULL,
    "batchId" INTEGER NOT NULL,
    "nameSnap" TEXT NOT NULL,
    "skuSnap" TEXT NOT NULL,
    "batchNoSnap" TEXT NOT NULL,
    "expirySnap" DATE NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "method" "PayMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturn" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "cashSessionId" INTEGER,
    "refundMethod" "PayMethod" NOT NULL,
    "refundAmount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReturnItem" (
    "id" SERIAL NOT NULL,
    "returnId" INTEGER NOT NULL,
    "saleItemId" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "cashSessionId" INTEGER,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PayMethod" NOT NULL DEFAULT 'CASH',
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineOrder" (
    "id" SERIAL NOT NULL,
    "orderNo" TEXT NOT NULL,
    "branchId" INTEGER NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "note" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "deliveryFee" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineOrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "medicineId" INTEGER NOT NULL,
    "nameSnap" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OnlineOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderHistory" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_name_key" ON "Branch"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_barcode_key" ON "Medicine"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_sku_key" ON "Medicine"("sku");

-- CreateIndex
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");

-- CreateIndex
CREATE INDEX "Medicine_genericName_idx" ON "Medicine"("genericName");

-- CreateIndex
CREATE INDEX "Batch_medicineId_branchId_expiryDate_idx" ON "Batch"("medicineId", "branchId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_medicineId_branchId_batchNo_key" ON "Batch"("medicineId", "branchId", "batchNo");

-- CreateIndex
CREATE INDEX "StockMovement_batchId_idx" ON "StockMovement"("batchId");

-- CreateIndex
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_invoiceNo_key" ON "Sale"("invoiceNo");

-- CreateIndex
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnlineOrder_orderNo_key" ON "OnlineOrder"("orderNo");

-- CreateIndex
CREATE INDEX "OnlineOrder_status_idx" ON "OnlineOrder"("status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Medicine" ADD CONSTRAINT "Medicine_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineOrder" ADD CONSTRAINT "OnlineOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineOrderItem" ADD CONSTRAINT "OnlineOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlineOrderItem" ADD CONSTRAINT "OnlineOrderItem_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderHistory" ADD CONSTRAINT "OrderHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

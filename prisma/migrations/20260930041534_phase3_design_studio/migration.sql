-- DropIndex
DROP INDEX "CartItem_cartId_variantId_key";

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "designId" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "includeCustom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "designBackPreviewUrl" TEXT,
ADD COLUMN     "designFrontPreviewUrl" TEXT,
ADD COLUMN     "designId" TEXT,
ADD COLUMN     "heldAt" TIMESTAMP(3),
ADD COLUMN     "holdNote" TEXT,
ADD COLUMN     "printBackUrl" TEXT,
ADD COLUMN     "printFrontUrl" TEXT,
ADD COLUMN     "printedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StoreSetting" ADD COLUMN     "customBackFeePaise" INTEGER NOT NULL DEFAULT 14900,
ADD COLUMN     "customFrontFeePaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "cartToken" TEXT,
    "productId" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "frontJson" JSONB,
    "backJson" JSONB,
    "frontPreviewKey" TEXT,
    "backPreviewKey" TEXT,
    "frontPrintKey" TEXT,
    "backPrintKey" TEXT,
    "assetKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rightsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Design_userId_idx" ON "Design"("userId");

-- CreateIndex
CREATE INDEX "Design_cartToken_idx" ON "Design"("cartToken");

-- CreateIndex
CREATE INDEX "Design_createdAt_idx" ON "Design"("createdAt");

-- CreateIndex
CREATE INDEX "CartItem_cartId_variantId_idx" ON "CartItem"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_designId_key" ON "CartItem"("cartId", "designId");

-- CreateIndex
CREATE INDEX "OrderItem_designId_idx" ON "OrderItem"("designId");

-- CreateIndex
CREATE INDEX "OrderItem_printedAt_idx" ON "OrderItem"("printedAt");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Plain (non-custom) lines stay unique per variant; custom lines are unique per design (CartItem_cartId_designId_key).
-- Prisma cannot model partial indexes: never let a later generated migration drop this one.
CREATE UNIQUE INDEX "CartItem_cartId_variantId_plain_key" ON "CartItem"("cartId", "variantId") WHERE "designId" IS NULL;

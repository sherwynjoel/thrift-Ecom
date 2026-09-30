-- CreateTable
CREATE TABLE "DesignAsset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "cartToken" TEXT,
    "designId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesignAsset_key_key" ON "DesignAsset"("key");

-- CreateIndex
CREATE INDEX "DesignAsset_userId_idx" ON "DesignAsset"("userId");

-- CreateIndex
CREATE INDEX "DesignAsset_cartToken_idx" ON "DesignAsset"("cartToken");

-- CreateIndex
CREATE INDEX "DesignAsset_designId_createdAt_idx" ON "DesignAsset"("designId", "createdAt");

-- AddForeignKey
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignAsset" ADD CONSTRAINT "DesignAsset_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE SET NULL ON UPDATE CASCADE;

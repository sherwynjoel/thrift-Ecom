-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscriber_createdAt_idx" ON "Subscriber"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_source_key" ON "Subscriber"("email", "source");

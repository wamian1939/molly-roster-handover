CREATE TABLE "shift_create_requests" (
    "id" UUID NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_create_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shift_create_requests_shiftId_key" ON "shift_create_requests"("shiftId");
CREATE INDEX "shift_create_requests_storeId_accountId_idx" ON "shift_create_requests"("storeId", "accountId");

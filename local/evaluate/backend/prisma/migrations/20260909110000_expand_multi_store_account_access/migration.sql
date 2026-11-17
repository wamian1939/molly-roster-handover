ALTER TYPE "AuthAuditEventType" ADD VALUE IF NOT EXISTS 'ACCOUNT_UPDATED';
ALTER TYPE "AuthAuditEventType" ADD VALUE IF NOT EXISTS 'ACCOUNT_DELETED';

ALTER TABLE "user_accounts"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByAccountId" TEXT;

CREATE TABLE "user_account_store_accesses" (
  "accountId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedByAccountId" TEXT,
  CONSTRAINT "user_account_store_accesses_pkey" PRIMARY KEY ("accountId", "storeId")
);

INSERT INTO "user_account_store_accesses" ("accountId", "storeId")
SELECT "id", "storeId"
FROM "user_accounts"
WHERE "role" = 'STORE_EVALUATOR'
  AND "storeId" IS NOT NULL
ON CONFLICT ("accountId", "storeId") DO NOTHING;

CREATE INDEX "user_accounts_deletedAt_role_isActive_idx"
ON "user_accounts"("deletedAt", "role", "isActive");

CREATE INDEX "user_account_store_accesses_storeId_accountId_idx"
ON "user_account_store_accesses"("storeId", "accountId");

CREATE INDEX "user_account_store_accesses_assignedByAccountId_idx"
ON "user_account_store_accesses"("assignedByAccountId");

ALTER TABLE "user_accounts"
ADD CONSTRAINT "user_accounts_deletedByAccountId_fkey"
FOREIGN KEY ("deletedByAccountId") REFERENCES "user_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_account_store_accesses"
ADD CONSTRAINT "user_account_store_accesses_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "user_accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_account_store_accesses"
ADD CONSTRAINT "user_account_store_accesses_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_account_store_accesses"
ADD CONSTRAINT "user_account_store_accesses_assignedByAccountId_fkey"
FOREIGN KEY ("assignedByAccountId") REFERENCES "user_accounts"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

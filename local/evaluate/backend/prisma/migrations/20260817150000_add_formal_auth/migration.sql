CREATE TYPE "AccountRole" AS ENUM ('ADMIN', 'STORE_EVALUATOR');

CREATE TABLE "user_accounts" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "AccountRole" NOT NULL,
  "storeId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_accounts_role_store_check" CHECK (
    ("role" = 'ADMIN' AND "storeId" IS NULL)
    OR ("role" = 'STORE_EVALUATOR' AND "storeId" IS NOT NULL)
  )
);

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluations" ADD COLUMN "evaluatorAccountId" TEXT;

CREATE UNIQUE INDEX "user_accounts_username_key" ON "user_accounts"("username");
CREATE INDEX "user_accounts_storeId_isActive_idx" ON "user_accounts"("storeId", "isActive");
CREATE INDEX "user_accounts_role_isActive_idx" ON "user_accounts"("role", "isActive");
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");
CREATE INDEX "evaluations_evaluatorAccountId_idx" ON "evaluations"("evaluatorAccountId");

ALTER TABLE "user_accounts"
  ADD CONSTRAINT "user_accounts_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_evaluatorAccountId_fkey"
  FOREIGN KEY ("evaluatorAccountId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

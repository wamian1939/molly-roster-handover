CREATE TYPE "AuthAuditEventType" AS ENUM (
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'ACCOUNT_CREATED',
  'PASSWORD_RESET',
  'ACCOUNT_DEACTIVATED'
);

CREATE TABLE "auth_audit_events" (
  "id" TEXT NOT NULL,
  "accountId" TEXT,
  "eventType" "AuthAuditEventType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_audit_events_accountId_createdAt_idx"
  ON "auth_audit_events"("accountId", "createdAt");
CREATE INDEX "auth_audit_events_eventType_createdAt_idx"
  ON "auth_audit_events"("eventType", "createdAt");

ALTER TABLE "auth_audit_events"
  ADD CONSTRAINT "auth_audit_events_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "user_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

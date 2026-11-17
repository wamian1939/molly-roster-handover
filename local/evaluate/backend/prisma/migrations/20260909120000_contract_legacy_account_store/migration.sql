-- Contract phase: application authorization now reads user_account_store_accesses exclusively.
ALTER TABLE "user_accounts" DROP CONSTRAINT IF EXISTS "user_accounts_role_store_check";
ALTER TABLE "user_accounts" DROP CONSTRAINT IF EXISTS "user_accounts_storeId_fkey";
DROP INDEX IF EXISTS "user_accounts_storeId_isActive_idx";
ALTER TABLE "user_accounts" DROP COLUMN IF EXISTS "storeId";

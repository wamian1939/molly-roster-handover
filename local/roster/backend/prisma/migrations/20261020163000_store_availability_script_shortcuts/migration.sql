CREATE TABLE "availability_script_shortcuts" (
    "storeId" TEXT NOT NULL,
    "shortcuts" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "availability_script_shortcuts_pkey" PRIMARY KEY ("storeId")
);

ALTER TABLE "availability_script_shortcuts"
    ADD CONSTRAINT "availability_script_shortcuts_version_check" CHECK ("version" > 0);

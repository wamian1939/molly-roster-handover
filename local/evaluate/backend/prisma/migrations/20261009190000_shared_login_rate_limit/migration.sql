CREATE TABLE "login_rate_limits" (
    "keyHash" CHAR(64) NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_rate_limits_pkey" PRIMARY KEY ("keyHash"),
    CONSTRAINT "login_rate_limits_attempt_count_check" CHECK ("attemptCount" BETWEEN 1 AND 11)
);

CREATE INDEX "login_rate_limits_startedAt_idx" ON "login_rate_limits"("startedAt");

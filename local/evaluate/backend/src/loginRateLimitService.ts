import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizeUsername } from "./auth.js";

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export class LoginRateLimitService {
  private lastPrunedAt = 0;

  constructor(private readonly db: PrismaClient) {}

  async reserve(ipAddress: string, username: string): Promise<number> {
    const keyHash = loginLimitKey(ipAddress, username);
    const now = new Date();
    const staleBefore = new Date(now.getTime() - WINDOW_MS);
    if (now.getTime() - this.lastPrunedAt >= WINDOW_MS) {
      await this.db.loginRateLimit.deleteMany({ where: { startedAt: { lt: staleBefore } } });
      this.lastPrunedAt = now.getTime();
    }
    const rows = await this.db.$queryRaw<Array<{ attemptCount: number; startedAt: Date }>>`
      INSERT INTO "login_rate_limits" ("keyHash", "attemptCount", "startedAt")
      VALUES (${keyHash}, 1, ${now})
      ON CONFLICT ("keyHash") DO UPDATE SET
        "attemptCount" = CASE
          WHEN "login_rate_limits"."startedAt" <= ${staleBefore} THEN 1
          ELSE LEAST("login_rate_limits"."attemptCount" + 1, ${MAX_ATTEMPTS + 1})
        END,
        "startedAt" = CASE
          WHEN "login_rate_limits"."startedAt" <= ${staleBefore} THEN ${now}
          ELSE "login_rate_limits"."startedAt"
        END
      RETURNING "attemptCount", "startedAt"
    `;
    const entry = rows[0];
    if (!entry) throw new Error("Login limit reservation did not return a row.");
    if (entry.attemptCount <= MAX_ATTEMPTS) return 0;
    return Math.max(1, Math.ceil((entry.startedAt.getTime() + WINDOW_MS - now.getTime()) / 1000));
  }

  async clear(ipAddress: string, username: string) {
    await this.db.loginRateLimit.deleteMany({ where: { keyHash: loginLimitKey(ipAddress, username) } });
  }
}

function loginLimitKey(ipAddress: string, username: string) {
  return createHash("sha256").update(ipAddress).update("\0").update(normalizeUsername(username)).digest("hex");
}

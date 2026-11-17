import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const url = new URL(connection);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/molly_roster") {
  throw new Error("This read-only audit is restricted to the local molly_roster database");
}
const db = new PrismaClient();
try {
  const [counts] = await db.$queryRaw<Array<{ totalShifts: number; wrongStore: number; outsidePeriod: number; compoundStoreForeignKey: boolean }>>`
    SELECT COUNT(*)::integer AS "totalShifts",
      COUNT(*) FILTER (WHERE s."storeId" <> p."storeId")::integer AS "wrongStore",
      COUNT(*) FILTER (WHERE s."date" < p."startDate" OR s."date" > p."endDate")::integer AS "outsidePeriod",
      EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = 'shifts_rosterPeriodId_storeId_fkey'
        AND c.conrelid = 'shifts'::regclass AND c.convalidated) AS "compoundStoreForeignKey"
    FROM "shifts" s JOIN "roster_periods" p ON p."id" = s."rosterPeriodId"
  `;
  console.log(JSON.stringify({ database: url.pathname.slice(1), schema: url.searchParams.get("schema") ?? "public", ...counts }));
} finally {
  await db.$disconnect();
}

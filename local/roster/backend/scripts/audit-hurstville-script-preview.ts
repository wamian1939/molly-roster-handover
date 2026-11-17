import "dotenv/config";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const url = new URL(connection);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433" ||
    url.pathname !== "/molly_roster" || ![null, "public"].includes(url.searchParams.get("schema"))) {
  throw new Error("Expected the local public Molly Roster database");
}
const db = new PrismaClient();
try {
  const [availability, imports, shifts, periods, publications, shortcuts] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "hurstville" }, select: {
      id: true, version: true, employeeId: true, date: true, status: true, startAt: true, endAt: true,
    }, orderBy: { id: "asc" } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "hurstville" }, select: { id: true }, orderBy: { id: "asc" } }),
    db.shift.findMany({ where: { storeId: "hurstville" }, include: { assignments: { orderBy: { id: "asc" } } },
      orderBy: { id: "asc" } }),
    db.rosterPeriod.findMany({ where: { storeId: "hurstville" }, orderBy: { id: "asc" } }),
    db.rosterPublication.findMany({ where: { rosterPeriod: { storeId: "hurstville" } }, orderBy: { id: "asc" } }),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId: "hurstville" }, select: {
      version: true, shortcuts: true,
    } }),
  ]);
  const digest = createHash("sha256").update(JSON.stringify(availability)).digest("hex");
  const shortcutDigest = shortcuts ? createHash("sha256").update(JSON.stringify(shortcuts.shortcuts)).digest("hex") : null;
  const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  console.log(JSON.stringify({ storeId: "hurstville", availabilityCount: availability.length,
    availabilityDigest: digest, scriptImportCount: imports.length, shiftCount: shifts.length,
    shiftDigest: fingerprint(shifts), periodCount: periods.length, periodDigest: fingerprint(periods),
    publicationCount: publications.length, publicationDigest: fingerprint(publications),
    shortcutVersion: shortcuts?.version ?? null, shortcutDigest }));
} finally {
  await db.$disconnect();
}

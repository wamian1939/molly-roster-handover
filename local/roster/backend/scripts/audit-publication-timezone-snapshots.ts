import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const publications = await db.rosterPublication.findMany({
    select: { snapshot: true, publishedAt: true, rosterPeriod: { select: { storeId: true } } },
  });
  const missing = publications.filter(({ snapshot }) => typeof snapshot !== "object" || snapshot === null
    || Array.isArray(snapshot) || typeof snapshot.timezone !== "string" || !snapshot.timezone);
  const settings = await db.rosterStoreSettings.findMany({ select: { storeId: true, createdAt: true, updatedAt: true } });
  const settingsByStore = new Map(settings.map((row) => [row.storeId, row]));
  const stores = new Set(missing.map((row) => row.rosterPeriod.storeId));
  console.log(JSON.stringify({ total: publications.length, missingTimezone: missing.length,
    affectedStores: stores.size,
    missingSettings: [...stores].filter((storeId) => !settingsByStore.has(storeId)).length,
    settingsCreatedAfterPublication: missing.filter((row) => {
      const current = settingsByStore.get(row.rosterPeriod.storeId);
      return current && current.createdAt > row.publishedAt;
    }).length,
    settingsUpdatedAfterPublication: missing.filter((row) => {
      const current = settingsByStore.get(row.rosterPeriod.storeId);
      return current && current.updatedAt > row.publishedAt;
    }).length }));
} finally {
  await db.$disconnect();
}

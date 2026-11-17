import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as {
  schema: string;
  isolatedUrl: string;
};
const url = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema)
  || !(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "5432"
    && url.pathname === "/evaluate_molly" && url.searchParams.get("schema") === state.schema)) {
  throw new Error("Workforce revision fixture requires the disposable local Evaluate browser schema.");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const store = await db.store.findUnique({ where: { id: "browser-store" }, select: { id: true } });
  if (!store) throw new Error("Browser acceptance store is missing.");
  await db.employee.createMany({
    data: Array.from({ length: 91 }, (_, index) => ({
      id: `revision-extra-${index + 1}`,
      storeId: store.id,
      displayName: `Extra ${String(index + 1).padStart(3, "0")}`,
      employmentType: "FullTime" as const,
    })),
    skipDuplicates: true,
  });
  const count = await db.employee.count({ where: { storeId: store.id, status: "Active" } });
  if (count !== 101) throw new Error(`Expected exactly 101 disposable active employees, found ${count}.`);
  console.log(JSON.stringify({ seeded: true, schema: state.schema, activeEmployees: count }));
} finally {
  await db.$disconnect();
}

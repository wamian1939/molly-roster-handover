import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireEvaluate = createRequire(join(workspace, "..", "Evaluate Molly", "backend", "package.json"));
const { PrismaClient } = requireEvaluate("@prisma/client");
const fixture = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8"));
const url = new URL(fixture.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5432"
  || url.pathname !== "/evaluate_molly" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable Evaluate schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  await db.employee.create({ data: {
    id: "browser-selected-employee-alias", storeId: "browser-store", displayName: "SelectedEmployee",
    employmentType: "FullTime", employeeType: "REGULAR",
  } });
  await db.employee.create({ data: {
    id: "browser-punctuation-name", storeId: "browser-store", displayName: "Anne (Tea) & Co",
    employmentType: "FullTime", employeeType: "REGULAR",
  } });
  console.log(JSON.stringify({ seeded: true, schema: fixture.schema,
    employeeIds: ["browser-selected-employee-alias", "browser-punctuation-name"] }));
} finally {
  await db.$disconnect();
}

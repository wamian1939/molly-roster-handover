import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

type Column = { table_name: string; column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
type Constraint = { table_name: string; constraint_name: string; constraint_type: string; definition: string };
type Index = { tablename: string; indexname: string; indexdef: string };
type Trigger = { table_name: string; trigger_name: string; definition: string };

const db = new PrismaClient();
try {
  const columns = await db.$queryRaw<Column[]>`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name <> '_prisma_migrations'
    ORDER BY table_name, ordinal_position
  `;
  const constraints = await db.$queryRaw<Constraint[]>`
    SELECT rel.relname AS table_name, con.conname AS constraint_name,
      CASE con.contype WHEN 'p' THEN 'PK' WHEN 'u' THEN 'UNIQUE' WHEN 'f' THEN 'FK' WHEN 'c' THEN 'CHECK' ELSE con.contype::text END AS constraint_type,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = current_schema() AND rel.relname <> '_prisma_migrations'
    ORDER BY rel.relname, constraint_type, con.conname
  `;
  const indexes = await db.$queryRaw<Index[]>`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
    ORDER BY tablename, indexname
  `;
  const triggers = await db.$queryRaw<Trigger[]>`
    SELECT rel.relname AS table_name, trg.tgname AS trigger_name, pg_get_triggerdef(trg.oid) AS definition
    FROM pg_trigger trg
    JOIN pg_class rel ON rel.oid = trg.tgrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = current_schema() AND NOT trg.tgisinternal AND rel.relname <> '_prisma_migrations'
    ORDER BY rel.relname, trg.tgname
  `;
  const tables = [...new Set(columns.map((column) => column.table_name))];
  const lines = [
    "# PostgreSQL schema inventory",
    "",
    `Generated ${new Date().toISOString()} from the local development database, schema \`${new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown").searchParams.get("schema") ?? "public"}\`. Schema metadata only; no employee values or credentials are included.`,
    "",
    "This is direct PostgreSQL catalog evidence for the database audit. Foreign-key definitions include ON DELETE and ON UPDATE when they differ from PostgreSQL defaults. Index listings include primary and unique indexes.",
    "",
  ];
  for (const table of tables) {
    lines.push(`## \`${table}\``, "", "| Column | PostgreSQL type | Nullable | Default |", "|---|---|---|---|");
    for (const column of columns.filter((item) => item.table_name === table)) {
      const type = column.data_type === "USER-DEFINED" ? column.udt_name : column.data_type;
      lines.push(`| \`${column.column_name}\` | \`${type}\` | ${column.is_nullable} | ${column.column_default ? `\`${column.column_default.replaceAll("|", "\\|")}\`` : ""} |`);
    }
    lines.push("", "**Constraints**", "");
    for (const constraint of constraints.filter((item) => item.table_name === table)) {
      lines.push(`- ${constraint.constraint_type} \`${constraint.constraint_name}\`: \`${constraint.definition}\``);
    }
    lines.push("", "**Indexes**", "");
    for (const index of indexes.filter((item) => item.tablename === table)) {
      lines.push(`- \`${index.indexname}\`: \`${index.indexdef}\``);
    }
    const tableTriggers = triggers.filter((item) => item.table_name === table);
    if (tableTriggers.length) {
      lines.push("", "**Triggers**", "");
      for (const trigger of tableTriggers) lines.push(`- \`${trigger.trigger_name}\`: \`${trigger.definition}\``);
    }
    lines.push("");
  }
  const target = resolve(process.cwd(), "../docs/DATABASE_SCHEMA_INVENTORY.md");
  await writeFile(target, lines.join("\n"), "utf8");
  console.log(JSON.stringify({ target, tables: tables.length, columns: columns.length, constraints: constraints.length, indexes: indexes.length, triggers: triggers.length }));
} finally {
  await db.$disconnect();
}

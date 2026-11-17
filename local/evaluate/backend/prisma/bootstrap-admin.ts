import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword, normalizeUsername } from "../src/auth.js";

const prisma = new PrismaClient();

async function main() {
  const username = normalizeUsername(required("ADMIN_USERNAME"));
  const displayName = required("ADMIN_DISPLAY_NAME");
  const password = required("ADMIN_INITIAL_PASSWORD");
  if (password.length < 8) throw new Error("ADMIN_INITIAL_PASSWORD must contain at least 8 characters.");

  const existingAdmin = await prisma.userAccount.findFirst({ where: { role: "ADMIN" }, select: { username: true } });
  if (existingAdmin) throw new Error(`An ADMIN account already exists (${existingAdmin.username}).`);

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const account = await tx.userAccount.create({
      data: {
        username,
        displayName,
        passwordHash,
        role: "ADMIN",
      },
    });
    await tx.authAuditEvent.create({
      data: {
        accountId: account.id,
        eventType: "ACCOUNT_CREATED",
        metadata: { source: "bootstrap" },
      },
    });
  });
  console.log(`Created ADMIN account: ${username}`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

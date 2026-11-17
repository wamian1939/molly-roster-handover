import { Prisma, type PrismaClient, type SkillStatus } from "@prisma/client";
import { createHttpError } from "./httpError.js";

export class CurrentSkillService {
  constructor(private readonly db: PrismaClient) {}

  async listConfirmations(employeeId: string, definitionId: string, page: number, pageSize: number) {
    const where = { employeeId, skillDefinitionId: definitionId };
    const [total, rows] = await this.db.$transaction([
      this.db.currentSkillConfirmation.count({ where }),
      this.db.currentSkillConfirmation.findMany({
        where,
        orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, previousStatus: true, confirmedStatus: true, reason: true, confirmedAt: true,
          confirmedByAccountId: true,
          confirmedByAccount: { select: { displayName: true } },
        },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return {
      items: rows.map(({ confirmedByAccount, confirmedAt, ...row }) => ({
        ...row, confirmedByName: confirmedByAccount.displayName, confirmedAt: confirmedAt.toISOString(),
      })),
      page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    };
  }

  async list(employeeId: string) {
    const [definitions, current] = await Promise.all([
      this.db.skillDefinition.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
        select: { id: true, code: true, nameZh: true, category: true, skillMode: true },
      }),
      this.db.employeeSkill.findMany({
        where: { employeeId },
        select: { skillDefinitionId: true, status: true, updatedAt: true },
      }),
    ]);
    const byDefinition = new Map(current.map((row) => [row.skillDefinitionId, row]));
    return definitions.map((definition) => {
      const row = byDefinition.get(definition.id);
      return { ...definition, status: row?.status ?? "Unknown", updatedAt: row?.updatedAt.toISOString() ?? null };
    });
  }

  async confirm(employeeId: string, definitionId: string, status: SkillStatus, expectedUpdatedAt: string | null, actorId: string, reason: string | null = null) {
    try {
      await this.db.$transaction(async (tx) => {
        const [employee, definition, current] = await Promise.all([
          tx.employee.findUnique({ where: { id: employeeId }, select: { status: true } }),
          tx.skillDefinition.findUnique({ where: { id: definitionId }, select: { skillMode: true, isActive: true } }),
          tx.employeeSkill.findUnique({ where: { employeeId_skillDefinitionId: { employeeId, skillDefinitionId: definitionId } } }),
        ]);
        if (!employee) throw createHttpError(404, "Employee does not exist.");
        if (employee.status !== "Active") throw createHttpError(409, "Only active employee skills can be confirmed.");
        if (!definition?.isActive) throw createHttpError(404, "Active skill definition does not exist.");
        if (definition.skillMode === "BINARY" && !["Unknown", "CannotDo", "CanDo"].includes(status)) {
          throw createHttpError(400, "This operation skill requires Unknown, CannotDo, or CanDo.");
        }
        if (definition.skillMode === "PROGRESSIVE" && !["Unknown", "NotTrained", "Training", "Independent", "Proficient"].includes(status)) {
          throw createHttpError(400, "This progressive skill requires a progressive status.");
        }
        if ((current?.updatedAt.toISOString() ?? null) !== expectedUpdatedAt) {
          throw createHttpError(409, "Current skill changed. Refresh before confirming.");
        }
        if (current) {
          const changed = await tx.employeeSkill.updateMany({
            where: { id: current.id, updatedAt: current.updatedAt },
            data: { status, updatedBy: actorId },
          });
          if (changed.count !== 1) throw createHttpError(409, "Current skill changed. Refresh before confirming.");
        } else {
          await tx.employeeSkill.create({ data: { employeeId, skillDefinitionId: definitionId, status, updatedBy: actorId } });
        }
        await tx.currentSkillConfirmation.create({ data: {
          employeeId, skillDefinitionId: definitionId, previousStatus: current?.status ?? null,
          confirmedStatus: status, confirmedByAccountId: actorId, reason,
        } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
        throw createHttpError(409, "Current skill changed. Refresh before confirming.");
      }
      throw error;
    }
    return this.list(employeeId);
  }
}

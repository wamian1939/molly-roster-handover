import { PerformanceNoteType, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { toFrontendPerformanceNote, type PerformanceNoteWithRelations } from "./domain.js";
import { createHttpError } from "./httpError.js";
import type { performanceNoteListQuerySchema, performanceNoteMutationSchema } from "./validation.js";
import type { z } from "zod";

type PerformanceNoteListQuery = z.infer<typeof performanceNoteListQuerySchema> & {
  accessibleStoreIds?: string[];
};
type PerformanceNoteMutationPayload = z.infer<typeof performanceNoteMutationSchema>;

const performanceNoteInclude = {
  employee: true,
  store: true,
} satisfies Prisma.PerformanceNoteInclude;

export class PerformanceNoteService {
  constructor(private readonly db: PrismaClient) {}

  async listPerformanceNotes(params: PerformanceNoteListQuery = {}) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const where = this.buildWhere(params);
    const [total, rows] = await Promise.all([
      this.db.performanceNote.count({ where }),
      this.db.performanceNote.findMany({
        where,
        include: performanceNoteInclude,
        orderBy: [{ noteDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => toFrontendPerformanceNote(row as PerformanceNoteWithRelations)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  getPerformanceNotesForEmployee(employeeId: string, params: Omit<PerformanceNoteListQuery, "employeeId"> = {}) {
    return this.listPerformanceNotes({ ...params, employeeId });
  }

  async createPerformanceNote(payload: PerformanceNoteMutationPayload, authorId?: string) {
    const employee = await this.db.employee.findUnique({
      where: { id: payload.employeeId },
    });
    if (!employee) throw createHttpError(404, "员工不存在。");
    if (employee.storeId !== payload.storeId) {
      throw createHttpError(400, "Employee does not belong to the selected store.");
    }
    if (employee.status === "Archived") {
      throw createHttpError(409, "Archived employees cannot receive new performance notes.");
    }

    const created = await this.db.performanceNote.create({
      data: {
        employeeId: payload.employeeId,
        storeId: payload.storeId,
        authorId,
        noteDate: payload.noteDate ?? new Date(),
        noteType: payload.noteType as PerformanceNoteType,
        dimensions: payload.dimensions,
        scoreImpact: payload.scoreImpact ?? null,
        noteText: payload.noteText,
      },
      include: performanceNoteInclude,
    });

    return toFrontendPerformanceNote(created as PerformanceNoteWithRelations);
  }

  private buildWhere(params: PerformanceNoteListQuery) {
    return {
      ...(params.employeeId ? { employeeId: params.employeeId } : {}),
      ...(params.storeId
        ? { storeId: params.storeId }
        : params.accessibleStoreIds
          ? { storeId: { in: params.accessibleStoreIds } }
          : {}),
      ...(params.noteType ? { noteType: params.noteType as PerformanceNoteType } : {}),
      ...(params.dimension ? { dimensions: { has: params.dimension } } : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            noteDate: {
              ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
              ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
            },
          }
        : {}),
    } satisfies Prisma.PerformanceNoteWhereInput;
  }
}

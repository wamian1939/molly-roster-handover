import { EmployeeStatus, EmployeeType, EmploymentType, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  toBackendEmployeeStatus,
  toBackendEmploymentType,
  toFrontendEmployee,
  toFrontendEmployeeProfile,
  type EmployeeWithStore,
} from "./domain.js";
import { createHttpError } from "./httpError.js";
import type { employeeListQuerySchema, employeeMutationSchema, employeeUpdateSchema } from "./validation.js";
import type { z } from "zod";

type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
type EmployeeMutationPayload = z.infer<typeof employeeMutationSchema>;
type EmployeeUpdatePayload = z.infer<typeof employeeUpdateSchema>;
type EmployeeListServiceQuery = EmployeeListQuery & {
  accessibleStoreIds?: string[];
  evaluatorAccountId?: string;
};

function employeeInclude() { return {
  store: true,
  jobAssignments: {
    include: { job: true },
    orderBy: { job: { displayOrder: "asc" as const } },
  },
  _count: {
    select: { evaluations: true },
  },
} satisfies Prisma.EmployeeInclude; }

export class EmployeeService {
  constructor(private readonly db: PrismaClient) {}

  async listEmployees(params: EmployeeListServiceQuery = {}) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const where = this.buildEmployeeWhere(params);
    const [total, rows] = await Promise.all([
      this.db.employee.count({ where }),
      this.db.employee.findMany({
        where,
        include: employeeInclude(),
        orderBy: [{ status: "asc" }, { displayName: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => toFrontendEmployee(row as EmployeeWithStore)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getEmployee(employeeId: string) {
    const employee = await this.db.employee.findUnique({
      where: { id: employeeId },
      include: employeeInclude(),
    });
    if (!employee) throw createHttpError(404, "员工不存在。");
    return toFrontendEmployee(employee as EmployeeWithStore);
  }

  async getEmployeeProfile(employeeId: string) {
    const employee = await this.db.employee.findUnique({ where: { id: employeeId }, include: employeeInclude() });
    if (!employee) throw createHttpError(404, "Employee does not exist.");
    return toFrontendEmployeeProfile(employee as EmployeeWithStore);
  }

  async createEmployee(payload: EmployeeMutationPayload, assignedByAccountId?: string) {
    await this.assertStoreExists(payload.storeId);
    await this.assertAssignableJobs(payload.storeId, payload.jobIds ?? []);
    if (payload.id) {
      const existing = await this.db.employee.findUnique({ where: { id: payload.id } });
      if (existing) throw createHttpError(409, "Employee ID already exists.");
    }

    const status = payload.status ? toBackendEmployeeStatus(payload.status) : "Active";
    let created;
    try {
      created = await this.db.$transaction(async (tx) => {
        await this.assertActiveStoreLocked(payload.storeId, tx);
        return tx.employee.create({
          data: {
            ...(payload.id ? { id: payload.id } : {}), storeId: payload.storeId, displayName: payload.displayName,
            employmentType: toBackendEmploymentType(payload.employmentType) as EmploymentType,
            employeeType: payload.employeeType as EmployeeType, status: status as EmployeeStatus,
            archivedAt: status === "Archived" ? new Date() : null, ...profileData(payload),
            jobAssignments: { create: (payload.jobIds ?? []).map((jobId) => ({ jobId, assignedByAccountId })) },
          }, include: employeeInclude(),
        });
      });
    } catch (error) {
      if (payload.id && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
        && Array.isArray(error.meta?.target) && error.meta.target.includes("id")) {
        throw createHttpError(409, "Employee ID already exists.");
      }
      throw error;
    }

    return toFrontendEmployee(created as EmployeeWithStore);
  }

  async updateEmployee(employeeId: string, payload: EmployeeUpdatePayload, assignedByAccountId?: string) {
    const existing = await this.db.employee.findUnique({ where: { id: employeeId } });
    if (!existing) throw createHttpError(404, "员工不存在。");
    const expectedUpdatedAt = payload.expectedUpdatedAt ? new Date(payload.expectedUpdatedAt) : existing.updatedAt;
    if (expectedUpdatedAt.getTime() !== existing.updatedAt.getTime()) {
      throw createHttpError(409, "员工档案已被更新，请重新打开后再保存。");
    }
    if (payload.employeeType && payload.employeeType !== existing.employeeType) {
      throw createHttpError(409, "Employee type changes must use the promotion workflow.");
    }
    if (payload.storeId) await this.assertStoreExists(payload.storeId);
    const targetStoreId = payload.storeId ?? existing.storeId;
    if (payload.jobIds) await this.assertAssignableJobs(targetStoreId, payload.jobIds, employeeId);

    const status = payload.status ? toBackendEmployeeStatus(payload.status) : null;
    const transferring = targetStoreId !== existing.storeId;
    const archiving = status === "Archived" && existing.status !== "Archived";
    const updated = await this.db.$transaction(async (tx) => {
      if (transferring || archiving) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evaluation-open-round:${employeeId}`}))`;
      }
      if (archiving) {
        await this.assertNoOpenEvaluationRound(employeeId, tx);
      }
      if (transferring) {
        // Serialize with submissions and closing; keep every score and round state.
        const rounds = await tx.evaluationRound.findMany({ where: { employeeId }, select: { id: true }, orderBy: { id: "asc" } });
        for (const round of rounds) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evaluation-round:${round.id}`}))`;
        }
      }
      if ((payload.storeId && payload.storeId !== existing.storeId)
        || payload.jobIds || (status === "Active" && existing.status !== "Active")) {
        await this.assertActiveStoreLocked(targetStoreId, tx);
      }
      if (payload.jobIds || (payload.storeId && payload.storeId !== existing.storeId)) {
        await tx.employeeJobAssignment.deleteMany({ where: { employeeId } });
      }
      const mutation = await tx.employee.updateMany({ where: { id: employeeId, updatedAt: expectedUpdatedAt }, data: {
        ...(payload.storeId ? { storeId: payload.storeId } : {}),
        ...(payload.displayName ? { displayName: payload.displayName } : {}),
        ...(payload.employmentType
          ? { employmentType: toBackendEmploymentType(payload.employmentType) as EmploymentType }
          : {}),
        ...(payload.employeeType ? { employeeType: payload.employeeType as EmployeeType } : {}),
        ...profileData(payload),
        ...(status
          ? {
              status: status as EmployeeStatus,
              archivedAt: status === "Archived" ? existing.archivedAt ?? new Date() : null,
            }
          : {}),
        updatedAt: new Date(Math.max(Date.now(), expectedUpdatedAt.getTime() + 1)),
      },
      });
      if (mutation.count !== 1) throw createHttpError(409, "员工档案已被更新，请重新打开后再保存。");
      if (transferring) {
        const target = await tx.store.findUniqueOrThrow({ where: { id: targetStoreId }, select: { name: true } });
        // The composite round FK cascades storeId to its evaluations. Raw SQL
        // preserves scoring timestamps and versions when updating store labels.
        await tx.evaluationRound.updateMany({ where: { employeeId }, data: { storeId: targetStoreId, storeNameSnapshot: target.name } });
        await tx.$executeRaw`UPDATE evaluations SET "storeNameSnapshot" = ${target.name} WHERE "employeeId" = ${employeeId}`;
        await tx.aiAnalysisRun.updateMany({ where: { employeeId }, data: { storeId: targetStoreId } });
        await tx.performanceNote.updateMany({ where: { employeeId }, data: { storeId: targetStoreId } });
      }
      const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, include: employeeInclude() });
      if (!payload.jobIds?.length) return employee;
      await tx.employeeJobAssignment.createMany({
        data: payload.jobIds.map((jobId) => ({ employeeId, jobId, storeId: targetStoreId, assignedByAccountId })),
      });
      return tx.employee.findUniqueOrThrow({ where: { id: employeeId }, include: employeeInclude() });
    });

    return toFrontendEmployee(updated as EmployeeWithStore);
  }

  async promoteToRegular(employeeId: string) {
    const existing = await this.db.employee.findUnique({ where: { id: employeeId } });
    if (!existing) throw createHttpError(404, "员工不存在。");
    if (existing.status !== "Active") throw createHttpError(409, "Only active employees can be promoted.");
    if (existing.employeeType === "REGULAR") return this.getEmployee(employeeId);
    const updated = await this.db.$transaction(async (tx) => {
      await this.assertActiveStoreLocked(existing.storeId, tx);
      const mutation = await tx.employee.updateMany({
        where: { id: employeeId, status: "Active", employeeType: "TRAINING", updatedAt: existing.updatedAt },
        data: {
          employeeType: "REGULAR",
          updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
        },
      });
      if (mutation.count !== 1) throw createHttpError(409, "Employee changed while being promoted. Refresh and retry.");
      return tx.employee.findUniqueOrThrow({ where: { id: employeeId }, include: employeeInclude() });
    });
    return toFrontendEmployee(updated as EmployeeWithStore);
  }

  async archiveEmployee(employeeId: string) {
    const existing = await this.db.employee.findUnique({
      where: { id: employeeId },
      include: { _count: { select: { evaluations: true } } },
    });
    if (!existing) throw createHttpError(404, "员工不存在。");
    if (existing.status === "Archived") return this.getEmployee(employeeId);
    const archived = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evaluation-open-round:${employeeId}`}))`;
      await this.assertNoOpenEvaluationRound(employeeId, tx);
      return tx.employee.update({
        where: { id: employeeId },
        data: {
          status: "Archived",
          archivedAt: new Date(),
        },
        include: employeeInclude(),
      });
    });

    return toFrontendEmployee(archived as EmployeeWithStore);
  }

  async restoreEmployee(employeeId: string) {
    const existing = await this.db.employee.findUnique({ where: { id: employeeId } });
    if (!existing) throw createHttpError(404, "员工不存在。");
    if (existing.status === "Active") return this.getEmployee(employeeId);
    await this.assertStoreExists(existing.storeId);

    const restored = await this.db.$transaction(async (tx) => {
      await this.assertActiveStoreLocked(existing.storeId, tx);
      const mutation = await tx.employee.updateMany({
        where: { id: employeeId, status: "Archived", updatedAt: existing.updatedAt },
        data: {
          status: "Active",
          archivedAt: null,
          updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
        },
      });
      if (mutation.count !== 1) throw createHttpError(409, "Employee changed while being restored. Refresh and retry.");
      return tx.employee.findUniqueOrThrow({ where: { id: employeeId }, include: employeeInclude() });
    });

    return toFrontendEmployee(restored as EmployeeWithStore);
  }

  private buildEmployeeWhere(params: EmployeeListServiceQuery) {
    const employmentType = params.employmentType
      ? (toBackendEmploymentType(params.employmentType) as EmploymentType)
      : null;
    const status = params.status ? (toBackendEmployeeStatus(params.status) as EmployeeStatus) : null;

    return {
      store: { isActive: true },
      ...(params.storeId
        ? { storeId: params.storeId }
        : params.accessibleStoreIds
          ? { storeId: { in: params.accessibleStoreIds } }
          : {}),
      ...(status ? { status } : {}),
      ...(employmentType ? { employmentType } : {}),
      ...(params.employeeType ? { employeeType: params.employeeType as EmployeeType } : {}),
      ...(params.jobId === "unassigned"
        ? { jobAssignments: { none: {} } }
        : params.jobId
          ? { jobAssignments: { some: { jobId: params.jobId } } }
          : {}),
      ...(params.search
        ? {
            OR: [
              { id: { contains: params.search, mode: "insensitive" } },
              { displayName: { contains: params.search, mode: "insensitive" } },
              { englishName: { contains: params.search, mode: "insensitive" } },
              { givenName: { contains: params.search, mode: "insensitive" } },
              { surname: { contains: params.search, mode: "insensitive" } },
              { store: { name: { contains: params.search, mode: "insensitive" } } },
              { jobAssignments: { some: { job: { name: { contains: params.search, mode: "insensitive" } } } } },
            ],
          }
        : {}),
    } satisfies Prisma.EmployeeWhereInput;
  }

  private async assertStoreExists(storeId: string) {
    const store = await this.db.store.findUnique({ where: { id: storeId }, select: { id: true, isActive: true } });
    if (!store || !store.isActive) throw createHttpError(409, "门店已归档，不能执行新的业务操作。");
  }

  private async assertActiveStoreLocked(storeId: string, tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<Array<{ isActive: boolean }>>`
      SELECT "isActive" FROM stores WHERE id = ${storeId} FOR SHARE
    `;
    if (rows[0]?.isActive !== true) {
      throw createHttpError(409, "Store is archived. Refresh before changing employee details.");
    }
  }

  private async assertAssignableJobs(storeId: string, jobIds: string[], employeeId?: string) {
    if (!jobIds.length) return;
    if (new Set(jobIds).size !== jobIds.length) throw createHttpError(409, "岗位不能重复分配。");
    const count = await this.db.storeJobDefinition.count({ where: {
      id: { in: jobIds }, storeId,
      OR: [{ isActive: true }, ...(employeeId ? [{ assignments: { some: { employeeId } } }] : [])],
    } });
    if (count !== jobIds.length) throw createHttpError(409, "只能分配员工所属门店的有效岗位。");
  }

  private async assertNoOpenEvaluationRound(employeeId: string, db: Prisma.TransactionClient) {
    const openRound = await db.evaluationRound.findFirst({ where: { employeeId, status: "OPEN" }, select: { id: true } });
    if (openRound) {
      throw createHttpError(
        409,
        "该员工有进行中的评价轮次，请先结束本轮后再归档。",
      );
    }
  }
}

function profileData(payload: EmployeeMutationPayload | EmployeeUpdatePayload) {
  const keys = [
    "surname", "givenName", "englishName", "gender", "dateOfBirth", "emailAddress", "mobileTelephoneNumber",
    "addressLine", "suburb", "state", "postcode", "employmentCommencementDate", "bankAccountName", "bsbNumber",
    "bankAccountNumber", "taxFileNumber", "abn", "holdsWorkingHolidayVisa", "visaType", "superannuationCompany",
    "superannuationAccountNumber", "uniqueSuperannuationIdentifier",
  ] as const;
  return Object.fromEntries(keys.flatMap((key) => payload[key] !== undefined ? [[key, payload[key]]] : []));
}

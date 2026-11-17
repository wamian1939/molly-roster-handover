import { Prisma, type PrismaClient, type SkillStatus } from "@prisma/client";
import { latestAggregateByEmployee, loadLatestValidClosedAggregates } from "./roundAggregateRead.js";

export const ROSTER_INTEGRATION_CONTRACT_VERSION = "1.4.0" as const;
type StoreScope = string[] | undefined;

export class RosterIntegrationService {
  constructor(private readonly db: PrismaClient) {}

  async listStores(storeIds?: StoreScope) {
    const stores = await this.db.store.findMany({
      where: { isActive: true, ...(storeIds ? { id: { in: storeIds } } : {}) },
      select: { id: true, name: true, isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return envelope({ stores });
  }

  async listSkillDefinitions() {
    const skills = await this.db.skillDefinition.findMany({
      where: { isActive: true },
      select: { code: true, nameZh: true, category: true, skillMode: true },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });
    return envelope({ skills });
  }

  async listEmployees(storeId: string, storeIds?: StoreScope, page?: number, pageSize?: number) {
    if (page === undefined || pageSize === undefined) {
      return envelope({ employees: await this.loadEmployees({ storeId, activeOnly: true, storeIds }) });
    }
    return this.db.$transaction(async (tx) => {
      const scoped = new RosterIntegrationService(tx as unknown as PrismaClient);
      const employees = await scoped.loadEmployees({ storeId, activeOnly: true, storeIds, page, pageSize });
      const total = await tx.employee.count({ where: {
        storeId: { equals: storeId, ...(storeIds ? { in: storeIds } : {}) },
        status: "Active", store: { isActive: true },
      } });
      const [{ revision }] = await tx.$queryRaw<Array<{ revision: string }>>(Prisma.sql`
        SELECT md5(COALESCE(string_agg(
          e."id" || chr(31) || e."displayName" || chr(31) || e."employeeType"::text || chr(31)
          || e."employmentType"::text || chr(31) || e."updatedAt"::text,
          chr(30) ORDER BY e."id"
        ), '')) AS revision
        FROM "employees" e
        JOIN "stores" s ON s."id" = e."storeId"
        WHERE e."storeId" = ${storeId} AND ${storeIds === undefined || storeIds.includes(storeId)}
          AND e."status" = 'Active' AND s."isActive" = true
      `);
      return envelope({ employees, workforceRevision: revision, pagination: { page, pageSize, total, hasMore: page * pageSize < total } });
    }, { isolationLevel: "RepeatableRead" });
  }

  async getEmployee(employeeId: string, storeIds?: StoreScope) {
    const employees = await this.loadEmployees({ employeeId, activeOnly: false, storeIds });
    return envelope({ employee: employees[0] ?? null });
  }

  contractVersion() {
    return envelope({ contractVersion: ROSTER_INTEGRATION_CONTRACT_VERSION });
  }

  private async loadEmployees(options: { storeId?: string; employeeId?: string; activeOnly: boolean; storeIds?: StoreScope; page?: number; pageSize?: number }) {
    const storeFilter = options.storeId ? [options.storeId] : options.storeIds;
    const [definitions, employees] = await Promise.all([
      this.db.skillDefinition.findMany({
        where: { isActive: true },
        select: { id: true, code: true, nameZh: true, category: true, skillMode: true, displayOrder: true },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      }),
      this.db.employee.findMany({
        where: {
          ...(options.employeeId ? { id: options.employeeId } : {}),
          ...(storeFilter ? { storeId: { in: storeFilter } } : {}),
          ...(options.activeOnly ? { status: "Active" as const, store: { isActive: true } } : {}),
        },
        select: {
          id: true, displayName: true, employeeType: true, employmentType: true, storeId: true, status: true,
          store: { select: { name: true, isActive: true } },
          jobAssignments: {
            where: { job: { isActive: true } },
            select: { job: { select: { id: true, storeId: true, name: true, code: true, colorToken: true } } },
            orderBy: { job: { displayOrder: "asc" } },
          },
          skills: {
            where: { skillDefinition: { isActive: true } },
            select: { status: true, updatedAt: true, skillDefinition: { select: { id: true, code: true, nameZh: true, category: true, skillMode: true, displayOrder: true } } },
            orderBy: { skillDefinition: { displayOrder: "asc" } },
          },
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
        ...(options.page !== undefined && options.pageSize !== undefined ? { skip: (options.page - 1) * options.pageSize, take: options.pageSize } : {}),
      }),
    ]);
    // Employee scope is already checked above. Official score follows the canonical employee across stores.
    const rounds = await loadLatestValidClosedAggregates(this.db, employees.map((employee) => employee.id));
    const latestByEmployee = latestAggregateByEmployee(rounds);

    return employees.map((employee) => {
      const latest = latestByEmployee.get(employee.id);
      const statuses = new Map(employee.skills.map((skill) => [skill.skillDefinition.id, skill.status]));
      const progressive = definitions.filter((definition) => definition.skillMode === "PROGRESSIVE");
      const currentSkills = employee.skills.map((skill) => ({
        code: skill.skillDefinition.code,
        nameZh: skill.skillDefinition.nameZh,
        category: normalizeCategory(skill.skillDefinition.category),
        mode: skill.skillDefinition.skillMode,
        status: skill.status,
        updatedAt: skill.updatedAt.toISOString(),
      }));
      return {
        id: employee.id,
        displayName: employee.displayName,
        employeeType: employee.employeeType,
        employmentType: employee.employmentType,
        storeId: employee.storeId,
        storeName: employee.store.name,
        isActive: employee.status === "Active" && employee.store.isActive,
        jobs: (employee.jobAssignments ?? []).filter(({ job }) => job.storeId === employee.storeId).map(({ job }) => ({ id: job.id, code: job.code, name: job.name, colorToken: job.colorToken })),
        positions: (employee.jobAssignments ?? []).filter(({ job }) => job.storeId === employee.storeId).map(({ job }) => ({ id: job.id, code: job.code, name: job.name })),
        officialScore: latest?.aggregateOverall != null && latest.aggregateTier
          ? { score: latest.aggregateOverall, tier: latest.aggregateTier, roundId: latest.id, closedAt: latest.closedAt ?? latest.createdAt }
          : null,
        skillSummary: {
          overallPercent: coverage(progressive, statuses),
          backOfHousePercent: coverage(progressive.filter((definition) => normalizeCategory(definition.category) === "BACK_OF_HOUSE"), statuses),
          waterBarPercent: coverage(progressive.filter((definition) => normalizeCategory(definition.category) === "WATER_BAR"), statuses),
          frontOfHousePercent: coverage(progressive.filter((definition) => normalizeCategory(definition.category) === "FRONT_OF_HOUSE"), statuses),
          qualifiedSkillCodes: currentSkills.filter((skill) => isQualified(skill.status)).map((skill) => skill.code),
          skills: currentSkills,
          operations: {
            opening: operation(currentSkills, "opening"),
            closing: operation(currentSkills, "closing"),
            weeklyCleaning: operation(currentSkills, "weekly-cleaning"),
          },
        },
      };
    });
  }
}

function envelope<T extends object>(data: T) { return { contractVersion: ROSTER_INTEGRATION_CONTRACT_VERSION, generatedAt: new Date().toISOString(), ...data }; }
function isQualified(status: SkillStatus) { return status === "Independent" || status === "Proficient" || status === "CanDo"; }
function coverage(definitions: Array<{ id: string }>, statuses: Map<string, SkillStatus>) {
  if (!definitions.length || !definitions.some((definition) => statuses.has(definition.id))) return null;
  return Math.round(definitions.filter((definition) => isQualified(statuses.get(definition.id) ?? "Unknown")).length / definitions.length * 1000) / 10;
}
function normalizeCategory(category: string) {
  if (category === "Back Kitchen" || category === "BackKitchen") return "BACK_OF_HOUSE" as const;
  if (category === "Bar") return "WATER_BAR" as const;
  if (category === "Front") return "FRONT_OF_HOUSE" as const;
  return "OPERATIONS" as const;
}
function operation(skills: Array<{ code: string; status: SkillStatus }>, code: string) {
  const status = skills.find((skill) => skill.code === code)?.status;
  if (status === "CanDo") return "CAN_DO" as const;
  if (status === "CannotDo") return "CANNOT_DO" as const;
  return "UNKNOWN" as const;
}

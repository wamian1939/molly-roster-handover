import type { PrismaClient, SkillStatus } from "@prisma/client";
import { createAuthError, type AuthContext } from "./auth.js";
import { latestAggregateByEmployee, loadLatestValidClosedAggregates } from "./roundAggregateRead.js";

type StoreScope = string[] | undefined;

export class RosterSkillBoardService {
  constructor(private readonly db: PrismaClient) {}

  async getBoard(storeIds?: StoreScope, selectedStoreId?: string, _actor?: AuthContext) {
    if (selectedStoreId && storeIds && !storeIds.includes(selectedStoreId)) throw createAuthError(403, "Store access denied.");
    const effectiveStoreIds = selectedStoreId ? [selectedStoreId] : storeIds;
    const storeWhere = { isActive: true, ...(storeIds ? { id: { in: storeIds } } : {}) };
    const employeeWhere = {
      status: "Active" as const,
      store: { isActive: true },
      ...(effectiveStoreIds ? { storeId: { in: effectiveStoreIds } } : {}),
    };
    const [stores, skillDefinitions, employees] = await Promise.all([
      this.db.store.findMany({
        where: storeWhere,
        orderBy: [{ name: "asc" }, { id: "asc" }],
      }),
      this.db.skillDefinition.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { displayOrder: "asc" }, { id: "asc" }],
      }),
      this.db.employee.findMany({
        where: employeeWhere,
        include: {
          store: true,
          skills: {
            where: { skillDefinition: { isActive: true } },
            include: { skillDefinition: true },
            orderBy: { skillDefinition: { displayOrder: "asc" } },
          },
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
      }),
    ]);

    const aggregateRounds = await loadLatestValidClosedAggregates(this.db, employees.map((employee) => employee.id));
    const latestEvaluationByEmployee = latestAggregateByEmployee(aggregateRounds);

    return {
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        region: store.region,
        managerName: store.managerName,
        city: store.city,
      })),
      selectedStoreId: selectedStoreId ?? null,
      skillDefinitions: skillDefinitions.map((definition) => ({
        id: definition.id,
        code: definition.code,
        nameZh: definition.nameZh,
        nameEn: definition.nameEn,
        category: definition.category,
        skillMode: definition.skillMode,
        displayOrder: definition.displayOrder,
        isActive: definition.isActive,
      })),
      employees: employees.map((employee) => {
        const latestEvaluation = latestEvaluationByEmployee.get(employee.id);
        return {
          employeeId: employee.id,
          displayName: employee.displayName,
          storeId: employee.storeId,
          storeName: employee.store.name,
          employmentType: employee.employmentType,
          employeeType: employee.employeeType,
          status: employee.status,
          latestEvaluation: latestEvaluation
            ? {
                id: latestEvaluation.id,
                overallScore: latestEvaluation.aggregateOverall,
                tier: latestEvaluation.aggregateTier,
                speedRating: componentToRating(latestEvaluation.components?.speed, latestEvaluation.policy.speedWeight),
                initiativeRating: componentToRating(latestEvaluation.components?.initiative, latestEvaluation.policy.initiativeWeight),
                attitudeRating: componentToRating(latestEvaluation.components?.attitude, latestEvaluation.policy.attitudeWeight),
                availabilityRating: componentToRating(latestEvaluation.components?.availability, latestEvaluation.policy.availabilityWeight),
                skillCoverage: latestEvaluation.aggregateSkillCoverage,
                completedAt: latestEvaluation.closedAt ?? latestEvaluation.createdAt,
                employeeTypeSnapshot: latestEvaluation.employeeTypeSnapshot,
              }
            : null,
          skills: employee.skills.map((skill) => ({
            skillDefinitionId: skill.skillDefinitionId,
            skillCode: skill.skillDefinition.code,
            category: skill.skillDefinition.category,
            skillMode: skill.skillDefinition.skillMode,
            status: skill.status as SkillStatus,
            updatedAt: skill.updatedAt.toISOString(),
          })),
        };
      }),
    };
  }
}

function numberOrNull(value: { toString(): string } | number | null) {
  return value == null ? null : Number(value);
}

function componentToRating(value: number | undefined, maximum: number) {
  return value == null || maximum <= 0 ? null : Math.round((value / maximum) * 50) / 10;
}

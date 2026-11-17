import type {
  RosterSkillBoardEmployee,
  RosterSkillBoardSkillDefinition,
  RosterSkillStatus,
  RosterSkillViewMode,
} from "../types/evaluation";

export function isRosterQualified(status: RosterSkillStatus | "Unknown") {
  return status === "Independent" || status === "Proficient" || status === "CanDo";
}

export function getEmployeeSkillStatus(
  employee: RosterSkillBoardEmployee,
  definitionId: string,
): RosterSkillStatus | "Unknown" {
  return employee.skills.find((skill) => skill.skillDefinitionId === definitionId)?.status ?? "Unknown";
}

export function getCategoryCoverage(
  employee: RosterSkillBoardEmployee,
  skillDefinitions: RosterSkillBoardSkillDefinition[],
) {
  const categories = [...new Set(skillDefinitions.map((definition) => definition.category))];
  return categories.map((category) => {
    const definitions = skillDefinitions.filter((definition) => definition.category === category);
    const statuses = definitions.map((definition) => getEmployeeSkillStatus(employee, definition.id));
    const qualified = statuses.filter(isRosterQualified).length;
    const unknown = statuses.filter((status) => status === "Unknown").length;
    return {
      category,
      qualified,
      total: definitions.length,
      unknown,
      isFull: definitions.length > 0 && unknown === 0 && qualified === definitions.length,
    };
  });
}

export function getKnownSkillCoverage(
  employee: RosterSkillBoardEmployee,
  skillDefinitions: RosterSkillBoardSkillDefinition[],
) {
  const statuses = skillDefinitions.map((definition) => getEmployeeSkillStatus(employee, definition.id));
  const known = statuses.filter((status) => status !== "Unknown");
  const qualified = known.filter(isRosterQualified).length;
  const unknown = statuses.length - known.length;
  return {
    qualified,
    known: known.length,
    total: statuses.length,
    unknown,
    ratio: known.length ? qualified / known.length : null,
  };
}

export function passesSkillFilters(
  employee: RosterSkillBoardEmployee,
  skillDefinitions: RosterSkillBoardSkillDefinition[],
  selectedSkillIds: string[],
  selectedFullCategory: string,
) {
  const hasSelectedSkills = selectedSkillIds.every((skillId) =>
    isRosterQualified(getEmployeeSkillStatus(employee, skillId)),
  );
  if (!hasSelectedSkills) return false;
  if (selectedFullCategory === "all") return true;
  return getCategoryCoverage(employee, skillDefinitions).some(
    (coverage) => coverage.category === selectedFullCategory && coverage.isFull,
  );
}

export function getRosterCellLabel(status: RosterSkillStatus | "Unknown", viewMode: RosterSkillViewMode) {
  if (viewMode === "roster") {
    if (status === "Unknown") return "状态未确认";
    return isRosterQualified(status) ? "可排" : "不可排";
  }
  return skillStatusShortLabels[status];
}

export const skillStatusLabels: Record<RosterSkillStatus | "Unknown", string> = {
  Unknown: "未确认",
  NotTrained: "未培训",
  Training: "培训中",
  Independent: "可独立",
  Proficient: "熟练",
  CannotDo: "不会",
  CanDo: "会",
};

export const skillStatusShortLabels: Record<RosterSkillStatus | "Unknown", string> = {
  Unknown: "?",
  NotTrained: "—",
  Training: "培训",
  Independent: "独立",
  Proficient: "熟练",
  CannotDo: "—",
  CanDo: "✓",
};

export const categoryDisplayNames: Record<string, string> = {
  BackKitchen: "后厨",
  "Back Kitchen": "后厨",
  Bar: "水吧",
  Front: "前场",
  Operations: "操作能力",
};

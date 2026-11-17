import { describe, expect, it } from "vitest";
import type { RosterSkillBoardEmployee, RosterSkillBoardSkillDefinition } from "../types/evaluation";
import {
  getCategoryCoverage,
  getEmployeeSkillStatus,
  getKnownSkillCoverage,
  isRosterQualified,
  passesSkillFilters,
} from "./rosterSkillUtils";

const skills: RosterSkillBoardSkillDefinition[] = [
  skill("skill-tea", "tea-preparation", "Back Kitchen"),
  skill("skill-milk", "milk-bar", "Back Kitchen"),
  skill("skill-cup", "cup-labeling", "Bar"),
];

describe("rosterSkillUtils", () => {
  it("treats Independent and Proficient as roster qualified only", () => {
    expect(isRosterQualified("Independent")).toBe(true);
    expect(isRosterQualified("Proficient")).toBe(true);
    expect(isRosterQualified("Training")).toBe(false);
    expect(isRosterQualified("NotTrained")).toBe(false);
    expect(isRosterQualified("Unknown")).toBe(false);
  });

  it("keeps Unknown separate from NotTrained and blocks full category", () => {
    const employee = rosterEmployee([
      { skillDefinitionId: "skill-tea", status: "Independent" },
      { skillDefinitionId: "skill-cup", status: "NotTrained" },
    ]);

    expect(getEmployeeSkillStatus(employee, "skill-milk")).toBe("Unknown");
    expect(getKnownSkillCoverage(employee, skills)).toEqual({
      qualified: 1,
      known: 2,
      total: 3,
      unknown: 1,
      ratio: 0.5,
    });
    expect(getCategoryCoverage(employee, skills)).toEqual([
      { category: "Back Kitchen", qualified: 1, total: 2, unknown: 1, isFull: false },
      { category: "Bar", qualified: 0, total: 1, unknown: 0, isFull: false },
    ]);
  });

  it("supports skill and category combination filters", () => {
    const employee = rosterEmployee([
      { skillDefinitionId: "skill-tea", status: "Independent" },
      { skillDefinitionId: "skill-milk", status: "Proficient" },
      { skillDefinitionId: "skill-cup", status: "Training" },
    ]);

    expect(passesSkillFilters(employee, skills, ["skill-tea", "skill-milk"], "all")).toBe(true);
    expect(passesSkillFilters(employee, skills, ["skill-cup"], "all")).toBe(false);
    expect(passesSkillFilters(employee, skills, [], "Back Kitchen")).toBe(true);
    expect(passesSkillFilters(employee, skills, [], "Bar")).toBe(false);
  });

});

function skill(id: string, code: string, category: string): RosterSkillBoardSkillDefinition {
  return { id, code, category, nameZh: code, nameEn: code, displayOrder: 1, isActive: true };
}

function rosterEmployee(skillsInput: Array<{ skillDefinitionId: string; status: RosterSkillBoardEmployee["skills"][number]["status"] }>): RosterSkillBoardEmployee {
  return {
    employeeId: "employee-1",
    displayName: "HandoverEmployee016",
    storeId: "store-1",
    storeName: "Hurstville",
    employmentType: "PartTime",
    status: "Active",
    employeeType: "REGULAR",
    latestEvaluation: null,
    skills: skillsInput.map((item) => ({
      ...item,
      skillCode: item.skillDefinitionId,
      category: "Back Kitchen",
      updatedAt: "2026-08-12T00:00:00.000Z",
    })),
  };
}

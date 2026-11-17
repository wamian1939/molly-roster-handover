import { describe, expect, it } from "vitest";
import {
  calculateScoreV1,
  getTierV1,
  parsePolicySnapshotV1,
  scoringPolicyV1,
  type EmployeeSkillForScoring,
  type SkillDefinitionForScoring,
  type SkillStatusV1,
} from "../src/scoringPolicyV1.js";

const activeSkills: SkillDefinitionForScoring[] = [
  { id: "tea", weight: 1.5, isActive: true },
  { id: "milk-bar", weight: 1.5, isActive: true },
  { id: "sticker", weight: 0.7, isActive: true },
  { id: "scan", weight: 0.7, isActive: true },
  { id: "ice", weight: 0.8, isActive: true },
  { id: "cup", weight: 1, isActive: true },
  { id: "transfer", weight: 1.1, isActive: true },
  { id: "delivery", weight: 0.8, isActive: true },
  { id: "dispatch", weight: 1, isActive: true },
  { id: "ordering", weight: 1.4, isActive: true },
];

function employeeSkills(status: SkillStatusV1): EmployeeSkillForScoring[] {
  return activeSkills.map((skill) => ({ skillDefinitionId: skill.id, status }));
}

describe("ScoringPolicy V1", () => {
  it("keeps both employee-type policies centralized, distinct, and normalized to 100", () => {
    const regular = scoringPolicyV1.getPolicy("REGULAR");
    const training = scoringPolicyV1.getPolicy("TRAINING");
    const total = (policy: typeof regular) => policy.skillWeight + policy.speedWeight + policy.initiativeWeight + policy.attitudeWeight + policy.availabilityWeight + policy.textWeight;
    expect(total(regular)).toBe(100);
    expect(total(training)).toBe(100);
    expect(regular).toMatchObject({ policyId: "REGULAR_V3", skillWeight: 60, speedWeight: 15, initiativeWeight: 5, attitudeWeight: 5, availabilityWeight: 10, textWeight: 5, tierPolicyVersion: 2 });
    expect(training).toMatchObject({ policyId: "TRAINING_V2", skillWeight: 40, speedWeight: 10, initiativeWeight: 15, attitudeWeight: 15, availabilityWeight: 5, textWeight: 15, tierPolicyVersion: 2 });
    expect(training).not.toEqual(regular);

    const input = {
      skillDefinitions: activeSkills,
      employeeSkills: employeeSkills("Training"),
      ratings: { speed: 5, initiative: 3, attitude: 3, availability: 3 },
      textScore: 5,
    } as const;
    expect(calculateScoreV1({ ...input, employeeType: "TRAINING" }).overallScore)
      .not.toBe(calculateScoreV1({ ...input, employeeType: "REGULAR" }).overallScore);
  });
  it("calculates the all-minimum boundary with the neutral no-text score", () => {
    const result = calculateScoreV1({
      skillDefinitions: activeSkills,
      employeeSkills: employeeSkills("NotTrained"),
      ratings: { speed: 1, initiative: 1, attitude: 1, availability: 1 },
      textScore: null,
    });

    expect(result).toMatchObject({
      skillScore: 0,
      speedScore: 3,
      initiativeScore: 1,
      attitudeScore: 1,
      availabilityScore: 2,
      textScore: 2.5,
      overallScore: 9.5,
      tier: "T5",
      skillCoverage: { capableSkills: 0, activeSkills: 10, percentage: 0 },
    });
  });

  it("calculates the all-maximum boundary", () => {
    const result = calculateScoreV1({
      skillDefinitions: activeSkills,
      employeeSkills: employeeSkills("Proficient"),
      ratings: { speed: 5, initiative: 5, attitude: 5, availability: 5 },
      textScore: 10,
    });

    expect(result).toMatchObject({
      skillScore: 60,
      speedScore: 15,
      initiativeScore: 5,
      attitudeScore: 5,
      availabilityScore: 10,
      textScore: 5,
      overallScore: 100,
      tier: "T1",
      skillCoverage: { capableSkills: 10, activeSkills: 10, percentage: 100 },
    });
  });

  it("calculates the confirmed TRAINING maximum as 40/10/15/15/5/15", () => {
    const result = calculateScoreV1({
      employeeType: "TRAINING",
      skillDefinitions: activeSkills,
      employeeSkills: employeeSkills("Proficient"),
      ratings: { speed: 5, initiative: 5, attitude: 5, availability: 5 },
      textScore: 10,
    });
    expect(result).toMatchObject({
      skillScore: 40,
      speedScore: 10,
      initiativeScore: 15,
      attitudeScore: 15,
      availabilityScore: 5,
      textScore: 15,
      overallScore: 100,
      tier: "T1",
    });
  });

  it("calculates a stable middle case", () => {
    const result = calculateScoreV1({
      skillDefinitions: activeSkills,
      employeeSkills: employeeSkills("Training"),
      ratings: { speed: 3, initiative: 3, attitude: 3, availability: 3 },
      textScore: 5,
    });

    expect(result).toMatchObject({
      skillScore: 18,
      speedScore: 9,
      initiativeScore: 3,
      attitudeScore: 3,
      availabilityScore: 6,
      textScore: 2.5,
      overallScore: 41.5,
      tier: "T4",
    });
  });

  it("uses 5.0 when text is absent", () => {
    const result = calculateScoreV1({
      skillDefinitions: activeSkills,
      employeeSkills: employeeSkills("Independent"),
      ratings: { speed: 4, initiative: 4, attitude: 4, availability: 4 },
    });

    expect(result.textScore).toBe(2.5);
  });

  it("derives the skill denominator from active definitions only", () => {
    const definitions: SkillDefinitionForScoring[] = [
      { id: "light", weight: 1, isActive: true },
      { id: "heavy", weight: 3, isActive: true },
      { id: "retired", weight: 100, isActive: false },
    ];
    const result = calculateScoreV1({
      skillDefinitions: definitions,
      employeeSkills: [
        { skillDefinitionId: "light", status: "Proficient" },
        { skillDefinitionId: "heavy", status: "NotTrained" },
      ],
      ratings: { speed: 3, initiative: 3, attitude: 3, availability: 3 },
      textScore: 5,
    });

    expect(result.skillScore).toBe(15);
  });

  it("scores binary operational skills and returns authoritative category ratios", () => {
    const definitions: SkillDefinitionForScoring[] = [
      { id: "tea", weight: 1, isActive: true, category: "Back Kitchen", skillMode: "PROGRESSIVE" },
      { id: "bar", weight: 1, isActive: true, category: "Bar", skillMode: "PROGRESSIVE" },
      { id: "front", weight: 1, isActive: true, category: "Front", skillMode: "PROGRESSIVE" },
      { id: "opening", weight: 1, isActive: true, category: "Operations", skillMode: "BINARY" },
      { id: "closing", weight: 1, isActive: true, category: "Operations", skillMode: "BINARY" },
      { id: "weekly", weight: 1, isActive: true, category: "Operations", skillMode: "BINARY" },
    ];
    const base = [
      { skillDefinitionId: "tea", status: "Proficient" as const },
      { skillDefinitionId: "bar", status: "Independent" as const },
      { skillDefinitionId: "front", status: "Training" as const },
    ];
    const allCan = calculateScoreV1({ skillDefinitions: definitions, employeeSkills: [...base, { skillDefinitionId: "opening", status: "CanDo" }, { skillDefinitionId: "closing", status: "CanDo" }, { skillDefinitionId: "weekly", status: "CanDo" }], ratings: { speed: 5, initiative: 5, attitude: 5, availability: 5 }, textScore: 10 });
    const noneCan = calculateScoreV1({ skillDefinitions: definitions, employeeSkills: [...base, { skillDefinitionId: "opening", status: "CannotDo" }, { skillDefinitionId: "closing", status: "CannotDo" }, { skillDefinitionId: "weekly", status: "CannotDo" }], ratings: { speed: 5, initiative: 5, attitude: 5, availability: 5 }, textScore: 10 });
    expect(allCan.skillCategories).toMatchObject({ backOfHouse: { percentage: 100 }, waterBar: { percentage: 70 }, frontOfHouse: { percentage: 30 }, operations: { percentage: 100, capableCount: 3, totalCount: 3 } });
    expect(noneCan.skillCategories.operations).toMatchObject({ percentage: 0, capableCount: 0, totalCount: 3 });
    expect(allCan.skillScore).toBeGreaterThan(noneCan.skillScore);
    expect(allCan.overallScore).toBeGreaterThan(noneCan.overallScore);
  });

  it("rejects incomplete skills, invalid ratings, and invalid text scores", () => {
    expect(() =>
      calculateScoreV1({
        skillDefinitions: activeSkills,
        employeeSkills: [],
        ratings: { speed: 3, initiative: 3, attitude: 3, availability: 3 },
      }),
    ).toThrow("Missing employee skill status");

    expect(() =>
      calculateScoreV1({
        skillDefinitions: activeSkills,
        employeeSkills: employeeSkills("Independent"),
        ratings: { speed: 0, initiative: 3, attitude: 3, availability: 3 },
      }),
    ).toThrow("speed rating must be between 1 and 5");

    expect(() =>
      calculateScoreV1({
        skillDefinitions: activeSkills,
        employeeSkills: employeeSkills("Independent"),
        ratings: { speed: 3, initiative: 3, attitude: 3, availability: 3 },
        textScore: 10.1,
      }),
    ).toThrow("Text score must be between 0 and 10");
  });

  it.each([[0,"T5"],[39.99,"T5"],[40,"T4"],[59.99,"T4"],[60,"T3"],[69.99,"T3"],[70,"T2"],[84.99,"T2"],[85,"T1"],[100,"T1"]] as const)("maps %s to %s under Tier policy V2", (score, tier) => {
    expect(getTierV1(score)).toBe(tier);
  });

  it("keeps the legacy Tier policy available for historical snapshots", () => {
    expect(getTierV1(39.99, 1)).toBe("T4");
    expect(getTierV1(55, 1)).toBe("T3");
  });

  it("keeps historical policy identities explainable without changing their weights", () => {
    expect(parsePolicySnapshotV1({ skillWeight: 50, speedWeight: 12, initiativeWeight: 10, attitudeWeight: 10, availabilityWeight: 8, textWeight: 10 }).policyId).toBe("REGULAR_V1");
    expect(parsePolicySnapshotV1({ skillWeight: 40, speedWeight: 20, initiativeWeight: 12, attitudeWeight: 10, availabilityWeight: 8, textWeight: 10 }).policyId).toBe("TRAINING_LEGACY");
    expect(parsePolicySnapshotV1({ skillWeight: 20, speedWeight: 10, initiativeWeight: 25, attitudeWeight: 25, availabilityWeight: 10, textWeight: 10 }).policyId).toBe("TRAINING_V1");
    expect(parsePolicySnapshotV1({ skillWeight: 60, speedWeight: 15, initiativeWeight: 5, attitudeWeight: 5, availabilityWeight: 10, textWeight: 5 }).policyId).toBe("REGULAR_V3");
    expect(parsePolicySnapshotV1({ skillWeight: 40, speedWeight: 10, initiativeWeight: 15, attitudeWeight: 15, availabilityWeight: 5, textWeight: 15 }).policyId).toBe("TRAINING_V2");
  });
});

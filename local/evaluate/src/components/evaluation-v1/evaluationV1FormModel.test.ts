import { describe, expect, it } from "vitest";
import type { EvaluationV1, EvaluationV1Skill } from "../../types/evaluation";
import {
  calculateDisplayCoverage,
  formValueFromEvaluation,
  hasAllRatings,
} from "./evaluationV1FormModel";

const skills: EvaluationV1Skill[] = [
  { skillDefinitionId: "s1", skillCode: "tea", skillNameZh: "开茶", skillNameEn: "Tea", category: "BackKitchen", status: "Independent", weight: 1.5 },
  { skillDefinitionId: "s2", skillCode: "milk", skillNameZh: "奶吧", skillNameEn: "Milk", category: "BackKitchen", status: "Training", weight: 1.5 },
  { skillDefinitionId: "s3", skillCode: "cup", skillNameZh: "贴杯", skillNameEn: "Cup", category: "Bar", status: "Proficient", weight: 0.7 },
];

describe("evaluationV1 form model", () => {
  it("treats ratings as incomplete until all four are explicitly selected", () => {
    expect(hasAllRatings({ speed: 3, initiative: 4, attitude: 5, availability: null })).toBe(false);
    expect(hasAllRatings({ speed: 3, initiative: 4, attitude: 5, availability: 2 })).toBe(true);
  });

  it("calculates display coverage from Independent and Proficient skills only", () => {
    expect(calculateDisplayCoverage(skills)).toEqual({
      capableSkills: 2,
      activeSkills: 3,
      confirmedSkills: 3,
      allSkillsConfirmed: true,
      percentage: 66.7,
    });
  });

  it("initializes an in-memory form without mutating the evaluation", () => {
    const evaluation = {
      ratings: { speed: 1, initiative: 2, attitude: 3, availability: 4 },
      textFeedback: null,
      skills,
    } as EvaluationV1;
    const value = formValueFromEvaluation(evaluation);
    expect(value.ratings).toEqual({ speed: 1, initiative: 2, attitude: 3, availability: 4 });
    expect(value.textFeedback).toBe("");
    expect(value.skills).toHaveLength(3);
    expect(value.skills).not.toBe(skills);
  });

  it("keeps Unknown in memory while marking the evaluation incomplete", () => {
    const value = formValueFromEvaluation({
      ratings: { speed: 3, initiative: 3, attitude: 3, availability: 3 },
      textFeedback: null,
      skills: [{ ...skills[0], status: "Unknown" }],
    } as EvaluationV1);

    expect(calculateDisplayCoverage([{ ...skills[0], status: "Unknown" }])).toMatchObject({
      confirmedSkills: 0,
      allSkillsConfirmed: false,
    });
    expect(value.skills).toEqual([expect.objectContaining({ skillDefinitionId: "s1", status: "Unknown" })]);
  });
});

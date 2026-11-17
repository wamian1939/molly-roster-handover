import type {
  EvaluationV1,
  EvaluationV1Ratings,
  EvaluationV1Skill,
  SkillStatusV1,
} from "../../types/evaluation";

export type EvaluationV1FormValue = {
  ratings: EvaluationV1Ratings;
  textFeedback: string;
  skills: EvaluationV1Skill[];
};

const capableSkillStatuses = new Set<SkillStatusV1>(["Independent", "Proficient", "CanDo"]);

export function formValueFromEvaluation(evaluation: EvaluationV1): EvaluationV1FormValue {
  return {
    ratings: { ...evaluation.ratings },
    textFeedback: evaluation.textFeedback ?? "",
    skills: evaluation.skills.map((skill) => ({ ...skill })),
  };
}

export function hasAllRatings(ratings: EvaluationV1Ratings) {
  return Object.values(ratings).every((rating) => rating !== null);
}

export function calculateDisplayCoverage(skills: EvaluationV1Skill[]) {
  const activeSkills = skills.length;
  const capableSkills = skills.filter((skill) => skill.status !== "Unknown" && capableSkillStatuses.has(skill.status)).length;
  const confirmedSkills = skills.filter((skill) => skill.status !== "Unknown").length;
  return {
    capableSkills,
    activeSkills,
    percentage: activeSkills === 0 ? 0 : Math.round((capableSkills / activeSkills) * 1000) / 10,
    confirmedSkills,
    allSkillsConfirmed: activeSkills > 0 && confirmedSkills === activeSkills,
  };
}

export function skillStatusMap(skills: EvaluationV1Skill[]) {
  return Object.fromEntries(skills.map((skill) => [skill.skillCode, skill.status] as const));
}

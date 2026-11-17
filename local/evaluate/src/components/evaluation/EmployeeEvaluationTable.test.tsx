import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { StoreEvaluationRosterItem } from "../../types/evaluation";
import { EmployeeEvaluationTable } from "./EmployeeEvaluationTable";

const base: StoreEvaluationRosterItem = {
  employee: { id: "employee-1", displayName: "HandoverEmployee006", employmentType: "Part-time", status: "Active", employeeType: "REGULAR" },
  evaluationStatus: "Completed", eligibleEvaluatorCount: 3,
  latestCompletedEvaluation: { id: "round-old", overallScore: 76.9, tier: "T2", skillCoverage: 0.8, completedAt: "2026-09-01T00:00:00.000Z", employeeTypeSnapshot: "REGULAR" },
  currentRound: { id: "round-open", status: "OPEN", completedCount: 1, eligibleCount: 3, provisionalOverall: 82, myEvaluation: { id: "eval-me", status: "Submitted", overallScore: 82, submittedAt: "2026-09-05T00:00:00.000Z" } },
};

function render(row: StoreEvaluationRosterItem, admin = false) {
  return renderToStaticMarkup(<MemoryRouter><EmployeeEvaluationTable evaluations={[row]} isAdmin={admin} /></MemoryRouter>);
}

describe("EmployeeEvaluationTable live scoring", () => {
  it("separates latest formal, OPEN progress and my current score", () => {
    const html = render(base, true);
    expect(html).toContain("76.9");
    expect(html).toContain("1 / 3");
    expect(html).toContain("82.0 临时");
    expect(html).toContain("再次评分");
    expect(html).toContain("查看本轮");
  });

  it("shows 0 over the live store denominator before an OPEN round exists", () => {
    const html = render({ ...base, evaluationStatus: "NotEvaluated", latestCompletedEvaluation: null, currentRound: null });
    expect(html).toContain("0 / 3");
    expect(html).toContain("未评分");
    expect(html).toContain(">评分<");
  });

  it("contains no Draft lifecycle language", () => {
    expect(render(base, true)).not.toMatch(/草稿|继续草稿|Draft|已锁定/);
  });
});

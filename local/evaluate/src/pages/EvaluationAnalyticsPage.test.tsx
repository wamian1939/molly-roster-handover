// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "../services/evaluationRepository";
import type { AnalyticsV1Data } from "../types/analyticsV1";
import { EvaluationAnalyticsPage } from "./EvaluationAnalyticsPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN", storeId: null }, isLoading: false }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: () => null,
}));

let root: Root | null;
let container: HTMLDivElement;

const data: AnalyticsV1Data = {
  stores: [],
  selectedEmployeeType: null,
  summary: { employees: 3, regularEmployees: 2, trainingEmployees: 1, evaluatedEmployees: 2, notEvaluatedEmployees: 1, evaluationCoverage: 2 / 3, averageScore: 65, averageSkillScore: 30, averageCurrentSkillCoverage: 0.75, initializedSkillProfiles: 1 },
  tierDistribution: [{ tier: "T1", count: 0, percentage: 0 }, { tier: "T2", count: 1, percentage: 50 }, { tier: "T3", count: 0, percentage: 0 }, { tier: "T4", count: 1, percentage: 50 }, { tier: "T5", count: 0, percentage: 0 }],
  averageRatings: [{ dimension: "speed", average: 4, sampleSize: 2 }, { dimension: "initiative", average: 3, sampleSize: 2 }, { dimension: "attitude", average: 4.5, sampleSize: 2 }, { dimension: "availability", average: 2.5, sampleSize: 2 }],
  weakestDimension: { dimension: "availability", average: 2.5, sampleSize: 2 },
  skillProfiles: { initializedEmployees: 1, totalEmployees: 3 },
  skillCoverage: [{ skillDefinitionId: "skill-1", skillCode: "milk-bar", skillNameZh: "奶吧", skillNameEn: "Milk bar", category: "BackKitchen", qualifiedEmployees: 1, knownEmployees: 2, totalEmployees: 3, coverage: 0.5, profileCompletion: 2 / 3 }],
  categoryCoverage: [{ category: "BackKitchen", coverage: 0.5, activeSkills: 1 }],
  scoreTrend: [{ month: "2026-08", averageCompletedEvaluationScore: 65, completedEvaluations: 2 }],
  mostImproved: [{ employeeId: "employee-1", employeeName: "HandoverEmployee016", employeeType: "REGULAR", latestEvaluationEmployeeType: "REGULAR", storeId: "store-1", storeName: "Hurstville", latestScore: 80, previousScore: 70, delta: 10, latestCompletedAt: "2026-08-12T00:00:00.000Z" }],
  scoreDecreased: [],
  employees: [{ employeeId: "employee-1", employeeName: "HandoverEmployee016", employeeType: "REGULAR", evaluationEmployeeType: "REGULAR", storeId: "store-1", storeName: "Hurstville", overallScore: 80, tier: "T2", completedAt: "2026-08-12T00:00:00.000Z", skillCoverage: 0.8 }],
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container.remove();
  root = null;
  vi.restoreAllMocks();
});

describe("EvaluationAnalyticsPage", () => {
  it("shows raw ratings, known skill denominator, saved-score trend, and recent movement", async () => {
    vi.spyOn(evaluationRepository, "fetchAnalytics").mockResolvedValue(data);
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter><EvaluationAnalyticsPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("报班自由度");
    expect(container.textContent).toContain("员工类型");
    expect(container.textContent).toContain("正式");
    expect(container.textContent).toContain("2.5 / 5");
    expect(container.textContent).toContain("1 / 2");
    expect(container.textContent).toContain("每月完成评价平均分");
    expect(container.textContent).toContain("不代表该月月末团队当前评分");
    expect(container.textContent).toContain("+10.0");
    expect(container.textContent).not.toMatch(/Grade|AI Risk|Synthetic|Manual Weighted|Attendance|Pressure|Teamwork/i);
  });

  it("uses explicit empty labels instead of 0 / 0 for a store without employees", async () => {
    vi.spyOn(evaluationRepository, "fetchAnalytics").mockResolvedValue({
      ...data,
      summary: { ...data.summary, employees: 0, evaluatedEmployees: 0, notEvaluatedEmployees: 0, evaluationCoverage: 0 },
      skillProfiles: { initializedEmployees: 0, totalEmployees: 0 },
      skillCoverage: data.skillCoverage.map((skill) => ({ ...skill, qualifiedEmployees: 0, knownEmployees: 0, totalEmployees: 0, coverage: null, profileCompletion: 0 })),
      employees: [],
    });
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter><EvaluationAnalyticsPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("暂无员工");
    expect(container.textContent).toContain("暂无确认");
    expect(container.textContent).not.toContain("0 / 0");
  });
});

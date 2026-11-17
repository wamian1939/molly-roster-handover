// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "../services/evaluationRepository";
import type { DashboardV1Data } from "../types/analyticsV1";
import { DashboardPage } from "./DashboardPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN", storeId: null }, isLoading: false }),
}));

let root: Root | null;
let container: HTMLDivElement;

const data: DashboardV1Data = {
  stores: [{ id: "store-1", name: "Hurstville" }, { id: "store-2", name: "Burwood" }],
  summary: {
    employees: 3,
    regularEmployees: 2,
    trainingEmployees: 1,
    evaluatedEmployees: 2,
    notEvaluatedEmployees: 1,
    evaluationCoverage: 2 / 3,
    averageScore: 65,
    averageSkillScore: 30,
    averageCurrentSkillCoverage: 0.75,
    initializedSkillProfiles: 1,
  },
  tierDistribution: [
    { tier: "T1", count: 0, percentage: 0 },
    { tier: "T2", count: 1, percentage: 50 },
    { tier: "T3", count: 0, percentage: 0 },
    { tier: "T4", count: 1, percentage: 50 },
    { tier: "T5", count: 0, percentage: 0 },
  ],
  skillGaps: [{
    skillDefinitionId: "skill-1",
    skillCode: "milk-bar",
    skillNameZh: "奶吧",
    skillNameEn: "Milk bar",
    category: "BackKitchen",
    qualifiedEmployees: 1,
    knownEmployees: 2,
    totalEmployees: 3,
    coverage: 0.5,
    profileCompletion: 2 / 3,
  }],
  topEmployees: [{ employeeId: "employee-1", employeeName: "HandoverEmployee016", employeeType: "REGULAR", evaluationEmployeeType: "REGULAR", storeId: "store-1", storeName: "Hurstville", overallScore: 80, tier: "T2", completedAt: "2026-08-12T00:00:00.000Z" }],
  needsAttention: [{ employeeId: "employee-2", employeeName: "Alex", employeeType: "TRAINING", evaluationEmployeeType: "TRAINING", storeId: "store-1", storeName: "Hurstville", overallScore: 50, tier: "T4", completedAt: "2026-08-11T00:00:00.000Z", skillCoverage: null, reasons: ["LowOverallScore"] }],
  notEvaluatedEmployees: [
    { employeeId: "employee-3", employeeName: "Jane", employeeType: "REGULAR", storeId: "store-1", storeName: "Hurstville" },
    { employeeId: "employee-4", employeeName: "Mina", employeeType: "TRAINING", storeId: "store-2", storeName: "Burwood" },
  ],
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

describe("DashboardPage", () => {
  it("renders latest V1 population metrics and actionable gaps without legacy scoring", async () => {
    vi.spyOn(evaluationRepository, "fetchDashboard").mockResolvedValue(data);
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("2 / 3");
    expect(container.textContent).toContain("正式 2 · 培训 1");
    expect(container.textContent).toContain("培训");
    expect(container.textContent).toContain("65");
    expect(container.textContent).toContain("T4");
    expect(container.textContent).toContain("综合评分较低");
    expect(container.textContent).toContain("1 人可独立 / 2 人已确认");
    expect(container.textContent).toContain("Jane");
    expect(container.querySelector('a[href*="/evaluation/v1/new"]')).toBeTruthy();
    expect(container.querySelector('a[href*="/evaluation/v1/new"]')).toBeTruthy();
    expect(container.textContent).toContain("评分");
    expect(container.textContent).not.toContain("继续评分");
    expect(container.textContent).not.toMatch(/Grade|AI Risk|Synthetic|Manual Weighted|Attendance|Pressure|Teamwork/i);
  });

  it("surfaces store scoring entry points near the top of the dashboard", async () => {
    vi.spyOn(evaluationRepository, "fetchDashboard").mockResolvedValue(data);
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("选择门店开始评分");
    expect(container.textContent).toContain("进入门店员工评分");
    expect(container.querySelector('a[href="/evaluations/stores/store-1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/evaluations/stores/store-2"]')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/evaluations\/stores\/hurstville/i);
  });

  it("does not render 0 / 0 when the authorized scope has no employees", async () => {
    vi.spyOn(evaluationRepository, "fetchDashboard").mockResolvedValue({
      ...data,
      summary: { ...data.summary, employees: 0, evaluatedEmployees: 0, notEvaluatedEmployees: 0, evaluationCoverage: 0, initializedSkillProfiles: 0 },
      stores: [],
      skillGaps: [],
      topEmployees: [],
      needsAttention: [],
      notEvaluatedEmployees: [],
    });
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter><DashboardPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("暂无员工");
    expect(container.textContent).not.toContain("0 / 0");
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository, type StoreEvaluationQueryParams } from "../services/evaluationRepository";
import type { EmployeeType, StoreEvaluationRosterResponse } from "../types/evaluation";
import { StoreEvaluationPage } from "./StoreEvaluationPage";

const regularItem: StoreEvaluationRosterResponse["items"][number] = {
  employee: { id: "regular-1", displayName: "Regular Person", employmentType: "Full-time", status: "Active", employeeType: "REGULAR" },
  evaluationStatus: "Completed",
  latestCompletedEvaluation: { id: "eval-1", overallScore: 82.4, tier: "T2", skillCoverage: 0.75, completedAt: "2026-08-21T00:00:00.000Z", employeeTypeSnapshot: "REGULAR" },
  currentRound: null,
};

const trainingItem: StoreEvaluationRosterResponse["items"][number] = {
  employee: { id: "training-1", displayName: "Training Person", employmentType: "Part-time", status: "Active", employeeType: "TRAINING" },
  evaluationStatus: "Submitted",
  latestCompletedEvaluation: null,
  currentRound: { id: "round-training", status: "OPEN", completedCount: 1, eligibleCount: 2, myEvaluation: { id: "submission-1", status: "Submitted" } },
};

function response(employeeType: EmployeeType, items: StoreEvaluationRosterResponse["items"]): StoreEvaluationRosterResponse {
  const evaluated = items.filter((item) => item.latestCompletedEvaluation).length;
  const submitted = items.filter((item) => item.currentRound?.myEvaluation).length;
  return {
    store: { id: "hurstville", name: "Hurstville", region: "Sydney", city: "Hurstville", managerName: "Winnie" },
    summary: { totalEmployees: items.length, evaluatedEmployees: evaluated, submittedEmployees: submitted, averageScore: employeeType === "REGULAR" && evaluated ? 82.4 : null },
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    totalPages: 1,
  };
}

let root: Root | null;
let container: HTMLDivElement;

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

function mockRoster(trainingItems = [trainingItem]) {
  return vi.spyOn(evaluationRepository, "fetchStoreEvaluations").mockImplementation(async (_storeId, filters?: StoreEvaluationQueryParams) => {
    const type = filters?.employeeType === "TRAINING" ? "TRAINING" : "REGULAR";
    const items = type === "TRAINING" ? trainingItems : [regularItem];
    const result = response(type, items);
    return filters?.pageSize === 1 ? { ...result, items: items.slice(0, 1), pageSize: 1 } : result;
  });
}

async function renderPath(path: string) {
  root = createRoot(container);
  await act(async () => {
    root?.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/evaluations/stores/:storeId/employees/:employeeType" element={<StoreEvaluationPage />} /><Route path="/evaluations/stores/:storeId" element={<p>Store landing</p>} /></Routes></MemoryRouter>);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("StoreEvaluationPage", () => {
  it("deep-links to the regular route and only requests and displays regular employees", async () => {
    const request = mockRoster();
    await renderPath("/evaluations/stores/hurstville/employees/regular");

    expect(container.textContent).toContain("Regular Person");
    expect(container.textContent).not.toContain("Training Person");
    expect(request).toHaveBeenCalledWith("hurstville", expect.objectContaining({ employeeType: "REGULAR", pageSize: 25 }));
    expect(container.querySelector('a[href="/evaluations/stores/hurstville"]')?.textContent).toContain("返回员工类型");
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain("正式员工");
  });

  it("uses training-only KPI values and removes the redundant employee type filter", async () => {
    mockRoster();
    await renderPath("/evaluations/stores/hurstville/employees/training");

    expect(container.textContent).toContain("Training Person");
    expect(container.textContent).not.toContain("Regular Person");
    expect(container.textContent).toContain("培训员工，共 1 位员工");
    expect(container.textContent).toContain("当前账号已提交的本轮评分");
    expect(container.textContent).not.toContain("82.4");
    expect(container.querySelector('[aria-label="员工类型"]')).toBeNull();
  });

  it("shows a type-specific empty state without hiding the route", async () => {
    mockRoster([]);
    await renderPath("/evaluations/stores/hurstville/employees/training");

    expect(container.textContent).toContain("暂无培训员工");
    expect(container.textContent).toContain("该门店当前没有处于培训阶段的员工");
    expect(container.querySelector('a[href="/employees"]')?.textContent).toContain("前往员工管理");
  });
});

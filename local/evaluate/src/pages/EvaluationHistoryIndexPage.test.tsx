// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "../services/evaluationRepository";
import { employeeRepository } from "../services/employeeRepository";
import { EvaluationHistoryIndexPage } from "./EvaluationHistoryIndexPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { role: "STORE_EVALUATOR", stores: [{ id: "store-1", name: "Hurstville" }] },
    selectedStoreId: "store-1",
    selectStore: vi.fn(),
  }),
}));

let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.spyOn(employeeRepository, "fetchStoreJobs").mockResolvedValue([]);
  vi.spyOn(employeeRepository, "fetchEmployees").mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 1 });
});

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  container.remove();
  root = null;
  vi.restoreAllMocks();
});

describe("EvaluationHistoryIndexPage", () => {
  it("renders CLOSED rounds as the immutable history contract", async () => {
    vi.spyOn(evaluationRepository, "fetchStores").mockResolvedValue([{ id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Manager", city: "Sydney", isActive: true }]);
    vi.spyOn(evaluationRepository, "fetchHistoryIndex").mockResolvedValue({ items: [{
      id: "round-1",
      roundId: "round-1",
      roundNumber: 3,
      employeeId: "employee-1",
      employeeName: "HandoverEmployee016 Snapshot",
      identitySources: { employeeName: "EVALUATION_SNAPSHOT", storeName: "CURRENT_PROFILE_FALLBACK" },
      storeId: "store-1",
      storeName: "Hurstville Snapshot",
      evaluatorId: "manager-1",
      evaluatorName: "Winnie Snapshot",
      overallScore: 82.4,
      tier: "T2",
      skillCoverage: 0.8,
      completedAt: "2026-08-12T10:00:00.000Z",
      employeeTypeSnapshot: "REGULAR",
      completedCount: 2,
      eligibleCount: 3,
      aggregateStatus: "FINAL",
      jobsSnapshot: [],
    }], page: 1, pageSize: 25, total: 1, totalPages: 1 });

    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter><EvaluationHistoryIndexPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("HandoverEmployee016 Snapshot");
    expect(container.textContent).toContain("员工姓名取自个人评价记录");
    expect(container.textContent).toContain("门店名称暂用当前资料，历史名称未确认");
    expect(container.textContent).toContain("Hurstville Snapshot");
    expect(container.textContent).toContain("已结束轮次");
    expect(container.textContent).toContain("第 3 轮");
    expect(container.textContent).toContain("82.4 / 100");
    expect(container.textContent).toContain("T2");
    expect(container.textContent).toContain("2 / 3");
    expect(container.textContent).not.toContain("Winnie Snapshot");
    expect(container.textContent).not.toMatch(/Grade|AI Risk|Synthetic|Manual Weighted|legacy-v0/i);
    expect(container.querySelector('a[href^="/evaluation-rounds/round-1?"]')).toBeTruthy();
  });

  it("does not fabricate fallback history", async () => {
    vi.spyOn(evaluationRepository, "fetchStores").mockResolvedValue([{ id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Manager", city: "Sydney", isActive: true }]);
    vi.spyOn(evaluationRepository, "fetchHistoryIndex").mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 });
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter><EvaluationHistoryIndexPage /></MemoryRouter>);
      await Promise.resolve();
    });
    expect(container.textContent).toContain("暂无已结束的评价轮次");
  });
});

// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository, type StoreEvaluationQueryParams } from "../services/evaluationRepository";
import type { StoreEvaluationRosterResponse } from "../types/evaluation";
import { StoreEmployeeTypeSelectionPage } from "./StoreEmployeeTypeSelectionPage";

function selectionResponse(kind: "all" | "regular" | "training"): StoreEvaluationRosterResponse {
  const summary = kind === "all"
    ? { totalEmployees: 25, evaluatedEmployees: 23, submittedEmployees: 2, averageScore: 76.4 }
    : kind === "regular"
      ? { totalEmployees: 24, evaluatedEmployees: 23, submittedEmployees: 1, averageScore: 77.1 }
      : { totalEmployees: 1, evaluatedEmployees: 0, submittedEmployees: 1, averageScore: null };
  return { store: { id: "hurstville", name: "Hurstville", region: "Sydney", city: "Hurstville", managerName: "Winnie" }, summary, items: [], page: 1, pageSize: 1, total: summary.totalEmployees, totalPages: Math.max(1, summary.totalEmployees) };
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

describe("StoreEmployeeTypeSelectionPage", () => {
  it("keeps the store route as the employee type selection landing with correct counts and live submissions", async () => {
    vi.spyOn(evaluationRepository, "fetchStoreEvaluations").mockImplementation(async (_storeId, filters?: StoreEvaluationQueryParams) => {
      if (filters?.employeeType === "REGULAR") return selectionResponse("regular");
      if (filters?.employeeType === "TRAINING") return selectionResponse("training");
      return selectionResponse("all");
    });
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter initialEntries={["/evaluations/stores/hurstville"]}><Routes><Route path="/evaluations/stores/:storeId" element={<StoreEmployeeTypeSelectionPage />} /><Route path="/evaluations/stores/:storeId/employees/:employeeType" element={<p>Employee list route</p>} /></Routes></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("选择员工类型");
    expect(container.querySelector('a[href="/evaluations/stores/hurstville/employees/regular"]')?.textContent).toContain("24");
    expect(container.querySelector('a[href="/evaluations/stores/hurstville/employees/training"]')?.textContent).toContain("1");
    expect(container.textContent).toContain("评分入口始终可用");
    expect(container.textContent).not.toContain("草稿");
    expect(container.querySelector("table")).toBeNull();

    const trainingLink = container.querySelector<HTMLAnchorElement>('a[href="/evaluations/stores/hurstville/employees/training"]');
    await act(async () => trainingLink?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(container.textContent).toContain("Employee list route");
  });
});

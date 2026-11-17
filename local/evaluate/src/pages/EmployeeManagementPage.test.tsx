// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { employeeRepository } from "../services/employeeRepository";
import { evaluationRepository } from "../services/evaluationRepository";
import type { Employee } from "../types/evaluation";
import { EmployeeManagementPage } from "./EmployeeManagementPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ selectedStoreId: null, user: { role: "ADMIN", stores: [] } }),
}));

const base: Employee = {
  id: "employee-1", storeId: "store-1", storeName: "Hurstville", displayName: "HandoverEmployee006",
  employmentType: "Part-time", employmentCommencementDate: null, tenureMonths: null,
  status: "Active", employeeType: "REGULAR", createdAt: "2026-01-01", updatedAt: "2026-01-01",
  evaluationCount: 2, jobs: [],
};

describe("EmployeeManagementPage scoring actions", () => {
  let container: HTMLDivElement;
  let root: Root | null;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); root = null; vi.spyOn(employeeRepository, "fetchStoreJobs").mockResolvedValue([]); });
  afterEach(async () => { if (root) await act(async () => root?.unmount()); container.remove(); vi.restoreAllMocks(); });

  it("keeps scoring available for active employees and hides scoring for archived employees", async () => {
    vi.spyOn(evaluationRepository, "fetchStores").mockResolvedValue([{ id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney" }]);
    vi.spyOn(employeeRepository, "fetchEmployees").mockResolvedValue({
      items: [base, { ...base, id: "employee-2", displayName: "Previously Scored Employee" }, { ...base, id: "employee-3", displayName: "Archived Employee", status: "Archived" }],
      page: 1, pageSize: 25, total: 3, totalPages: 1,
    });
    root = createRoot(container);
    await act(async () => { root?.render(<MemoryRouter initialEntries={["/employees"]}><EmployeeManagementPage /></MemoryRouter>); await Promise.resolve(); await Promise.resolve(); });

    expect(container.querySelector('a[href^="/employees/employee-1/evaluation/v1/new?"]')?.textContent).toContain("再次评分");
    expect(container.querySelector('a[href^="/employees/employee-2/evaluation/v1/new?"]')?.textContent).toContain("再次评分");
    expect([...container.querySelectorAll("article")].find((item) => item.textContent?.includes("Archived Employee"))?.textContent).not.toContain("评分");
  });

  it("requires the accessible confirmation dialog before archiving", async () => {
    vi.spyOn(evaluationRepository, "fetchStores").mockResolvedValue([{ id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney" }]);
    vi.spyOn(employeeRepository, "fetchEmployees").mockResolvedValue({ items: [base], page: 1, pageSize: 25, total: 1, totalPages: 1 });
    const archive = vi.spyOn(employeeRepository, "archiveEmployee").mockResolvedValue({ ...base, status: "Archived" });
    root = createRoot(container);
    await act(async () => { root?.render(<MemoryRouter initialEntries={["/employees"]}><EmployeeManagementPage /></MemoryRouter>); await Promise.resolve(); await Promise.resolve(); });

    const archiveButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("归档"));
    await act(async () => archiveButton?.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("历史评价仍会保留");
    expect(archive).not.toHaveBeenCalled();

    const confirmButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent?.includes("确认归档"));
    await act(async () => { confirmButton?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(archive).toHaveBeenCalledWith("employee-1");
  });

  it("renders database-backed multi-job tags and an unassigned state", async () => {
    const fullRole = { id: "job-1", storeId: "store-1", name: "全岗", code: "full-role", colorToken: "teal" as const, displayOrder: 10, isActive: true };
    const trainer = { id: "job-2", storeId: "store-1", name: "带训员", code: "trainer", colorToken: "violet" as const, displayOrder: 20, isActive: true };
    vi.mocked(employeeRepository.fetchStoreJobs).mockResolvedValue([fullRole, trainer]);
    vi.spyOn(evaluationRepository, "fetchStores").mockResolvedValue([{ id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney" }]);
    vi.spyOn(employeeRepository, "fetchEmployees").mockResolvedValue({ items: [{ ...base, jobs: [fullRole, trainer] }, { ...base, id: "employee-2", displayName: "No Job", jobs: [] }], page: 1, pageSize: 25, total: 2, totalPages: 1 });
    root = createRoot(container);
    await act(async () => { root?.render(<MemoryRouter initialEntries={["/employees"]}><EmployeeManagementPage /></MemoryRouter>); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain("全岗");
    expect(container.textContent).toContain("带训员");
    expect(container.textContent).toContain("未设置岗位");
  });
});

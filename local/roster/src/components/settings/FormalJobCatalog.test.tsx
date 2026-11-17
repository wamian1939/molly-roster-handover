import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStoreJob } from "../../types/workforce";
import { FormalJobCatalog } from "./FormalJobCatalog";

const employees = vi.hoisted(() => vi.fn());
vi.mock("../../services/workforceRepository", () => ({ workforceRepository: { employees } }));

const jobs: RosterStoreJob[] = [
  { id: "job-a", storeId: "hurstville", name: "全岗", code: "full-role", colorToken: "#123456", displayOrder: 1, isActive: true },
  { id: "job-b", storeId: "hurstville", name: "后厨", code: "back-kitchen", colorToken: "#654321", displayOrder: 2, isActive: true },
];
const catalog = (storeId = "hurstville") => <FormalJobCatalog key={storeId} storeId={storeId} jobs={jobs} roles={[]} inactiveRoles={[]} settingsReady onAssociate={vi.fn()} />;

beforeEach(() => { employees.mockReset(); });
afterEach(cleanup);

describe("Evaluate formal job catalog", () => {
  it("does not show a previous store's job names while the new store settings load", () => {
    employees.mockResolvedValue({ employees: [] });
    render(<FormalJobCatalog storeId="greensquare" jobs={jobs} roles={[]} inactiveRoles={[]} settingsReady={false} onAssociate={vi.fn()} />);
    expect(screen.getByText("当前门店正式岗位清单尚未加载。")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /全岗/ })).toBeNull();
  });

  it("shows current canonical grants and makes zero-grant jobs explicit", async () => {
    employees.mockResolvedValue({ employees: [
      { id: "a", displayName: "HandoverEmployee006", storeId: "hurstville", isActive: true, positions: [{ id: "job-a" }] },
      { id: "b", displayName: "Former", storeId: "hurstville", isActive: false, positions: [{ id: "job-b" }] },
      { id: "c", displayName: "Other Store", storeId: "greensquare", isActive: true, positions: [{ id: "job-b" }] },
    ] });
    render(catalog());
    await waitFor(() => expect(screen.getByRole("region", { name: "全岗的正式授权员工" }).textContent).toContain("HandoverEmployee006"));
    expect(screen.getByRole("button", { name: /全岗/ }).textContent).toContain("Evaluate 正式授权 1 人");
    expect(screen.getByText("HandoverEmployee006")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /后厨/ }));
    expect(screen.getByText("当前门店尚无员工获得这项正式岗位授权；员工授权需在 Evaluate 单独确认。")).toBeTruthy();
    expect(screen.queryByText("Former")).toBeNull();
    expect(screen.queryByText("Other Store")).toBeNull();
  });

  it("shows an unavailable count instead of a false zero when Evaluate cannot load", async () => {
    employees.mockRejectedValue(new Error("目录暂不可用"));
    render(catalog());
    await waitFor(() => expect(screen.getAllByText("授权人数暂不可用")).toHaveLength(2));
    expect(screen.getByRole("alert").textContent).toContain("目录暂不可用");
    expect(screen.queryByText(/正式授权 0 人/)).toBeNull();
  });

  it("does not leak a previous store's delayed employees into the new store", async () => {
    let resolveOld!: (value: { employees: unknown[] }) => void;
    employees.mockImplementation((storeId: string) => storeId === "hurstville"
      ? new Promise((resolve) => { resolveOld = resolve; })
      : Promise.resolve({ employees: [] }));
    const view = render(catalog());
    await waitFor(() => expect(employees).toHaveBeenCalledWith("hurstville"));
    view.rerender(catalog("greensquare"));
    await waitFor(() => expect(employees).toHaveBeenCalledWith("greensquare"));
    await act(async () => { resolveOld({ employees: [{ id: "old", displayName: "Old Person", storeId: "hurstville", isActive: true, positions: [{ id: "job-a" }] }] }); });
    expect(screen.queryByText("Old Person")).toBeNull();
  });
});

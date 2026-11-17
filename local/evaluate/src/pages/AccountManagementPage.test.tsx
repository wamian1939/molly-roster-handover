// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui/ToastProvider";
import { authRepository, type ManagedAccount } from "../services/authRepository";
import { evaluationRepository } from "../services/evaluationRepository";
import { AccountManagementPage } from "./AccountManagementPage";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin-1", role: "ADMIN" } }) }));

const admin: ManagedAccount = { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN", stores: [], canAccessAllStores: true, isActive: true, lastLoginAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const multi: ManagedAccount = { id: "multi-1", username: "regional.manager", displayName: "Regional Manager", role: "STORE_EVALUATOR", stores: [{ id: "hurstville", name: "Hurstville", isActive: true }, { id: "greensquare", name: "Green Square", isActive: true }], canAccessAllStores: false, isActive: true, lastLoginAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
const stores = [
  { id: "hurstville", name: "Hurstville", region: "Sydney", managerName: "Manager", city: "Sydney" },
  { id: "greensquare", name: "Green Square", region: "Sydney", managerName: "Manager", city: "Sydney" },
];

let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  vi.spyOn(evaluationRepository, "fetchStores").mockResolvedValue(stores);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AccountManagementPage multi-store access", () => {
  it("renders multi-store accounts compactly and prevents self deletion", async () => {
    vi.spyOn(authRepository, "listAccounts").mockResolvedValue([admin, multi]);
    await renderPage();
    expect(container.textContent).toContain("Hurstville");
    expect(container.textContent).toContain("Green Square");
    expect(container.textContent).toContain("全部门店");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="不能删除当前账号"]')?.disabled).toBe(true);
  });

  it("requires one Store and supports searchable checkbox selection with removable chips", async () => {
    vi.spyOn(authRepository, "listAccounts").mockResolvedValue([admin]);
    await renderPage();
    const form = container.querySelector("form");
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain("请至少选择一家可管理门店");

    const addButton = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("添加门店"));
    await act(async () => addButton?.click());
    const option = [...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((button) => button.textContent?.includes("Green Square"));
    await act(async () => option?.click());
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="移除 Green Square"]')).not.toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="移除 Green Square"]')?.click());
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="移除 Green Square"]')).toBeNull();
  });

  it("deletes another account with confirmation and removes its row", async () => {
    vi.spyOn(authRepository, "listAccounts").mockResolvedValueOnce([admin, multi]).mockResolvedValueOnce([admin]);
    vi.spyOn(authRepository, "deleteAccount").mockResolvedValue({ ok: true });
    await renderPage();
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="删除账号"]')?.click());
    expect(document.body.textContent).toContain("进行中的评分将不再计入本轮");
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "删除账号");
    await act(async () => { confirm?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(authRepository.deleteAccount).toHaveBeenCalledWith("multi-1");
    expect(container.textContent).not.toContain("regional.manager");
  });
});

async function renderPage() {
  root = createRoot(container);
  await act(async () => {
    root?.render(<MemoryRouter><ToastProvider><AccountManagementPage /></ToastProvider></MemoryRouter>);
    await Promise.resolve();
    await Promise.resolve();
  });
}

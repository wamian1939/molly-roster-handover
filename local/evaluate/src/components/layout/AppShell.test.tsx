// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../services/authRepository";
import { AppShell } from "./AppShell";

let currentUser: AuthUser;

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, selectedStoreId: currentUser.storeIds[0] ?? null, selectStore: vi.fn(), login: vi.fn(), logout: vi.fn() }),
}));

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
});

describe("AppShell navigation", () => {
  it("shows Roster Skill Board in desktop and mobile navigation for a single-store user", async () => {
    currentUser = user("STORE_EVALUATOR", "store-1");

    renderShell("/evaluations");

    const links = skillBoardLinks();
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute("href") === "/skill-board")).toBe(true);
    expect(container.textContent).toContain("排班技能板");
    expect(container.innerHTML).not.toMatch(/hurstville/i);
  });

  it("uses the unified Skill Board route for multi-store users", async () => {
    currentUser = user("ADMIN", null);

    renderShell("/evaluations");

    const links = skillBoardLinks();
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute("href") === "/skill-board")).toBe(true);
  });

  it("shows a Store selector only when an evaluator has multiple authorized Stores", async () => {
    currentUser = user("STORE_EVALUATOR", "store-1");
    renderShell("/evaluations");
    expect(container.querySelector('[aria-label="当前门店"]')).toBeNull();
    await act(async () => root?.unmount());
    root = null;

    currentUser = { ...user("STORE_EVALUATOR", "store-1"), storeIds: ["store-1", "store-2"], stores: [{ id: "store-1", name: "Hurstville" }, { id: "store-2", name: "Green Square" }] };
    renderShell("/evaluations");
    expect(container.textContent).toContain("当前门店");
    expect(container.querySelector('[role="combobox"]')).not.toBeNull();
  });

  it("keeps only the Skill Board navigation item active on refreshable Skill Board URLs", async () => {
    currentUser = user("STORE_EVALUATOR", "store-1");

    renderShell("/skill-board?storeId=store-1");

    const activeLabels = activeNavigationLinks().map((link) => link.textContent);
    expect(activeLabels).toEqual(["排班技能板", "排班技能板"]);
    expect(activeLabels).not.toContain("Dashboard");
    expect(activeNavigationLinks().every((link) => link.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("opens the explicit More dialog for mobile-only navigation", async () => {
    currentUser = user("STORE_EVALUATOR", "store-1");
    renderShell("/evaluations");

    const moreButton = container.querySelector<HTMLButtonElement>('button[aria-label="打开更多菜单"]');
    expect(moreButton).not.toBeNull();
    await act(async () => moreButton?.click());

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("数据分析");
    expect(document.body.textContent).toContain("退出登录");
  });

  it("opens the tablet navigation drawer without duplicating the desktop shell", async () => {
    currentUser = user("ADMIN", null);
    renderShell("/stores");

    const menuButton = container.querySelector<HTMLButtonElement>('button[aria-label="打开导航"]');
    expect(menuButton).not.toBeNull();
    await act(async () => menuButton?.click());

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("门店管理");
    expect(document.body.textContent).toContain("账号管理");
    expect(document.querySelector<HTMLButtonElement>('button[aria-label="关闭导航"]')).not.toBeNull();
  });

  it("returns the internal workspace to the top when the route changes", async () => {
    currentUser = user("STORE_EVALUATOR", "store-1");
    renderShell("/evaluations");

    const workspace = container.querySelector<HTMLDivElement>(".app-workspace-scroll");
    expect(workspace).not.toBeNull();
    if (workspace) workspace.scrollTop = 640;
    const employeeLink = [...container.querySelectorAll("a")].find((link) => link.textContent?.includes("门店员工"));
    await act(async () => employeeLink?.click());

    expect(workspace?.scrollTop).toBe(0);
  });
});

function renderShell(pathname: string) {
  root = createRoot(container);
  act(() => {
    root?.render(
      <MemoryRouter initialEntries={[pathname]}>
        <AppShell>
          <div>page content</div>
        </AppShell>
      </MemoryRouter>,
    );
  });
}

function user(role: AuthUser["role"], storeId: string | null): AuthUser {
  return {
    id: "user-1",
    accountId: "user-1",
    userId: "user-1",
    username: "manager",
    displayName: "Manager",
    role,
    storeIds: storeId ? [storeId] : [],
    stores: storeId ? [{ id: storeId, name: "Store" }] : [],
    canAccessAllStores: role === "ADMIN",
  };
}

function skillBoardLinks() {
  return [...container.querySelectorAll("a")].filter((link) => link.textContent?.includes("排班技能板"));
}

function activeNavigationLinks() {
  return [...container.querySelectorAll("a")].filter((link) => link.getAttribute("aria-current") === "page");
}

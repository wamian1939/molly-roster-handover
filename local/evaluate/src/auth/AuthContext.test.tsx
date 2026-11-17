// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authRepository, type AuthUser } from "../services/authRepository";
import { AuthProvider, useAuth } from "./AuthContext";

let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("AuthContext Store selection", () => {
  it("rejects a stale saved Store and switches immediately when refreshed permissions change", async () => {
    window.localStorage.setItem("evaluate-molly:last-selected-store", "unauthorized-store");
    const first = evaluator(["store-a", "store-b"]);
    const second = evaluator(["store-b"]);
    vi.spyOn(authRepository, "me").mockResolvedValueOnce({ user: first }).mockResolvedValueOnce({ user: second });
    root = createRoot(container);
    await act(async () => { root?.render(<AuthProvider><Probe /></AuthProvider>); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain("store-a|store-a,store-b");

    await act(async () => { window.dispatchEvent(new Event("auth:forbidden")); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain("store-b|store-b");
    expect(window.localStorage.getItem("evaluate-molly:last-selected-store")).toBe("store-b");
  });
});

function Probe() {
  const { user, selectedStoreId } = useAuth();
  return <span>{selectedStoreId}|{user?.storeIds.join(",")}</span>;
}

function evaluator(storeIds: string[]): AuthUser {
  return { id: "manager-1", accountId: "manager-1", userId: "manager-1", username: "manager", displayName: "Manager", role: "STORE_EVALUATOR", storeIds, stores: storeIds.map((id) => ({ id, name: id })), canAccessAllStores: false };
}

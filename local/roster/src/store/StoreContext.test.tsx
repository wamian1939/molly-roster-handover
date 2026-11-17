// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/authRepository";
import { StoreProvider, useStoreSelection } from "./StoreContext";

const auth = vi.hoisted(() => ({ user: null as AuthUser | null }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));

const mounted: Array<() => void> = [];
beforeEach(() => window.sessionStorage.clear());
afterEach(() => { for (const cleanup of mounted.splice(0)) cleanup(); auth.user = null; });

function Probe() {
  const { selectedStoreId, setSelectedStoreId, initializeStoreId } = useStoreSelection();
  return <div><output>{selectedStoreId}</output><button onClick={() => setSelectedStoreId("store-2")}>second</button><button onClick={() => setSelectedStoreId("store-3")}>forbidden</button><button onClick={() => initializeStoreId(["store-1", "store-2"])}>initialize</button><button onClick={() => initializeStoreId(["store-1", "store-2"], "store-2")}>initialize preferred</button><button onClick={() => initializeStoreId(["store-1", "store-2"], "store-3")}>initialize invalid preferred</button><button onClick={() => initializeStoreId(["store-1"])}>one available</button><button onClick={() => initializeStoreId([])}>none available</button></div>;
}

function mount() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<StoreProvider><Probe /></StoreProvider>));
  const dispose = () => { act(() => root.unmount()); container.remove(); };
  mounted.push(dispose);
  return { selected: () => container.querySelector("output")?.textContent,
    click: (label: string) => act(() => (Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label) as HTMLButtonElement).click()),
    unmount: () => { mounted.splice(mounted.indexOf(dispose), 1); dispose(); } };
}

function user(role: AuthUser["role"], storeIds: string[]): AuthUser {
  return { id: "account-1", accountId: "account-1", userId: "account-1", username: "tester", displayName: "Tester", role, storeIds, stores: storeIds.map((id) => ({ id, name: id })), canAccessAllStores: role === "ADMIN" };
}

describe("Roster authorized store selection", () => {
  it("lets a multi-store evaluator switch only among authorized stores", () => {
    auth.user = user("STORE_EVALUATOR", ["store-1", "store-2"]);
    const view = mount();
    view.click("initialize");
    expect(view.selected()).toBe("store-1");
    view.click("second");
    expect(view.selected()).toBe("store-2");
    view.click("forbidden");
    expect(view.selected()).toBe("store-2");
  });

  it("keeps a single-store evaluator in their only store", () => {
    auth.user = user("STORE_EVALUATOR", ["store-1"]);
    const view = mount();
    view.click("one available");
    view.click("second");
    expect(view.selected()).toBe("store-1");
  });

  it("waits for the current store list and clears a retired evaluator store", () => {
    auth.user = user("STORE_EVALUATOR", ["retired-store", "store-1"]);
    const view = mount();
    expect(view.selected()).toBe("");
    view.click("one available");
    expect(view.selected()).toBe("store-1");
    view.click("none available");
    expect(view.selected()).toBe("");
  });

  it("lets an administrator initialize and switch stores", () => {
    auth.user = user("ADMIN", []);
    const view = mount();
    view.click("initialize");
    expect(view.selected()).toBe("store-1");
    view.click("second");
    expect(view.selected()).toBe("store-2");
    view.click("forbidden");
    expect(view.selected()).toBe("store-2");
  });

  it("restores a valid calendar store from the URL but ignores an unknown store", () => {
    auth.user = user("ADMIN", []);
    const view = mount();
    view.click("initialize preferred");
    expect(view.selected()).toBe("store-2");
    view.click("initialize invalid preferred");
    expect(view.selected()).toBe("store-2");
  });

  it("restores the same account's store after a page reload", () => {
    auth.user = user("ADMIN", []);
    const first = mount();
    first.click("initialize");
    first.click("second");
    first.unmount();
    const reloaded = mount();
    expect(reloaded.selected()).toBe("");
    reloaded.click("initialize");
    expect(reloaded.selected()).toBe("store-2");
  });

  it("replaces an administrator's remembered store when it is no longer in the accessible store list", () => {
    auth.user = user("ADMIN", []);
    window.sessionStorage.setItem("molly-roster:store:account-1", "retired-store");
    const view = mount();
    expect(view.selected()).toBe("");
    view.click("one available");
    expect(view.selected()).toBe("store-1");
    expect(window.sessionStorage.getItem("molly-roster:store:account-1")).toBe("store-1");
    view.click("none available");
    expect(view.selected()).toBe("");
  });

  it("does not reuse a store from another account or beyond an evaluator's scope", () => {
    auth.user = user("ADMIN", []);
    const first = mount();
    first.click("second");
    first.unmount();
    auth.user = { ...user("ADMIN", []), id: "account-2", accountId: "account-2" };
    const otherAccount = mount();
    expect(otherAccount.selected()).toBe("");
    otherAccount.unmount();
    auth.user = user("STORE_EVALUATOR", ["store-1"]);
    const evaluator = mount();
    expect(evaluator.selected()).toBe("");
    evaluator.click("one available");
    expect(evaluator.selected()).toBe("store-1");
  });
});

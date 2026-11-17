// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StoreMultiSelect } from "./StoreMultiSelect";

const stores = [
  { id: "hurstville", name: "Hurstville" },
  { id: "greensquare", name: "Green Square" },
  { id: "central", name: "Central" },
];

let root: Root;
let container: HTMLDivElement;

function ControlledSelect() {
  const [value, setValue] = useState<string[]>([]);
  return <StoreMultiSelect stores={stores} value={value} onChange={setValue} />;
}

beforeEach(async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<ControlledSelect />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

async function key(target: Element, name: string, shiftKey = false) {
  await act(async () => target.dispatchEvent(new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true, cancelable: true })));
}

function option(name: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((node) => node.textContent?.includes(name));
  if (!match) throw new Error(`Missing store option ${name}`);
  return match;
}

describe("StoreMultiSelect keyboard access", () => {
  it("navigates, selects and closes without tabbing through every store", async () => {
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
    await act(async () => trigger?.click());
    const search = document.querySelector<HTMLInputElement>('input[placeholder="搜索门店"]');
    const listbox = document.querySelector('[role="listbox"]');
    expect(document.activeElement).toBe(search);
    expect(listbox?.getAttribute("aria-multiselectable")).toBe("true");
    expect(listbox?.querySelector('button:not([role="option"])')).toBeNull();

    await key(search!, "ArrowDown");
    expect(document.activeElement).toBe(option("Hurstville"));
    await key(option("Hurstville"), "ArrowDown");
    expect(document.activeElement).toBe(option("Green Square"));
    await key(option("Green Square"), " ");
    expect(option("Green Square").getAttribute("aria-selected")).toBe("true");

    await key(option("Green Square"), "Home");
    expect(document.activeElement).toBe(option("Hurstville"));
    await key(option("Hurstville"), "Enter");
    expect(option("Hurstville").getAttribute("aria-selected")).toBe("true");
    await key(option("Hurstville"), "End");
    expect(document.activeElement).toBe(option("Central"));

    await key(option("Central"), "Tab", true);
    expect(document.activeElement).toBe(search);
    await key(search!, "Escape");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(container.querySelector('button[aria-label="移除 Green Square"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="移除 Hurstville"]')).not.toBeNull();
  });

  it("keeps an empty search safe and resets it on the next open", async () => {
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
    await act(async () => trigger?.click());
    const search = document.querySelector<HTMLInputElement>('input[placeholder="搜索门店"]');
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      valueSetter?.call(search, "No matching store");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("没有匹配的门店");
    await key(search!, "ArrowDown");
    expect(document.activeElement).toBe(search);
    await key(search!, "Escape");
    await act(async () => trigger?.click());
    expect(document.querySelector<HTMLInputElement>('input[placeholder="搜索门店"]')?.value).toBe("");
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
  });
});

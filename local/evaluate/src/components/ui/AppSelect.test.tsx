// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSelect } from "./AppSelect";

let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container.remove();
  root = null;
});

describe("AppSelect", () => {
  it("exposes an accessible listbox and works inside a form without native visible UI", async () => {
    root = createRoot(container);
    await act(async () => root?.render(<Harness />));

    const trigger = container.querySelector('button[role="combobox"]') as HTMLButtonElement;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("select")?.getAttribute("aria-hidden")).toBe("true");

    await act(async () => {
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await Promise.resolve();
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const second = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent?.includes("第二项"));
    expect(second).toBeTruthy();

    await act(async () => second?.click());
    expect(trigger.textContent).toContain("第二项");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});

function Harness() {
  const [value, setValue] = useState("first");
  return (
    <form>
      <AppSelect
        label="测试选项"
        value={value}
        onValueChange={setValue}
        options={[{ value: "first", label: "第一项" }, { value: "second", label: "第二项" }]}
      />
    </form>
  );
}

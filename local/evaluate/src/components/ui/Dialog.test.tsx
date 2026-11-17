// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dialog } from "./Dialog";

function Harness() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button id="trigger" type="button" onClick={() => setOpen(true)}>打开</button>
      {open ? (
        <Dialog titleId="test-title" onClose={() => setOpen(false)} className="bg-white p-4">
          <h2 id="test-title">测试对话框</h2>
          <button id="first" type="button">第一个</button>
          <button id="last" type="button">最后一个</button>
        </Dialog>
      ) : null}
    </>
  );
}

describe("Dialog", () => {
  let root: Root;

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById("root")!);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("moves focus inside, traps Tab, closes with Escape, and restores the trigger", () => {
    const trigger = document.getElementById("trigger") as HTMLButtonElement;
    trigger.focus();
    act(() => trigger.click());

    const dialog = document.querySelector('[role="dialog"]');
    const first = document.getElementById("first") as HTMLButtonElement;
    const last = document.getElementById("last") as HTMLButtonElement;
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(first);
    expect(document.getElementById("root")?.inert).toBe(true);

    last.focus();
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(first);

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.getElementById("root")?.inert).toBe(false);
  });
});

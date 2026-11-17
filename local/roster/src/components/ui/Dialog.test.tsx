import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { Dialog } from "./Dialog";

afterEach(() => cleanup());

function OpeningCard() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>打开班次</button>
    {open ? <Dialog titleId="shift-title" onClose={() => setOpen(false)}><h2 id="shift-title">编辑班次</h2></Dialog> : null}
  </>;
}

describe("Dialog backdrop", () => {
  it("keeps a newly opened shift dialog visible on the second press of a double-click, then accepts a separate backdrop click", () => {
    render(<OpeningCard />);
    fireEvent.click(screen.getByRole("button", { name: "打开班次" }));
    const backdrop = screen.getByRole("dialog").parentElement;
    expect(backdrop?.classList.contains("dialog-backdrop")).toBe(true);
    fireEvent.mouseDown(backdrop!, { detail: 2 });
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.mouseDown(backdrop!, { detail: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps a closed secondary menu's hidden action out of the focus trap", () => {
    render(<Dialog titleId="menu-title" onClose={() => undefined}>
      <h2 id="menu-title">编辑班次</h2>
      <details><summary tabIndex={0}>其他操作</summary><button type="button">复制班次</button></details>
    </Dialog>);
    const summary = screen.getByText("其他操作");
    summary.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(summary);
  });
});

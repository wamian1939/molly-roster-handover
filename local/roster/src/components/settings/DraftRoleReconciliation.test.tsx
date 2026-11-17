import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DraftRoleReconciliation } from "./DraftRoleReconciliation";

describe("DraftRoleReconciliation", () => {
  const usage = [
    { id: "legacy", code: "qa-role", nameZh: "验收岗", isActive: true, shiftCount: 8, firstDate: "2026-09-07" },
    { id: "official", code: "trainer", nameZh: "带训", isActive: true, shiftCount: 1, firstDate: "2026-09-08" },
  ];

  it("shows only draft roles absent from the verified Evaluate catalog and links to their store/date", () => {
    render(<MemoryRouter><DraftRoleReconciliation storeId="hurstville" usage={usage} verifiedRoleIds={new Set(["official"])} /></MemoryRouter>);
    const details = screen.getByRole("group", { name: "待核对的历史草稿岗位" }) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("8 个班次");
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(true);
    expect(screen.getByText("验收岗")).toBeTruthy();
    expect(screen.queryByText("带训")).toBeNull();
    expect(screen.getByRole("link", { name: "查看 验收岗 最早的草稿班次" }).getAttribute("href")).toBe("/calendar?store=hurstville&view=timeGridWeek&date=2026-09-07");
  });

  it("does not show a warning when all draft roles match current formal jobs", () => {
    const { container } = render(<MemoryRouter><DraftRoleReconciliation storeId="hurstville" usage={usage} verifiedRoleIds={new Set(["legacy", "official"])} /></MemoryRouter>);
    expect(container.innerHTML).toBe("");
  });

  it("shows a retryable error when the usage inventory is unavailable", () => {
    const onRetry = vi.fn();
    render(<MemoryRouter><DraftRoleReconciliation storeId="hurstville" usage={[]} verifiedRoleIds={new Set()} error="服务暂不可用" onRetry={onRetry} /></MemoryRouter>);
    expect(screen.getByRole("alert").textContent).toContain("服务暂不可用");
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

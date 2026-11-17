import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RepeatPreview } from "../../services/rosterRepository";
import type { Shift } from "../../types/roster";
import { RepeatShiftDialog } from "./RepeatShiftDialog";

afterEach(cleanup);

const source = { id: "source-shift", date: "2026-09-28" } as Shift;
const preview: RepeatPreview = {
  policy: "ALL_OR_NOTHING", shiftCount: 4, readyShifts: 3, availableAssignments: 3, blockedAssignments: 1,
  issues: [{ shiftDate: "2026-10-12", employeeId: "employee-1", employeeName: "Alex", code: "EMPLOYEE_UNAVAILABLE", severity: "BLOCKING_ERROR", reason: "目标时间不在可用时段内" }],
  canCopy: false, targetDates: ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"],
  sourcePeriodVersion: 2, targetPeriodVersions: [],
};

describe("RepeatShiftDialog", () => {
  it("invalidates a copyable preview after the server rejects Generate", async () => {
    const user = userEvent.setup();
    const copyable = { ...preview, canCopy: true, readyShifts: 4, blockedAssignments: 0, issues: [] };
    const onConfirm = vi.fn().mockResolvedValue(false);
    render(<RepeatShiftDialog source={source} saving={false} onClose={vi.fn()}
      onPreview={vi.fn().mockResolvedValue(copyable)} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "检查冲突" }));
    expect((screen.getByRole("button", { name: "生成草稿" }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "生成草稿" }));
    expect(onConfirm).toHaveBeenCalledWith(copyable);
    expect((screen.getByRole("button", { name: "生成草稿" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/可创建 4\/4 个班次/)).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("请重新检查冲突");
    expect((screen.getByLabelText("重复至") as HTMLInputElement).value).toBe("2026-10-26");
  });

  it("previews weekly dates and blocks an unavailable employee before any write", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onConfirm = vi.fn();
    render(<RepeatShiftDialog source={source} saving={false} onClose={vi.fn()} onPreview={onPreview} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "检查冲突" }));
    expect(onPreview).toHaveBeenCalledWith(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    expect((await screen.findByRole("alert")).textContent).toContain("Alex");
    expect((screen.getByRole("button", { name: "生成草稿" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses a date changed by the native input event in the preview", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue(preview);
    render(<RepeatShiftDialog source={source} saving={false} onClose={vi.fn()} onPreview={onPreview} onConfirm={vi.fn()} />);
    fireEvent.input(screen.getByLabelText("重复至"), { target: { value: "2026-10-12" } });
    await user.click(screen.getByRole("button", { name: "检查冲突" }));
    expect(onPreview).toHaveBeenCalledWith(["2026-10-05", "2026-10-12"]);
  });

  it("discards a preview when the repeat dates change before its response", async () => {
    let resolvePreview!: (value: RepeatPreview) => void;
    const onPreview = vi.fn(() => new Promise<RepeatPreview>((resolve) => { resolvePreview = resolve; }));
    const onConfirm = vi.fn();
    render(<RepeatShiftDialog source={source} saving={false} onClose={vi.fn()} onPreview={onPreview} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "检查冲突" }));
    expect(onPreview).toHaveBeenCalledOnce();
    fireEvent.input(screen.getByLabelText("重复至"), { target: { value: "2026-10-12" } });
    await act(async () => { resolvePreview({ ...preview, canCopy: true, issues: [], readyShifts: 4 }); });
    expect(screen.queryByText(/可创建 4\/4 个班次/)).toBeNull();
    expect((screen.getByRole("button", { name: "生成草稿" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "生成草稿" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PresetTimeSlotScriptDialog } from "./PresetTimeSlotScriptDialog";
import type { RosterEmployee } from "../../types/workforce";
import { ApiRequestError } from "../../lib/apiClient";

const services = vi.hoisted(() => ({ shortcuts: vi.fn(), preview: vi.fn(), commit: vi.fn() }));

vi.mock("react-router-dom", () => ({ Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a> }));

vi.mock("../../services/rosterRepository", () => ({ rosterRepository: {
  presetShortcuts: services.shortcuts,
  previewPresetScript: services.preview,
  commitPresetScript: services.commit,
} }));

beforeEach(() => {
  vi.clearAllMocks();
  services.shortcuts.mockResolvedValue({ configuration: { version: 1, shortcuts: [{ code: "AA", startTime: "10:00", endTime: "22:00" }] } });
});
afterEach(() => cleanup());

describe("Preset Time Slot Script observed tab workflow", () => {
  it("restores the selected week when the Staff page reopens the dialog", async () => {
    let rememberedWeek: "CURRENT" | "NEXT" = "NEXT";
    const props = { storeId: "store-1", employees: [], onClose: vi.fn(), onCommitted: vi.fn() };
    const first = render(<PresetTimeSlotScriptDialog {...props} initialWeek={rememberedWeek}
      onWeekChange={(nextWeek) => { rememberedWeek = nextWeek; }} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    fireEvent.click(screen.getByRole("switch", { name: "Next Week" }));
    expect(rememberedWeek).toBe("CURRENT");
    first.unmount();
    render(<PresetTimeSlotScriptDialog {...props} initialWeek={rememberedWeek}
      onWeekChange={(nextWeek) => { rememberedWeek = nextWeek; }} />);
    expect(screen.getByRole("switch", { name: "Next Week" }).getAttribute("aria-checked")).toBe("false");
  });

  it("opens a separate blank New draft without shortcut editing", async () => {
    render(<PresetTimeSlotScriptDialog storeId="store-1" employees={[]} onClose={vi.fn()} onCommitted={vi.fn()} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    expect(screen.queryByText("Shortcuts & Rules")).toBeNull();
    expect(screen.queryByRole("tab", { name: "Edit Script" })).toBeNull();
    expect(screen.getByRole("tablist", { name: "脚本操作" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "Alex\t1AA" } });
    fireEvent.click(screen.getByRole("tab", { name: "New: Time Slot Script" }));
    expect((screen.getByLabelText("Script", { exact: true }) as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("button", { name: /确认追加/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: /^Time Slot Script$/ }));
    expect((screen.getByLabelText("Script", { exact: true }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByLabelText("快捷码 1")).toBeNull();
    expect(services.preview).not.toHaveBeenCalled();
    expect(services.commit).not.toHaveBeenCalled();
  });

  it("previews both script tabs by employee name and accepts joined codes", async () => {
    services.preview.mockResolvedValue({ slots: [], issues: [], summary: { create: 0, unchanged: 0, conflict: 0 }, canCommit: false });
    render(<PresetTimeSlotScriptDialog storeId="store-1" employees={[]} onClose={vi.fn()} onCommitted={vi.fn()} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    fireEvent.click(screen.getByRole("tab", { name: "New: Time Slot Script" }));
    const nextWeek = screen.getByRole("switch", { name: "Next Week" });
    expect(nextWeek.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(nextWeek);
    expect(nextWeek.getAttribute("aria-checked")).toBe("false");
    expect((screen.getByLabelText("Script", { exact: true }) as HTMLTextAreaElement).placeholder).toContain("HandoverEmployee006 1AA2AA34567AA");
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "HandoverEmployee006 1AA2AA34567AA" } });
    fireEvent.click(screen.getByRole("button", { name: "转换脚本预览" }));
    await waitFor(() => expect(services.preview).toHaveBeenCalledWith(expect.objectContaining({
      script: "HandoverEmployee006 1AA2AA34567AA",
      week: "CURRENT",
    })));
    fireEvent.click(screen.getByRole("tab", { name: /^Time Slot Script$/ }));
    expect(nextWeek.getAttribute("aria-checked")).toBe("false");
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "HandoverEmployee006\t1AA" } });
    fireEvent.click(screen.getByRole("button", { name: "转换脚本预览" }));
    await waitFor(() => expect(services.preview).toHaveBeenCalledWith(expect.objectContaining({
      script: "HandoverEmployee006\t1AA",
      week: "CURRENT",
    })));
    expect(services.preview.mock.calls.at(-1)?.[0].script).toBe("HandoverEmployee006\t1AA");
  });

  it("limits an ambiguous name's mapping choices to employees with that name", async () => {
    services.preview.mockResolvedValue({ slots: [], issues: [{ line: 1, code: "AMBIGUOUS_EMPLOYEE", nickname: "HandoverEmployee006", message: "员工昵称不唯一" }],
      summary: { create: 0, unchanged: 0, conflict: 1 }, canCommit: false });
    const employees = [
      { id: "one", displayName: "HandoverEmployee006", storeId: "store-1", isActive: true },
      { id: "two", displayName: "HandoverEmployee006", storeId: "store-1", isActive: true },
      { id: "other", displayName: "Cindy", storeId: "store-1", isActive: true },
    ] as RosterEmployee[];
    render(<PresetTimeSlotScriptDialog storeId="store-1" employees={employees} onClose={vi.fn()} onCommitted={vi.fn()} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "HandoverEmployee006 1AA" } });
    fireEvent.click(screen.getByRole("button", { name: "转换脚本预览" }));
    const picker = await screen.findByRole("combobox", { name: "HandoverEmployee006 对应员工" });
    expect(picker.querySelectorAll("option")).toHaveLength(3);
    expect(picker.textContent).toContain("HandoverEmployee006");
    expect(picker.textContent).toContain("HandoverEmployee006 · one");
    expect(picker.textContent).toContain("HandoverEmployee006 · two");
    expect(picker.textContent).not.toContain("Cindy");
  });

  it("keeps internal IDs out of ordinary name choices", async () => {
    services.preview.mockResolvedValue({ slots: [], issues: [{ line: 1, code: "UNKNOWN_EMPLOYEE", nickname: "Tea Nickname", message: "找不到员工姓名" }],
      summary: { create: 0, unchanged: 0, conflict: 1 }, canCommit: false });
    const employees = [
      { id: "canonical-HandoverEmployee006", displayName: "HandoverEmployee006", storeId: "store-1", isActive: true },
      { id: "canonical-cindy", displayName: "Cindy", storeId: "store-1", isActive: true },
    ] as RosterEmployee[];
    render(<PresetTimeSlotScriptDialog storeId="store-1" employees={employees} onClose={vi.fn()} onCommitted={vi.fn()} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "Tea Nickname1AA" } });
    fireEvent.click(screen.getByRole("button", { name: "转换脚本预览" }));
    const picker = await screen.findByRole("combobox", { name: "Tea Nickname 对应员工" });
    expect([...picker.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "请选择当前门店员工", "HandoverEmployee006", "Cindy",
    ]);
    expect([...picker.querySelectorAll("option")].map((option) => option.value)).toEqual([
      "", "canonical-HandoverEmployee006", "canonical-cindy",
    ]);
  });

  it("explains that a valid candidate is not partially saved when another day conflicts", async () => {
    services.preview.mockResolvedValue({ weekStart: "2026-10-26", timezone: "Australia/Sydney", slots: [
      { employeeId: "HandoverEmployee006", employeeName: "HandoverEmployee006", date: "2026-10-26", startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z", shortcut: "AA", status: "CREATE" },
      { employeeId: "HandoverEmployee006", employeeName: "HandoverEmployee006", date: "2026-10-27", startAt: "2026-10-26T23:00:00.000Z", endAt: "2026-10-27T11:00:00.000Z", shortcut: "AA", status: "CONFLICT" },
      { employeeId: "HandoverEmployee006", employeeName: "HandoverEmployee006", date: "2026-10-27", startAt: "2026-10-26T23:00:00.000Z", endAt: "2026-10-27T06:00:00.000Z", shortcut: "BB", status: "CONFLICT" },
    ], issues: [{ line: 1, code: "DUPLICATE_DAY", message: "HandoverEmployee006 2026-10-27 在同次导入中出现多个时段" }],
    summary: { create: 1, unchanged: 0, conflict: 2 }, canCommit: false });
    render(<PresetTimeSlotScriptDialog storeId="store-1" employees={[]} onClose={vi.fn()} onCommitted={vi.fn()} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "HandoverEmployee006\t12AA 2BB" } });
    fireEvent.click(screen.getByRole("button", { name: "转换脚本预览" }));
    expect(await screen.findByText("候选新增 1 · 不变 0 · 冲突 2")).toBeTruthy();
    expect(screen.getByText("存在冲突或错误，本次导入不会写入任何记录；请修正脚本后重新转换。")).toBeTruthy();
    expect((screen.getByRole("button", { name: "请先修正冲突" }) as HTMLButtonElement).disabled).toBe(true);
    expect(services.commit).not.toHaveBeenCalled();
  });

  it("reconciles an unreadable successful import through the idempotent commit route", async () => {
    const onCommitted = vi.fn();
    services.preview.mockResolvedValue({ weekStart: "2026-10-26", timezone: "Australia/Sydney",
      slots: [{ employeeId: "HandoverEmployee006", employeeName: "HandoverEmployee006", date: "2026-10-26",
        startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z", shortcut: "AA", status: "CREATE" }],
      issues: [], summary: { create: 1, unchanged: 0, conflict: 0 }, slotStatusHash: "review-hash",
      previewHash: "preview-hash", canCommit: true });
    services.commit.mockRejectedValueOnce(new ApiRequestError("保存结果尚未确认", 0))
      .mockResolvedValueOnce({ importId: "import-1", alreadyImported: true, created: 1, unchanged: 0 });
    render(<PresetTimeSlotScriptDialog storeId="store-1" employees={[]} onClose={vi.fn()} onCommitted={onCommitted} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "HandoverEmployee006 1AA" } });
    fireEvent.click(screen.getByRole("button", { name: "转换脚本预览" }));
    await screen.findByText("候选新增 1 · 不变 0 · 冲突 0");
    fireEvent.click(screen.getByRole("button", { name: "确认追加 1 条" }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledWith({ importId: "import-1", alreadyImported: true, created: 1, unchanged: 0 }));
    expect(services.commit).toHaveBeenCalledTimes(2);
    expect(services.commit.mock.calls[1]?.[0]).toEqual(services.commit.mock.calls[0]?.[0]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("states that import outcome is unknown when both commit responses are lost", async () => {
    const onCommitted = vi.fn();
    services.preview.mockResolvedValue({ weekStart: "2026-10-26", timezone: "Australia/Sydney",
      slots: [{ employeeId: "HandoverEmployee006", employeeName: "HandoverEmployee006", date: "2026-10-26",
        startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z", shortcut: "AA", status: "CREATE" }],
      issues: [], summary: { create: 1, unchanged: 0, conflict: 0 }, slotStatusHash: "review-hash",
      previewHash: "preview-hash", canCommit: true });
    services.commit.mockRejectedValue(new ApiRequestError("保存结果尚未确认", 0));
    render(<PresetTimeSlotScriptDialog storeId="store-1" employees={[]} onClose={vi.fn()} onCommitted={onCommitted} />);
    await waitFor(() => expect(services.shortcuts).toHaveBeenCalledWith("store-1"));
    fireEvent.change(screen.getByLabelText("Script", { exact: true }), { target: { value: "HandoverEmployee006 1AA" } });
    fireEvent.click(screen.getByRole("button", { name: "转换脚本预览" }));
    await screen.findByText("候选新增 1 · 不变 0 · 冲突 0");
    fireEvent.click(screen.getByRole("button", { name: "确认追加 1 条" }));
    expect((await screen.findByRole("alert")).textContent).toContain("导入结果仍未确认");
    expect((screen.getByLabelText("Script", { exact: true }) as HTMLTextAreaElement).value).toBe("HandoverEmployee006 1AA");
    expect((screen.getByRole("button", { name: /确认追加/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(services.commit).toHaveBeenCalledTimes(2);
  });
});

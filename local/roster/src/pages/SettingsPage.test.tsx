import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterStoreSettings } from "../types/roster";
import { SettingsPage } from "./SettingsPage";

const services = vi.hoisted(() => ({
  storeId: "store-a", forceRerender: () => {},
  user: { role: "ADMIN", storeIds: ["store-a", "store-b"] },
  toast: vi.fn(), stores: vi.fn(), skillDefinitions: vi.fn(), jobs: vi.fn(), employees: vi.fn(), settings: vi.fn(), roles: vi.fn(), draftRoleUsage: vi.fn(), saveSettings: vi.fn(), createRole: vi.fn(), updateRole: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: services.user }) }));
vi.mock("../store/StoreContext", () => ({ useStoreSelection: () => ({ selectedStoreId: services.storeId,
  setSelectedStoreId: (id: string) => { services.storeId = id; services.forceRerender(); }, initializeStoreId: vi.fn() }) }));
vi.mock("../services/workforceRepository", () => ({ workforceRepository: { stores: services.stores, skillDefinitions: services.skillDefinitions, jobs: services.jobs, employees: services.employees } }));
vi.mock("../services/rosterRepository", () => ({ rosterRepository: { settings: services.settings, roles: services.roles, draftRoleUsage: services.draftRoleUsage, saveSettings: services.saveSettings, createRole: services.createRole, updateRole: services.updateRole } }));
vi.mock("../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: services.toast }) }));
vi.mock("../components/settings/SkillRequirementPicker", () => ({ SkillRequirementPicker: () => <div /> }));
vi.mock("../components/settings/DraftRoleReconciliation", () => ({ DraftRoleReconciliation: ({ usage, error, onRetry }: { usage: Array<{ nameZh: string }>; error: string | null; onRetry: () => void }) => <div data-testid="draft-role-usage">{error ?? usage.map((item) => item.nameZh).join(",")}{error ? <button type="button" onClick={onRetry}>重新读取</button> : null}</div> }));
vi.mock("../components/settings/PresetShortcutSettings", () => ({ PresetShortcutSettings: () => null }));
vi.mock("../components/ui/AppSelect", () => ({ AppSelect: ({ label, onValueChange }: { label: string; onValueChange: (value: string) => void }) => label === "门店"
  ? <button type="button" onClick={() => onValueChange("store-b")}>切换门店</button> : <span>{label}</span> }));

const settings = (storeId: string, openingTime: string): RosterStoreSettings => ({ storeId, timezone: "Australia/Sydney", openingTime,
  closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1,
  cycleType: "WEEK", fortnightAnchorDate: null, weeklyHourWarning: 38, dailyHourWarning: 10, version: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  services.storeId = "store-a";
  services.user.role = "ADMIN";
  services.stores.mockResolvedValue({ stores: [{ id: "store-a", name: "A", isActive: true }, { id: "store-b", name: "B", isActive: true }] });
  services.skillDefinitions.mockResolvedValue({ skills: [] });
  services.jobs.mockResolvedValue({ jobs: [] });
  services.employees.mockResolvedValue({ employees: [] });
  services.roles.mockResolvedValue([]);
  services.draftRoleUsage.mockResolvedValue([]);
  services.saveSettings.mockImplementation(async (_storeId: string, input: RosterStoreSettings) => ({
    ...input, fortnightAnchorDate: input.cycleType === "FORTNIGHT" ? input.fortnightAnchorDate ?? null : null,
    version: (input.version ?? 0) + 1,
  }));
  services.createRole.mockResolvedValue({});
  services.updateRole.mockResolvedValue({});
});
afterEach(cleanup);

describe("Settings store scope", () => {
  it.each([{}, { settings: { storeId: "store-a" } }, { settings: { ...settings("store-a", "08:00"), version: undefined } }])("keeps settings read-only for an incomplete successful response", async (response) => {
    services.settings.mockResolvedValue(response);
    render(<SettingsPage />);
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "设置加载失败" })));
    const save = screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(services.saveSettings).not.toHaveBeenCalled();
  });

  it("allows creating settings only when the response explicitly reports no saved settings", async () => {
    services.settings.mockResolvedValue({ settings: null });
    render(<SettingsPage />);
    await waitFor(() => expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("loads a valid Tuesday-start setting accepted by the backend", async () => {
    services.settings.mockResolvedValue({ settings: { ...settings("store-a", "08:00"), weekStartsOn: 2 } });
    render(<SettingsPage />);
    await waitFor(() => expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00");
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "设置加载失败" }));
  });

  it.each([settings("store-b", "07:30"), { storeId: "store-a", openingTime: "07:30" }])(
    "does not claim a settings save succeeded when its response cannot confirm the current store",
    async (response) => {
      services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
      services.saveSettings.mockResolvedValue(response);
      render(<SettingsPage />);
      await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
      fireEvent.change(screen.getByLabelText("营业开始"), { target: { value: "07:30" } });
      fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
      await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "保存结果未确认" })));
      expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "门店设置已保存" }));
      expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("07:30");
    },
  );

  it.each([
    { name: "the previous field value", response: { ...settings("store-a", "08:00"), version: 2 } },
    { name: "the previous version", response: { ...settings("store-a", "07:30"), version: 1 } },
  ])("does not confirm a save returning $name", async ({ response }) => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.saveSettings.mockResolvedValue(response);
    render(<SettingsPage />);
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    fireEvent.change(screen.getByLabelText("营业开始"), { target: { value: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "保存结果未确认" })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "门店设置已保存" }));
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("07:30");
  });

  it("shows the Evaluate job color without offering a local color editor", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "formal-job", storeId: "store-a", code: "cashier",
      name: "Cashier", colorToken: "rose", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([{ id: "role-cashier", storeId: "store-a", code: "cashier", nameZh: "Cashier",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 }]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getAllByText("Cashier").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /save color/i })).toBeNull();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(document.querySelector('span[style*="background-color: rgb(159, 18, 57)"]')).toBeTruthy();
    expect(services.updateRole).not.toHaveBeenCalled();
  });

  it("explains why a role with draft Shifts cannot be deactivated", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "formal-job", storeId: "store-a", code: "draft-role", name: "Draft Role", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([{ id: "role-with-drafts", storeId: "store-a", code: "draft-role", nameZh: "Draft Role",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, version: 1 }]);
    services.draftRoleUsage.mockResolvedValue([{ id: "role-with-drafts", code: "draft-role", nameZh: "Draft Role",
      isActive: true, shiftCount: 2, firstDate: "2037-10-14" }]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("草稿班次使用中，请先改派再停用")).toBeTruthy());
    expect((screen.getByRole("button", { name: "停用" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers an explicit association when a legacy role only shares the formal job name", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier", name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([{ id: "global-cashier", storeId: null, code: "legacy-code", nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true }]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("选择关联")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("岗位名称"), { target: { value: "收银" } });
    fireEvent.change(screen.getByLabelText("代码"), { target: { value: "cashier" } });
    expect((screen.getByRole("button", { name: "关联正式岗位" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not mark a different formal job linked merely because its name is shared", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [
      { id: "job-one", storeId: "store-a", code: "role-one", name: "服务", displayOrder: 1, isActive: true },
      { id: "job-two", storeId: "store-a", code: "role-two", name: "服务", displayOrder: 2, isActive: true },
    ] });
    services.roles.mockResolvedValue([{ id: "role-one", storeId: "store-a", code: "role-one", nameZh: "服务",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, version: 1 }]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("已关联排班岗位")).toBeTruthy());
    expect(screen.getAllByText("已关联排班岗位")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "选择关联" })).toBeTruthy();
  });

  it("lets an admin reactivate a store role that still exactly matches an unclaimed Evaluate job", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier", name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([{ id: "inactive-cashier", storeId: "store-a", code: "cashier", nameZh: "收银",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: false, version: 2 }]);
    render(<SettingsPage />);
    const reactivate = await screen.findByRole("button", { name: "重新启用" });
    expect(services.roles).toHaveBeenCalledWith("store-a", { includeInactive: true });
    expect(screen.getByText("已停用，可在下方重新启用")).toBeTruthy();
    fireEvent.click(reactivate);
    await waitFor(() => expect(services.updateRole).toHaveBeenCalledWith("inactive-cashier", expect.objectContaining({
      storeId: "store-a", isActive: true, version: 2,
    })));
  });

  it("keeps the inactive role inventory admin-only", async () => {
    services.user.role = "STORE_EVALUATOR";
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    render(<SettingsPage />);
    await waitFor(() => expect(services.roles).toHaveBeenCalled());
    expect(services.roles).toHaveBeenCalledWith("store-a", { includeInactive: false });
  });

  it("does not offer a legacy role outside Evaluate's current formal catalog for reactivation", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier", name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([{ id: "old-qa", storeId: "store-a", code: "qa-role", nameZh: "验收岗",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: false, version: 2 }]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "选择关联" })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "重新启用" })).toBeNull();
    expect(screen.queryByText("验收岗")).toBeNull();
  });

  it("shows a conflicting inactive local role without offering a duplicate active association", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier", name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([
      { id: "global-cashier", storeId: null, code: "cashier", nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true },
      { id: "inactive-cashier", storeId: "store-a", code: "cashier", nameZh: "收银", colorToken: "#aabbcc", requiredSkillCodes: [], isActive: false, version: 2 },
    ]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("已有有效关联，无法重新启用")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "重新启用" })).toBeNull();
  });

  it("loads store rules while the auxiliary draft-role inventory is still pending", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.draftRoleUsage.mockImplementation(() => new Promise(() => {}));
    render(<SettingsPage />);
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the store settings editable when only draft role inventory fails", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.draftRoleUsage.mockRejectedValue(new Error("统计暂不可用"));
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId("draft-role-usage").textContent).toContain("统计暂不可用"));
    expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps Settings usable when draft-role usage returns an incomplete success body", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier",
      name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([{ id: "role-cashier", storeId: "store-a", code: "cashier", nameZh: "收银",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 }]);
    services.draftRoleUsage.mockResolvedValue({});
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId("draft-role-usage").textContent).toContain("响应不完整"));
    expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps store rules editable when the Evaluate job catalog fails", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockRejectedValue(new Error("Evaluate 岗位目录暂不可用"));
    render(<SettingsPage />);

    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "关联正式岗位" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("营业开始"), { target: { value: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
    await waitFor(() => expect(services.saveSettings).toHaveBeenCalledWith("store-a", expect.objectContaining({ openingTime: "07:30" })));
  });

  it("loads store rules while the Evaluate job catalog is still pending", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockImplementation(() => new Promise(() => {}));
    render(<SettingsPage />);

    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "关联正式岗位" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("retries only draft role inventory without replacing unsaved store settings", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.draftRoleUsage.mockRejectedValueOnce(new Error("统计暂不可用"))
      .mockResolvedValueOnce([{ id: "legacy", code: "qa-role", nameZh: "验收岗", isActive: true,
        shiftCount: 2, firstDate: "2026-09-07" }]);
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId("draft-role-usage").textContent).toContain("统计暂不可用"));
    fireEvent.change(screen.getByLabelText("营业开始"), { target: { value: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(screen.getByTestId("draft-role-usage").textContent).toContain("验收岗"));
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("07:30");
    expect(services.settings).toHaveBeenCalledOnce();
    expect(services.saveSettings).not.toHaveBeenCalled();
  });

  it("keeps unsaved store settings when a role change refreshes the role list", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier",
      name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([{ id: "role-cashier", storeId: "store-a", code: "cashier", nameZh: "收银",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 }]);
    services.updateRole.mockResolvedValue({ id: "role-cashier", storeId: "store-a", code: "cashier", nameZh: "收银",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: false, displayOrder: 0, version: 2 });
    render(<SettingsPage />);
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    fireEvent.change(screen.getByLabelText("营业开始"), { target: { value: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: "停用" }));
    await waitFor(() => expect(services.updateRole).toHaveBeenCalledOnce());
    await waitFor(() => expect(services.roles).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("07:30");
    expect(services.settings).toHaveBeenCalledOnce();
  });

  it("discards a late draft-role retry after switching stores", async () => {
    services.settings.mockImplementation(async (id: string) => ({ settings: settings(id, id === "store-a" ? "08:00" : "12:00") }));
    let resolveRetry!: (value: Array<{ id: string; nameZh: string }>) => void;
    let readsForA = 0;
    services.draftRoleUsage.mockImplementation((id: string) => {
      if (id === "store-b") return Promise.resolve([]);
      readsForA += 1;
      return readsForA === 1 ? Promise.reject(new Error("统计暂不可用"))
        : new Promise((resolve) => { resolveRetry = resolve; });
    });
    const view = render(<SettingsPage />);
    services.forceRerender = () => view.rerender(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId("draft-role-usage").textContent).toContain("统计暂不可用"));
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    await waitFor(() => expect(readsForA).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00"));
    await act(async () => { resolveRetry([{ id: "old-a", nameZh: "验收岗" }]); });
    expect(screen.getByTestId("draft-role-usage").textContent).not.toContain("验收岗");
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00");
  });

  it("blocks a cross-store save before the new store loads and ignores a late old-store response", async () => {
    let resolveA!: (value: { settings: RosterStoreSettings }) => void;
    let resolveB!: (value: { settings: RosterStoreSettings }) => void;
    services.settings.mockImplementation((storeId: string) => new Promise((resolve) => {
      if (storeId === "store-a") resolveA = resolve;
      else resolveB = resolve;
    }));
    const view = render(<SettingsPage />);
    services.forceRerender = () => view.rerender(<SettingsPage />);
    await waitFor(() => expect(services.settings).toHaveBeenCalledWith("store-a"));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect(services.settings).toHaveBeenCalledWith("store-b"));
    const save = screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(services.saveSettings).not.toHaveBeenCalled();
    await act(async () => { resolveB({ settings: settings("store-b", "12:00") }); });
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00");
    await act(async () => { resolveA({ settings: settings("store-a", "06:00") }); });
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00");
    fireEvent.click(save);
    await waitFor(() => expect(services.saveSettings).toHaveBeenCalledWith("store-b", expect.objectContaining({ storeId: "store-b", openingTime: "12:00" })));
  });

  it("does not restore a previous store when its save finishes after switching stores", async () => {
    services.settings.mockImplementation(async (storeId: string) => ({ settings: settings(storeId, storeId === "store-a" ? "08:00" : "12:00") }));
    let resolveSave!: (value: RosterStoreSettings) => void;
    services.saveSettings.mockImplementation(() => new Promise<RosterStoreSettings>((resolve) => { resolveSave = resolve; }));
    const view = render(<SettingsPage />);
    services.forceRerender = () => view.rerender(<SettingsPage />);
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    const save = screen.getByRole("button", { name: "保存规则" });
    fireEvent.click(save);
    await waitFor(() => expect(services.saveSettings).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00"));
    await act(async () => { resolveSave(settings("store-a", "07:00")); });
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00");
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "门店设置已保存" }));
  });

  it("saves Store B independently while Store A is pending and keeps B locked until its own response", async () => {
    services.settings.mockImplementation(async (id: string) => ({ settings: settings(id, id === "store-a" ? "08:00" : "12:00") }));
    let resolveA!: (value: RosterStoreSettings) => void;
    let resolveB!: (value: RosterStoreSettings) => void;
    services.saveSettings.mockImplementation((id: string) => new Promise<RosterStoreSettings>((resolve) => {
      if (id === "store-a") resolveA = resolve;
      else resolveB = resolve;
    }));
    const view = render(<SettingsPage />);
    services.forceRerender = () => view.rerender(<SettingsPage />);
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
    await waitFor(() => expect(services.saveSettings).toHaveBeenCalledWith("store-a", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00"));
    const saveB = screen.getByRole("button", { name: /保存规则|正在保存/ }) as HTMLButtonElement;
    expect(saveB.disabled).toBe(false);
    fireEvent.click(saveB);
    await waitFor(() => expect(services.saveSettings).toHaveBeenCalledWith("store-b", expect.objectContaining({ storeId: "store-b" })));
    await act(async () => { resolveA(settings("store-a", "08:00")); });
    expect((screen.getByRole("button", { name: /保存规则|正在保存/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveB(settings("store-b", "12:00")); });
    expect((screen.getByRole("button", { name: "保存规则" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("refreshes Store A after returning while its earlier save was pending", async () => {
    let persistedA = "08:00";
    services.settings.mockImplementation(async (id: string) => ({ settings: settings(id, id === "store-a" ? persistedA : "12:00") }));
    let resolveA!: (value: RosterStoreSettings) => void;
    services.saveSettings.mockImplementation(() => new Promise<RosterStoreSettings>((resolve) => { resolveA = resolve; }));
    const view = render(<SettingsPage />);
    services.forceRerender = () => view.rerender(<SettingsPage />);
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00"));
    fireEvent.change(screen.getByLabelText("营业开始"), { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
    await waitFor(() => expect(services.saveSettings).toHaveBeenCalledWith("store-a", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("12:00"));
    await act(async () => { services.storeId = "store-a"; services.forceRerender(); });
    await waitFor(() => expect(services.settings).toHaveBeenCalledTimes(3));
    expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("08:00");
    persistedA = "07:00";
    await act(async () => { resolveA({ ...settings("store-a", "07:00"), version: 2 }); });
    await waitFor(() => expect((screen.getByLabelText("营业开始") as HTMLInputElement).value).toBe("07:00"));
  });

  it("allows Store B role updates while Store A role update is pending", async () => {
    services.settings.mockImplementation(async (id: string) => ({ settings: settings(id, "08:00") }));
    services.jobs.mockImplementation(async (id: string) => ({ jobs: [{ id: `job-${id}`, storeId: id,
      code: `role-${id}`, name: `岗位 ${id}`, displayOrder: 1, isActive: true }] }));
    services.roles.mockImplementation(async (id: string) => [{ id: `role-${id}`, storeId: id,
      code: `role-${id}`, nameZh: `岗位 ${id}`, colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, version: 1 }]);
    let resolveA!: (value: unknown) => void;
    let resolveB!: (value: unknown) => void;
    services.updateRole.mockImplementation((roleId: string) => new Promise((resolve) => {
      if (roleId === "role-store-a") resolveA = resolve;
      else resolveB = resolve;
    }));
    const view = render(<SettingsPage />);
    services.forceRerender = () => view.rerender(<SettingsPage />);
    const stopA = await screen.findByRole("button", { name: "停用" });
    fireEvent.click(stopA);
    await waitFor(() => expect(services.updateRole).toHaveBeenCalledWith("role-store-a", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    const stopB = await screen.findByRole("button", { name: "停用" });
    expect((stopB as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stopB);
    await waitFor(() => expect(services.updateRole).toHaveBeenCalledWith("role-store-b", expect.anything()));
    await act(async () => { resolveA({}); });
    expect((screen.getByRole("button", { name: "正在更新" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveB({}); });
    await waitFor(() => expect((screen.getByRole("button", { name: "停用" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows a committed role deactivation when the following list refresh fails", async () => {
    const role = { id: "role-cashier", storeId: "store-a", code: "cashier", nameZh: "收银",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 };
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier",
      name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValueOnce([role]).mockRejectedValueOnce(new Error("刷新暂不可用"));
    services.updateRole.mockResolvedValue({ ...role, isActive: false, version: 2 });
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "停用" }));
    await waitFor(() => expect(services.updateRole).toHaveBeenCalledOnce());
    await waitFor(() => expect(services.roles).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "停用" })).toBeNull();
    expect(screen.getByRole("button", { name: "重新启用" })).toBeTruthy();
  });

  it("shows a committed role association when the following list refresh fails", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier",
      name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("刷新暂不可用"));
    services.createRole.mockResolvedValue({ id: "role-cashier", storeId: "store-a", code: "cashier",
      nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 });
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "选择关联" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("岗位名称"), { target: { value: "收银" } });
    fireEvent.change(screen.getByLabelText("代码"), { target: { value: "cashier" } });
    fireEvent.click(screen.getByRole("button", { name: "关联正式岗位" }));
    await waitFor(() => expect(services.createRole).toHaveBeenCalledOnce());
    await waitFor(() => expect(services.roles).toHaveBeenCalledTimes(2));
    expect(screen.getByText("已关联排班岗位")).toBeTruthy();
  });

  it("keeps a newly edited association draft when an earlier create finishes", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [
      { id: "job-cashier", storeId: "store-a", code: "cashier", name: "收银", displayOrder: 1, isActive: true },
      { id: "job-barista", storeId: "store-a", code: "barista", name: "调饮", displayOrder: 2, isActive: true },
    ] });
    let resolveCreate!: (value: unknown) => void;
    services.createRole.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "选择关联" })).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("岗位名称"), { target: { value: "收银" } });
    fireEvent.change(screen.getByLabelText("代码"), { target: { value: "cashier" } });
    fireEvent.click(screen.getByRole("button", { name: "关联正式岗位" }));
    await waitFor(() => expect(services.createRole).toHaveBeenCalledWith(expect.objectContaining({ code: "cashier", nameZh: "收银" })));
    fireEvent.change(screen.getByLabelText("岗位名称"), { target: { value: "调饮" } });
    await act(async () => { resolveCreate({ id: "role-cashier", storeId: "store-a", code: "cashier", nameZh: "收银",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 }); });
    expect((screen.getByLabelText("岗位名称") as HTMLInputElement).value).toBe("调饮");
    expect((screen.getByLabelText("代码") as HTMLInputElement).value).toBe("cashier");
  });

  it("keeps an association draft when a successful create returns another store's role", async () => {
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier",
      name: "收银", displayOrder: 1, isActive: true }] });
    services.createRole.mockResolvedValue({ id: "foreign-role", storeId: "store-b", code: "cashier",
      nameZh: "收银", colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 });
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "选择关联" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("岗位名称"), { target: { value: "收银" } });
    fireEvent.change(screen.getByLabelText("代码"), { target: { value: "cashier" } });
    fireEvent.click(screen.getByRole("button", { name: "关联正式岗位" }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "岗位保存结果未确认" })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "岗位已创建" }));
    expect((screen.getByLabelText("岗位名称") as HTMLInputElement).value).toBe("收银");
    expect(services.roles).toHaveBeenCalledOnce();
  });

  it("does not claim deactivation when a successful update returns a different role", async () => {
    const role = { id: "role-cashier", storeId: "store-a", code: "cashier", nameZh: "收银",
      colorToken: "#2563eb", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 };
    services.settings.mockResolvedValue({ settings: settings("store-a", "08:00") });
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-cashier", storeId: "store-a", code: "cashier",
      name: "收银", displayOrder: 1, isActive: true }] });
    services.roles.mockResolvedValue([role]);
    services.updateRole.mockResolvedValue({ ...role, id: "other-role", isActive: false, version: 2 });
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "停用" }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "岗位保存结果未确认" })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "岗位已停用" }));
    expect(screen.getByRole("button", { name: "停用" })).toBeTruthy();
    expect(services.roles).toHaveBeenCalledOnce();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RosterEmployee } from "../types/workforce";
import type { AvailabilityDayDraft } from "../lib/availability";
import type { EmployeeAvailability } from "../types/roster";
import { ApiRequestError } from "../lib/apiClient";
import { StaffPage } from "./StaffPage";

const services = vi.hoisted(() => ({
  stores: vi.fn(), employees: vi.fn(), jobs: vi.fn(), availabilityTemplates: vi.fn(), createAvailabilityTemplate: vi.fn(), roles: vi.fn(), settings: vi.fn(), availability: vi.fn(), replaceAvailability: vi.fn(), calendar: vi.fn(), toast: vi.fn(), initializeStoreId: vi.fn(), setSelectedStoreId: vi.fn(), selectedStoreId: vi.fn(),
}));

vi.mock("../services/workforceRepository", () => ({ workforceRepository: { stores: services.stores, employees: services.employees, jobs: services.jobs } }));
vi.mock("../services/rosterRepository", () => ({ rosterRepository: { availabilityTemplates: services.availabilityTemplates, createAvailabilityTemplate: services.createAvailabilityTemplate, roles: services.roles, settings: services.settings, availability: services.availability, replaceAvailability: services.replaceAvailability, calendar: services.calendar } }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { role: "STORE_EVALUATOR", storeIds: ["store-1"] } }) }));
vi.mock("../store/StoreContext", () => ({ useStoreSelection: () => ({ selectedStoreId: services.selectedStoreId(), initializeStoreId: services.initializeStoreId, setSelectedStoreId: services.setSelectedStoreId }) }));
vi.mock("../components/ui/AppSelect", () => ({ AppSelect: ({ label, ariaLabel, options, value, onValueChange }: {
  label?: string; ariaLabel?: string; options?: { label: string; value: string }[]; value?: string; onValueChange?: (value: string) => void;
}) => <label>{label}<select aria-label={ariaLabel ?? label} value={value} onChange={(event) => onValueChange?.(event.target.value)}>{options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }));
vi.mock("../components/staff/AvailabilityEditor", () => ({ AvailabilityEditor: ({ days }: { days: AvailabilityDayDraft[] }) => <div data-testid="availability-editor">{JSON.stringify(days)}</div> }));
vi.mock("../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: services.toast }), InlineSpinner: () => <span /> }));

const envelope = (employees: RosterEmployee[]) => ({ contractVersion: "1.3.0", generatedAt: "2026-10-09T00:00:00.000Z", employees });
const settings = (storeId = "store-1") => ({ storeId, version: 1, timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30,
  minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", fortnightAnchorDate: null, weeklyHourWarning: 38, dailyHourWarning: 10 });

function employee(displayName: string, score: number): RosterEmployee {
  return {
    id: "employee-1", displayName, employeeType: "REGULAR", employmentType: "PartTime", storeId: "store-1", storeName: "Store 1", isActive: true,
    officialScore: { score, tier: score >= 85 ? "T1" : "T2", roundId: "round-1", closedAt: "2026-10-09T00:00:00.000Z" },
    positions: [{ id: "position-1", code: "water-bar", name: "Water Bar" }],
    skillSummary: { overallPercent: null, backOfHousePercent: null, waterBarPercent: null, frontOfHousePercent: null, qualifiedSkillCodes: [], skills: [], operations: { opening: "UNKNOWN", closing: "UNKNOWN", weeklyCleaning: "UNKNOWN" } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  services.selectedStoreId.mockReturnValue("store-1");
  services.stores.mockResolvedValue({ stores: [{ id: "store-1", name: "Store 1", isActive: true }] });
  services.availabilityTemplates.mockResolvedValue([]);
  services.createAvailabilityTemplate.mockResolvedValue({});
  services.roles.mockResolvedValue([]);
  services.jobs.mockResolvedValue({ jobs: [] });
  services.settings.mockImplementation((storeId: string) => Promise.resolve({ settings: settings(storeId) }));
  services.availability.mockResolvedValue([]);
  services.calendar.mockResolvedValue({ shifts: [] });
});

afterEach(() => cleanup());

describe("Staff current Evaluate workforce", () => {
  it("does not load or edit availability when a successful settings response is incomplete", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.settings.mockResolvedValue({ settings: { storeId: "store-1", timezone: "Australia/Sydney" } });
    render(<StaffPage />);

    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "门店设置加载失败" })));
    expect(services.availability).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "手动录入多日期" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not interpret availability in UTC before first-time store settings exist", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.settings.mockResolvedValue({ settings: null });
    render(<StaffPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("未确认时区");
    expect(services.availability).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "手动录入多日期" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("loads availability when the optional formal-job catalog fails", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.jobs.mockRejectedValue(new Error("岗位目录暂不可用"));
    render(<StaffPage />);

    await waitFor(() => expect(services.availability).toHaveBeenCalledWith("store-1", expect.any(String), expect.any(String), "employee-1"));
    await waitFor(() => expect((screen.getByRole("button", { name: "保存可用时间" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("loads availability while the optional template list is pending", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.availabilityTemplates.mockReturnValue(new Promise(() => {}));
    render(<StaffPage />);

    await waitFor(() => expect(services.availability).toHaveBeenCalledWith("store-1", expect.any(String), expect.any(String), "employee-1"));
    await waitFor(() => expect((screen.getByRole("button", { name: "保存可用时间" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("keeps a newly saved template when the initial template list resolves late", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    let resolveInitial!: (value: object[]) => void;
    services.availabilityTemplates.mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }))
      .mockResolvedValueOnce([{ id: "new-template", storeId: "store-1", name: "新模板", isActive: true, slots: [] }]);
    render(<StaffPage />);

    await waitFor(() => expect((screen.getByRole("button", { name: "营业时段可用" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "营业时段可用" }));
    fireEvent.change(screen.getByPlaceholderText("例如：上下午分段"), { target: { value: "新模板" } });
    fireEvent.click(screen.getByRole("button", { name: "保存为模板" }));
    await screen.findByRole("button", { name: "套用：新模板" });
    await act(async () => { resolveInitial([]); });
    expect(screen.getByRole("button", { name: "套用：新模板" })).toBeTruthy();
  });

  it("reports a saved template accurately when the follow-up list refresh fails", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.availabilityTemplates.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("列表暂不可用"));
    render(<StaffPage />);
    await screen.findByRole("button", { name: "营业时段可用" });
    await waitFor(() => expect((screen.getByRole("button", { name: "营业时段可用" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "营业时段可用" }));
    fireEvent.change(screen.getByPlaceholderText("例如：上下午分段"), { target: { value: "早晚班" } });
    fireEvent.click(screen.getByRole("button", { name: "保存为模板" }));
    await waitFor(() => expect(services.createAvailabilityTemplate).toHaveBeenCalledOnce());
    await waitFor(() => expect(services.availabilityTemplates).toHaveBeenCalledTimes(2));
    expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "可用时间模板已保存" }));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "模板保存失败" }));
  });
  it("allows a different store to save while the previous store's template request is pending", async () => {
    services.stores.mockResolvedValue({ stores: [
      { id: "store-1", name: "Store 1", isActive: true },
      { id: "store-2", name: "Store 2", isActive: true },
    ] });
    services.employees.mockImplementation((storeId: string) => Promise.resolve(envelope([
      { ...employee(storeId === "store-1" ? "Alex" : "Blair", 77.5),
        id: storeId === "store-1" ? "employee-1" : "employee-2", storeId },
    ])));
    let resolveFirst!: (value: object) => void;
    let resolveSecond!: (value: object) => void;
    services.createAvailabilityTemplate.mockImplementation(({ storeId }: { storeId: string }) => storeId === "store-1"
      ? new Promise((resolve) => { resolveFirst = resolve; })
      : new Promise((resolve) => { resolveSecond = resolve; }));
    const { rerender } = render(<StaffPage />);
    const preset = await screen.findByRole("button", { name: "营业时段可用" });
    await waitFor(() => expect((preset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(preset);
    fireEvent.change(screen.getByPlaceholderText("例如：上下午分段"), { target: { value: "A 店模板" } });
    fireEvent.click(screen.getByRole("button", { name: "保存为模板" }));
    await waitFor(() => expect(services.createAvailabilityTemplate).toHaveBeenCalledOnce());
    services.selectedStoreId.mockReturnValue("store-2");
    rerender(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Blair").length).toBeGreaterThan(0));
    await waitFor(() => expect((screen.getByRole("button", { name: "营业时段可用" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByPlaceholderText("例如：上下午分段") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "营业时段可用" }));
    fireEvent.change(screen.getByPlaceholderText("例如：上下午分段"), { target: { value: "B 店模板" } });
    expect((screen.getByRole("button", { name: "保存为模板" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "保存为模板" }));
    await waitFor(() => expect(services.createAvailabilityTemplate).toHaveBeenCalledTimes(2));
    await act(async () => { resolveFirst({}); });
    expect((screen.getByRole("button", { name: "保存为模板" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText("例如：上下午分段") as HTMLInputElement).value).toBe("B 店模板");
    expect(services.toast).not.toHaveBeenCalled();
    await act(async () => { resolveSecond({}); });
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "可用时间模板已保存" })));
  });
  it("does not let an earlier template refresh replace the list after returning to the same store", async () => {
    services.employees.mockImplementation((storeId: string) => Promise.resolve(envelope([{
      ...employee(storeId === "store-1" ? "Alex" : "Blair", 77.5),
      id: storeId === "store-1" ? "employee-1" : "employee-2", storeId,
    }])));
    let resolveOldRefresh!: (value: object[]) => void;
    let firstStoreReads = 0;
    services.availabilityTemplates.mockImplementation((storeId: string) => {
      if (storeId === "store-2") return Promise.resolve([]);
      firstStoreReads += 1;
      if (firstStoreReads === 1) return Promise.resolve([]);
      if (firstStoreReads === 2) return new Promise((resolve) => { resolveOldRefresh = resolve; });
      return Promise.resolve([{ id: "current", storeId, name: "最新模板", isActive: true, slots: [] }]);
    });
    const { rerender } = render(<StaffPage />);
    await waitFor(() => expect((screen.getByRole("button", { name: "营业时段可用" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "营业时段可用" }));
    fireEvent.change(screen.getByPlaceholderText("例如：上下午分段"), { target: { value: "刚保存的模板" } });
    fireEvent.click(screen.getByRole("button", { name: "保存为模板" }));
    await waitFor(() => expect(firstStoreReads).toBe(2));
    services.selectedStoreId.mockReturnValue("store-2");
    rerender(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Blair").length).toBeGreaterThan(0));
    services.selectedStoreId.mockReturnValue("store-1");
    rerender(<StaffPage />);
    await screen.findByRole("button", { name: "套用：最新模板" });
    await act(async () => { resolveOldRefresh([]); });
    expect(screen.getByRole("button", { name: "套用：最新模板" })).toBeTruthy();
  });
  it("colors an employee's formal job from Evaluate even without a scheduling role", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.jobs.mockResolvedValue({ jobs: [{ id: "position-1", storeId: "store-1", code: "water-bar",
      name: "Water Bar", colorToken: "teal", isActive: true, displayOrder: 1 }] });
    render(<StaffPage />);
    const badges = await screen.findAllByLabelText("正式岗位");
    await waitFor(() => expect(badges[0].querySelector(".staff-role-tag")?.getAttribute("style")).toContain("#115e59"));
    expect(badges[0].querySelector(".staff-role-tag--unmapped")).toBeNull();
  });
  it("does not request the previous store employee after switching stores", async () => {
    const first = employee("Alex", 77.5);
    const second = { ...employee("Blair", 81), id: "employee-2", storeId: "store-2", storeName: "Store 2" };
    services.stores.mockResolvedValue({ stores: [{ id: "store-1", name: "Store 1", isActive: true }, { id: "store-2", name: "Store 2", isActive: true }] });
    services.employees.mockImplementation((storeId: string) => Promise.resolve(envelope(storeId === "store-1" ? [first] : [second])));
    const { rerender } = render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Alex").length).toBeGreaterThan(0));
    await waitFor(() => expect(services.availability).toHaveBeenCalledWith("store-1", expect.any(String), expect.any(String), "employee-1"));
    services.selectedStoreId.mockReturnValue("store-2");
    rerender(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Blair").length).toBeGreaterThan(0));
    await waitFor(() => expect(services.availability).toHaveBeenCalledWith("store-2", expect.any(String), expect.any(String), "employee-2"));
    expect(services.availability.mock.calls.filter((call) => call[0] === "store-2" && call[3] === "employee-1")).toHaveLength(0);
    expect(screen.queryByText("该员工已不在当前门店，请选择其他员工")).toBeNull();
  });

  it("does not show a previous store's settings error after switching stores", async () => {
    services.employees.mockResolvedValue(envelope([]));
    let rejectFirstSettings!: (reason: Error) => void;
    services.settings.mockImplementation((storeId: string) => storeId === "store-1"
      ? new Promise((_resolve, reject) => { rejectFirstSettings = reject; })
      : Promise.resolve({ settings: settings(storeId) }));
    const { rerender } = render(<StaffPage />);
    await waitFor(() => expect(services.settings).toHaveBeenCalledWith("store-1"));
    services.selectedStoreId.mockReturnValue("store-2");
    rerender(<StaffPage />);
    await waitFor(() => expect(services.settings).toHaveBeenCalledWith("store-2"));
    await act(async () => { rejectFirstSettings(new Error("旧门店设置读取失败")); });
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "门店设置加载失败" }));
  });

  it("hides the previous store's availability templates while the next store loads", async () => {
    services.employees.mockImplementation((storeId: string) => Promise.resolve(envelope([
      { ...employee(storeId === "store-1" ? "Alex" : "Blair", 77.5), storeId },
    ])));
    services.availabilityTemplates.mockImplementation((storeId: string) => storeId === "store-1"
      ? Promise.resolve([{ id: "old-template", storeId, name: "旧门店模板", isActive: true, slots: [] }])
      : new Promise(() => {}));
    const { rerender } = render(<StaffPage />);
    await screen.findByRole("button", { name: "套用：旧门店模板" });
    services.selectedStoreId.mockReturnValue("store-2");
    rerender(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Blair").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "套用：旧门店模板" })).toBeNull();
  });

  it("filters by an employee's formal positions and shows only their assigned jobs", async () => {
    services.employees.mockResolvedValue(envelope([
      { ...employee("Alex", 77.5), positions: [{ id: "job-1", code: "water-bar", name: "水吧" }, { id: "job-2", code: "all", name: "全岗" }] },
      { ...employee("Blair", 81), id: "employee-2", positions: [{ id: "job-2", code: "all", name: "全岗" }] },
    ]));
    services.roles.mockResolvedValue([
      { id: "legacy", storeId: null, code: "qa-role", nameZh: "验收岗", colorToken: "#ff0000", requiredSkillCodes: [], isActive: true },
      { id: "formal", storeId: "store-1", code: "water-bar", nameZh: "旧水吧", colorToken: "#00ff00", requiredSkillCodes: [], isActive: true },
    ]);
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-1", storeId: "store-1", code: "water-bar", name: "水吧", colorToken: "teal", isActive: true, displayOrder: 1 }] });
    render(<StaffPage />);
    const positionFilter = await screen.findByRole("combobox", { name: "按正式岗位筛选" });
    await waitFor(() => expect(positionFilter.textContent).toContain("水吧"));
    expect(positionFilter.textContent).toContain("全岗");
    expect(positionFilter.textContent).not.toContain("验收岗");
    expect(screen.getAllByLabelText("正式岗位")[0].textContent).toContain("水吧");
    expect(screen.getAllByLabelText("正式岗位")[0].textContent).toContain("全岗");
    expect(screen.getAllByLabelText("正式岗位")[0].querySelector('.staff-role-tag')?.getAttribute("style")).toContain("#115e59");
    expect(document.body.textContent).not.toContain("技能匹配");
    expect(document.body.textContent).not.toContain("本周期已排");
    expect(document.body.textContent).not.toContain("不展示 HR");
    expect(document.body.textContent).not.toContain("前场技能");
    expect(services.calendar).not.toHaveBeenCalled();

    fireEvent.change(positionFilter, { target: { value: "job-1" } });
    await waitFor(() => expect(screen.getAllByText("Alex").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /^Blair/ })).toBeNull();
    fireEvent.change(positionFilter, { target: { value: "job-2" } });
    expect(screen.getByRole("button", { name: /^Blair/ })).toBeTruthy();
  });

  it("blocks a stale Availability retry and reloads the winning rows on request", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.replaceAvailability.mockRejectedValue(new ApiRequestError("可用时间已被其他人修改", 409, { code: "STALE_VERSION", severity: "BLOCKING_ERROR", message: "可用时间已被其他人修改" }));
    render(<StaffPage />);
    const save = await screen.findByRole("button", { name: "保存可用时间" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("其他管理员修改"));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(services.replaceAvailability).toHaveBeenCalledWith(expect.objectContaining({ expectedRows: [] }));
    fireEvent.click(save);
    expect(services.replaceAvailability).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "重新加载可用时间" }));
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/其他管理员修改/)).toBeNull();
  });

  it("holds an uncertain Availability save until the employee's rows are reloaded", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.replaceAvailability.mockRejectedValue(new ApiRequestError("保存结果尚未确认", 0));
    render(<StaffPage />);
    const save = await screen.findByRole("button", { name: "保存可用时间" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("上次保存结果尚未确认"));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "结果尚未确认" }));
    fireEvent.click(save);
    expect(services.replaceAvailability).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "重新加载可用时间" }));
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  });
  it("refreshes canonical name and official score without resetting the availability date", async () => {
    services.employees.mockResolvedValueOnce(envelope([employee("Alex", 77.5)])).mockResolvedValueOnce(envelope([employee("Alex Chen", 88)]));
    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Alex").length).toBeGreaterThan(0));
    expect(document.body.textContent).toContain("T2 / 77.5");
    const date = document.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.input(date, { target: { value: "2026-11-11" } });
    fireEvent.click(screen.getByRole("button", { name: "刷新员工资料" }));
    await waitFor(() => expect(screen.getAllByText("Alex Chen").length).toBeGreaterThan(0));
    expect(document.body.textContent).toContain("T1 / 88.0");
    expect(date.value).toBe("2026-11-11");
    expect(services.employees).toHaveBeenCalledTimes(2);
  });

  it("keeps unsaved availability edits when the current employee profile refreshes", async () => {
    services.employees.mockResolvedValueOnce(envelope([employee("Alex", 77.5)]))
      .mockResolvedValueOnce(envelope([employee("Alex Chen", 88)]));
    render(<StaffPage />);
    const preset = await screen.findByRole("button", { name: "营业时段可用" });
    await waitFor(() => expect((preset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(preset);
    const draftBefore = screen.getByTestId("availability-editor").textContent;
    expect(draftBefore).toContain('"status":"AVAILABLE"');
    expect(services.availability).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "刷新员工资料" }));
    await waitFor(() => expect(screen.getAllByText("Alex Chen").length).toBeGreaterThan(0));
    await waitFor(() => expect(services.employees).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("availability-editor").textContent).toBe(draftBefore);
    expect(services.availability).toHaveBeenCalledTimes(1);
  });

  it("marks stale data and blocks availability writes until a successful refresh removes a transferred employee", async () => {
    services.employees.mockResolvedValueOnce(envelope([employee("Alex", 77.5)])).mockRejectedValueOnce(new Error("Evaluate unavailable")).mockResolvedValueOnce(envelope([]));
    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Alex").length).toBeGreaterThan(0));
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Evaluate unavailable"));
    expect((screen.getByRole("button", { name: "保存可用时间" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "刷新员工资料" }));
    await waitFor(() => expect(screen.queryAllByText("Alex")).toHaveLength(0));
    expect(screen.getByText("该员工已不在当前门店，请选择其他员工")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(services.employees).toHaveBeenCalledTimes(3);
  });

  it("does not save the previous employee's draft after the new employee's Availability fails to load", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5), { ...employee("Blair", 81), id: "employee-2" }]));
    let failBlair = true;
    services.availability.mockImplementation((_store: string, _from: string, _to: string, employeeId: string) => employeeId === "employee-2" && failBlair
      ? Promise.reject(new Error("Availability unavailable")) : Promise.resolve([]));
    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Alex").length).toBeGreaterThan(0));
    const save = screen.getByRole("button", { name: "保存可用时间" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /^Blair/ }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "可用时间加载失败" })));
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
    expect(services.replaceAvailability).not.toHaveBeenCalled();
    failBlair = false;
    fireEvent.click(screen.getByRole("button", { name: "重试可用时间" }));
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("button", { name: "重试可用时间" })).toBeNull();
    expect(services.availability.mock.calls.filter((call) => call[3] === "employee-2")).toHaveLength(2);
  });

  it("fills the store's overnight opening hours instead of fixed daytime hours", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.settings.mockResolvedValue({ settings: { ...settings(), openingTime: "18:00", closingTime: "03:00" } });
    render(<StaffPage />);
    const preset = await screen.findByRole("button", { name: "营业时段可用" });
    await waitFor(() => expect((preset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(preset);
    const days = JSON.parse(screen.getByTestId("availability-editor").textContent ?? "[]") as AvailabilityDayDraft[];
    expect(days).toHaveLength(7);
    expect(days.every((day) => day.slots.length === 1 && day.slots[0].startTime === "18:00"
      && day.slots[0].endTime === "03:00" && day.slots[0].endNextDay)).toBe(true);
  });

  it("uses the store's Sunday week start for availability reads and saves", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    services.settings.mockResolvedValue({ settings: { ...settings(), weekStartsOn: 0 } });
    services.replaceAvailability.mockResolvedValue([]);
    render(<StaffPage />);
    fireEvent.change(await screen.findByLabelText("所在周期"), { target: { value: "2026-10-27" } });
    await waitFor(() => expect(services.availability).toHaveBeenCalledWith("store-1", "2026-10-25", "2026-10-31", "employee-1"));
    await waitFor(() => expect((screen.getByRole("button", { name: "保存可用时间" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "保存可用时间" }));
    await waitFor(() => expect(services.replaceAvailability).toHaveBeenCalledWith(expect.objectContaining({
      storeId: "store-1", employeeId: "employee-1", dates: [
        "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31",
      ],
    })));
  });

  it("keeps the new employee's draft when the previous employee's save resolves later", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5), { ...employee("Blair", 81), id: "employee-2" }]));
    services.availability.mockImplementation((_store: string, from: string, _to: string, employeeId: string) => Promise.resolve(employeeId === "employee-2" ? [{
      id: "b-row", storeId: "store-1", employeeId, date: from, status: "AVAILABLE", startAt: `${from}T01:00:00.000Z`, endAt: `${from}T05:00:00.000Z`, note: null, source: "MANUAL", version: 1,
    }] : []));
    let resolveSave!: (rows: EmployeeAvailability[]) => void;
    services.replaceAvailability.mockImplementation(() => new Promise<EmployeeAvailability[]>((resolve) => { resolveSave = resolve; }));
    render(<StaffPage />);
    await waitFor(() => expect(screen.getAllByText("Alex").length).toBeGreaterThan(0));
    const save = screen.getByRole("button", { name: "保存可用时间" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(services.replaceAvailability).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /^Blair/ }));
    await waitFor(() => expect(screen.getByTestId("availability-editor").textContent).toContain("b-row"));
    resolveSave([{
      id: "a-row", storeId: "store-1", employeeId: "employee-1", date: services.replaceAvailability.mock.calls[0][0].dates[0], status: "AVAILABLE",
      startAt: "2026-10-12T00:00:00.000Z", endAt: "2026-10-12T08:00:00.000Z", note: null, source: "MANUAL", version: 1,
    }]);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByTestId("availability-editor").textContent).toContain("b-row");
    expect(screen.getByTestId("availability-editor").textContent).not.toContain("a-row");
  });

  it("keeps edits made while a current employee's save response is pending", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5)]));
    let resolveSave!: (rows: EmployeeAvailability[]) => void;
    services.replaceAvailability.mockImplementation(() => new Promise<EmployeeAvailability[]>((resolve) => { resolveSave = resolve; }));
    render(<StaffPage />);
    const openingPreset = await screen.findByRole("button", { name: "营业时段可用" });
    await waitFor(() => expect((openingPreset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(openingPreset);
    fireEvent.click(screen.getByRole("button", { name: "保存可用时间" }));
    await waitFor(() => expect(services.replaceAvailability).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "标准可用" }));
    expect((JSON.parse(screen.getByTestId("availability-editor").textContent ?? "[]") as AvailabilityDayDraft[])[0]?.slots[0]?.endTime).toBe("17:00");
    const input = services.replaceAvailability.mock.calls[0][0] as {
      storeId: string; employeeId: string; entries: Array<{ date: string; status: "AVAILABLE"; startAt: string; endAt: string; source: "MANUAL" }>;
    };
    await act(async () => { resolveSave(input.entries.map((entry, index) => ({ ...entry,
      id: `saved-${index}`, storeId: input.storeId, employeeId: input.employeeId, note: null, version: 1,
    }))); });
    expect((JSON.parse(screen.getByTestId("availability-editor").textContent ?? "[]") as AvailabilityDayDraft[])[0]?.slots[0]?.endTime).toBe("17:00");
  });

  it("keeps reloaded rows when an earlier save resolves after returning to the same employee", async () => {
    services.employees.mockResolvedValue(envelope([employee("Alex", 77.5), { ...employee("Blair", 81), id: "employee-2" }]));
    let alexLoads = 0;
    services.availability.mockImplementation((_store: string, from: string, _to: string, employeeId: string) => {
      if (employeeId !== "employee-1" || ++alexLoads === 1) return Promise.resolve([]);
      return Promise.resolve([{
        id: "newer-row", storeId: "store-1", employeeId, date: from, status: "AVAILABLE",
        startAt: `${from}T01:00:00.000Z`, endAt: `${from}T05:00:00.000Z`, note: null, source: "MANUAL", version: 1,
      }]);
    });
    let resolveSave!: (rows: EmployeeAvailability[]) => void;
    services.replaceAvailability.mockImplementation(() => new Promise<EmployeeAvailability[]>((resolve) => { resolveSave = resolve; }));
    render(<StaffPage />);
    const save = await screen.findByRole("button", { name: "保存可用时间" });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(services.replaceAvailability).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /^Blair/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Alex/ }));
    await waitFor(() => expect(screen.getByTestId("availability-editor").textContent).toContain("newer-row"));
    resolveSave([]);
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByTestId("availability-editor").textContent).toContain("newer-row");
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "可用时间已保存" }));
  });
});

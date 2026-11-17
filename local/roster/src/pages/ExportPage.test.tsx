import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportPage } from "./ExportPage";
vi.mock('../components/payroll/PayrollPanel',()=>({PayrollPanel:()=>null}));

const services = vi.hoisted(() => ({
  stores: vi.fn(), settings: vi.fn(), periods: vi.fn(), publications: vi.fn(), publication: vi.fn(), toast: vi.fn(), initializeStoreId: vi.fn(), setSelectedStoreId: vi.fn(),
}));

vi.mock("../services/workforceRepository", () => ({ workforceRepository: { stores: services.stores } }));
vi.mock("../services/rosterRepository", () => ({ rosterRepository: { settings: services.settings, periods: services.periods, publications: services.publications, publication: services.publication } }));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { accountId: "qa-admin", role: "ADMIN", storeIds: ["store-1"] } }) }));
vi.mock("../store/StoreContext", () => ({ useStoreSelection: () => ({ selectedStoreId: "store-1", initializeStoreId: services.initializeStoreId, setSelectedStoreId: services.setSelectedStoreId }) }));
vi.mock("../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: services.toast }) }));
vi.mock("../components/ui/AppSelect", () => ({ AppSelect: ({ label, value, onValueChange, options }: { label: string; value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }> }) =>
  <label>{label}<select aria-label={label} value={value} onChange={(event) => onValueChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>,
}));

const year = new Date().getFullYear();
const period = (id: string, archiveYear: number, status: "DRAFT" | "PUBLISHED") => ({
  id, storeId: "store-1", startDate: `${archiveYear}-10-${status === "DRAFT" ? "05" : "12"}`,
  endDate: `${archiveYear}-10-${status === "DRAFT" ? "11" : "18"}`, cycleType: "WEEK", status, version: 1,
});
const publication = (id: string, archiveYear: number, periodId = "published-period") => ({
  id, rosterPeriodId: periodId, revisionNumber: 1, periodVersion: 1, publishedAt: `${archiveYear}-10-12T00:00:00.000Z`,
  publishedBy: { accountId: "qa-admin", displayName: "QA Admin" }, store: { id: "store-1", name: "Store 1" },
  period: period(periodId, archiveYear, "PUBLISHED"), shiftCount: 0, assignmentCount: 0, totalHours: 0,
});
const snapshotHeader = (archiveYear: number, periodId = "published-period") => ({ schemaVersion: 1,
  store: { id: "store-1", name: "Store 1" }, period: period(periodId, archiveYear, "PUBLISHED"),
  publishedBy: { accountId: "qa-admin", displayName: "QA Admin" } });
const settings = (timezone = "Australia/Sydney") => ({ storeId: "store-1", version: 1, timezone, openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30,
  minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", fortnightAnchorDate: null, weeklyHourWarning: 38, dailyHourWarning: 10 });

beforeEach(() => {
  vi.clearAllMocks();
  services.stores.mockResolvedValue({ stores: [{ id: "store-1", name: "Store 1", isActive: true }] });
  services.settings.mockResolvedValue({ settings: settings() });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Export history selection", () => {
  it.each([
    [{ ...period("other-period", year, "DRAFT"), storeId: "store-2" }],
    [{ ...period("bad-date", year, "DRAFT"), startDate: `${year}-02-30` }],
    [{ id: "partial-period", storeId: "store-1" }],
  ])("does not offer current exports for an invalid successful period list", async (rows) => {
    services.periods.mockResolvedValue(rows);
    services.publications.mockResolvedValue([]);
    render(<ExportPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("排班周期读取失败");
    expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toBeNull();
    expect(services.publications).not.toHaveBeenCalled();
  });

  it("recovers the period list after retrying an invalid success response", async () => {
    services.periods.mockResolvedValueOnce([{ id: "partial-period", storeId: "store-1" }])
      .mockResolvedValueOnce([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([]);
    render(<ExportPage />);

    fireEvent.click(await screen.findByRole("button", { name: "重试周期" }));
    await waitFor(() => expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toContain("periodId=published-period"));
    expect(screen.queryByText(/排班周期读取失败/)).toBeNull();
    expect(services.periods).toHaveBeenCalledTimes(2);
  });

  it("rejects an incomplete publication detail before opening the dialog", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("revision-1", year)]);
    services.publication.mockResolvedValue({} as never);
    render(<ExportPage />);

    fireEvent.click(await screen.findByRole("button", { name: "查看" }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "发布记录加载失败" })));
    expect(screen.queryByText(/只读发布版本 #/)).toBeNull();
  });

  it("rejects a publication detail whose snapshot belongs to another store", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("revision-1", year)]);
    services.publication.mockResolvedValue({ ...publication("revision-1", year), snapshot: {
      schemaVersion: 1, store: { id: "store-2", name: "Other Store" }, period: period("published-period", year, "PUBLISHED"), shifts: [],
    } });
    render(<ExportPage />);

    fireEvent.click(await screen.findByRole("button", { name: "查看" }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "发布记录加载失败" })));
    expect(screen.queryByText("Other Store")).toBeNull();
  });

  it("refuses manager-only snapshot fields in an employee detail response", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("revision-1", year)]);
    services.publication.mockResolvedValue({ ...publication("revision-1", year), snapshot: {
      ...snapshotHeader(year), timezone: "Australia/Sydney", shifts: [{ id: "shift-1", date: `${year}-10-12`,
        startAt: `${year}-10-11T23:00:00.000Z`, endAt: `${year}-10-12T06:00:00.000Z`, roleNameSnapshot: "Front",
        roleColorSnapshot: "#333333", breakMinutes: 30, internalNote: "manager secret",
        assignments: [{ employeeNameSnapshot: "Alex", officialScoreSnapshot: 80, tierSnapshot: "T2" }] }],
    } });
    render(<ExportPage />);

    fireEvent.click(await screen.findByRole("button", { name: "查看" }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "发布记录加载失败" })));
    expect(screen.queryByText("manager secret")).toBeNull();
  });

  it.each([{} as never, [{ id: "incomplete" }] as never])("reports an incomplete publication-list success as a retryable error", async (body) => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue(body);
    render(<ExportPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("发布记录读取失败");
    expect(screen.queryByRole("link", { name: "导出" })).toBeNull();
  });

  it("rejects a successful publication list scoped to another store", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([{ ...publication("other-revision", year), store: { id: "store-2", name: "Other Store" } }]);
    render(<ExportPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("门店周期不一致");
    expect(screen.queryByRole("link", { name: "导出" })).toBeNull();
  });

  it("blocks current exports when a successful settings response is incomplete", async () => {
    services.settings.mockResolvedValue({ settings: { storeId: "store-1", timezone: "Australia/Sydney" } });
    services.periods.mockResolvedValue([period("draft-period", year, "DRAFT")]);
    services.publications.mockResolvedValue([]);
    render(<ExportPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("门店设置响应不完整");
    expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toBeNull();
    expect(screen.getByText("打开打印版").closest("a")?.getAttribute("href")).toBeNull();
  });

  it("shows a publication read failure instead of claiming the archive is empty", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockRejectedValueOnce(new Error("发布快照损坏"))
      .mockResolvedValueOnce([publication("revision-1", year)]);
    render(<ExportPage />);

    expect((await screen.findByRole("alert")).textContent).toContain("发布记录读取失败");
    expect(screen.queryByText("该周期尚无发布记录。")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByRole("link", { name: "导出" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows manager-only notes and score snapshots in a manager publication detail", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("revision-1", year)]);
    services.publication.mockResolvedValue({ ...publication("revision-1", year),
      period: period("published-period", year, "PUBLISHED"),
      snapshot: { ...snapshotHeader(year), timezone: "Australia/Sydney", shifts: [{
        id: "shift-1", date: `${year}-10-12`, startAt: `${year}-10-11T23:00:00.000Z`, endAt: `${year}-10-12T06:00:00.000Z`,
        roleNameSnapshot: "Front", roleColorSnapshot: "#333333", breakMinutes: 30,
        publicNote: "公开说明", internalNote: "仅经理查看",
        assignments: [{ id: "assignment-1", employeeNameSnapshot: "Alex", officialScoreSnapshot: 80, tierSnapshot: "T2" }],
      }] },
    });
    render(<ExportPage />);
    await screen.findByRole("button", { name: "查看" });
    fireEvent.change(screen.getByRole("combobox", { name: "导出范围" }), { target: { value: "manager" } });
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(await screen.findByText("内部备注：仅经理查看")).toBeTruthy();
    expect(screen.getByText(/Alex.*80.*T2/)).toBeTruthy();
  });
  it("discards a manager detail response after switching to the employee audience", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("revision-1", year)]);
    let resolveDetail!: (value: unknown) => void;
    services.publication.mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve; }));
    render(<ExportPage />);
    await screen.findByRole("button", { name: "查看" });
    fireEvent.change(screen.getByRole("combobox", { name: "导出范围" }), { target: { value: "manager" } });
    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    await waitFor(() => expect(services.publication).toHaveBeenCalledWith("store-1", "revision-1", "manager"));
    fireEvent.change(screen.getByRole("combobox", { name: "导出范围" }), { target: { value: "employee" } });
    await act(async () => { resolveDetail({ ...publication("revision-1", year),
      period: period("published-period", year, "PUBLISHED"),
      snapshot: { ...snapshotHeader(year), timezone: "Australia/Sydney", shifts: [] },
    }); });
    expect(screen.queryByText(/只读发布版本/)).toBeNull();
    expect((screen.getByRole("button", { name: "查看" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("discards an in-flight publication detail after selecting a different export version", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("revision-1", year), publication("revision-2", year)]);
    let resolveDetail!: (value: unknown) => void;
    services.publication.mockImplementation(() => new Promise((resolve) => { resolveDetail = resolve; }));
    render(<ExportPage />);
    const viewButtons = await screen.findAllByRole("button", { name: "查看" });
    fireEvent.click(viewButtons[0]!);
    await waitFor(() => expect(services.publication).toHaveBeenCalledWith("store-1", "revision-1", "employee"));
    fireEvent.change(screen.getByRole("combobox", { name: "导出版本" }), { target: { value: "revision-2" } });
    await act(async () => { resolveDetail({ ...publication("revision-1", year),
      period: period("published-period", year, "PUBLISHED"),
      snapshot: { ...snapshotHeader(year), timezone: "Australia/Sydney", shifts: [] },
    }); });
    expect(screen.queryByText(/只读发布版本 #/)).toBeNull();
    expect((viewButtons[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables current exports without settings but keeps frozen history accessible", async () => {
    services.settings.mockResolvedValue({ settings: null });
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED"), period("draft-period", year, "DRAFT")]);
    services.publications.mockImplementation((_storeId: string, periodId: string) => Promise.resolve(
      periodId === "published-period" ? [publication("frozen-revision", year)] : []));
    render(<ExportPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("门店时区");
    await waitFor(() => expect((screen.getByRole("combobox", { name: "排班周期" }) as HTMLSelectElement).value).toBe("draft-period"));
    expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toBeNull();
    expect(screen.getByText("打开打印版").closest("a")?.getAttribute("href")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "排班周期" }), { target: { value: "published-period" } });
    await waitFor(() => expect(screen.getByRole("combobox", { name: "导出版本" }).querySelector('option[value="frozen-revision"]')).toBeTruthy());
    fireEvent.change(screen.getByRole("combobox", { name: "导出版本" }), { target: { value: "frozen-revision" } });
    expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toContain("publicationId=frozen-revision");
  });

  it("loads frozen history when current settings fail and blocks current exports", async () => {
    services.settings.mockRejectedValue(new Error("settings unavailable"));
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("frozen-revision", year)]);
    render(<ExportPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("settings unavailable");
    await screen.findByRole("link", { name: "导出" });
    expect(services.periods).toHaveBeenCalledWith("store-1", `${year}-01-01`, `${year}-12-31`);
    expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "导出版本" }), { target: { value: "frozen-revision" } });
    expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toContain("publicationId=frozen-revision");
  });

  it("opens the store-local archive year and period at an Adelaide/Sydney New Year boundary", async () => {
    const localYear = vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(2027);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T13:15:00.000Z"));
    services.settings.mockResolvedValue({ settings: settings("Australia/Adelaide") });
    services.periods.mockImplementation((_storeId: string, from: string) => Promise.resolve(from.startsWith("2026")
      ? [{ id: "adelaide-period", storeId: "store-1", startDate: "2026-12-28", endDate: "2027-01-03", cycleType: "WEEK", status: "DRAFT", version: 1 }]
      : []));
    services.publications.mockResolvedValue([]);
    try {
      render(<ExportPage />);
      await waitFor(() => expect(services.periods).toHaveBeenCalledWith("store-1", "2026-01-01", "2026-12-31"));
      expect((screen.getByRole("combobox", { name: "排班周期" }) as HTMLSelectElement).value).toBe("adelaide-period");
      expect(screen.getByText("2026", { selector: "span" })).toBeTruthy();
    } finally {
      localYear.mockRestore();
    }
  });

  it("displays legacy publication instants in UTC with an explicit timezone warning", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("legacy-revision", year)]);
    services.publication.mockResolvedValue({ ...publication("legacy-revision", year),
      period: period("published-period", year, "PUBLISHED"),
      snapshot: { ...snapshotHeader(year), shifts: [{ id: "shift-1", date: `${year}-10-13`, startAt: `${year}-10-12T13:00:00.000Z`, endAt: `${year}-10-12T16:00:00.000Z`, roleNameSnapshot: "Front", roleColorSnapshot: "#333", breakMinutes: 0, assignments: [{ employeeNameSnapshot: "Employee" }] }] },
    });
    render(<ExportPage />);
    fireEvent.click(await screen.findByRole("button", { name: "查看" }, { timeout: 10000 }));
    expect((await screen.findByRole("status", {}, { timeout: 10000 })).textContent).toContain("UTC");
    expect(screen.getByText(new RegExp(`${year}-10-12.*13:00.*16:00.*UTC`))).toBeTruthy();
  });

  it("labels both fall-back 02:30 occurrences in a frozen publication", async () => {
    services.periods.mockResolvedValue([period("published-period", year, "PUBLISHED")]);
    services.publications.mockResolvedValue([publication("fallback-revision", year)]);
    services.publication.mockResolvedValue({ ...publication("fallback-revision", year),
      period: period("published-period", year, "PUBLISHED"),
      snapshot: { ...snapshotHeader(year), timezone: "Australia/Sydney", shifts: [{ id: "shift-1", date: "2026-04-05", startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z", roleNameSnapshot: "Front", roleColorSnapshot: "#333", breakMinutes: 0, assignments: [{ employeeNameSnapshot: "Employee" }] }] },
    });
    render(<ExportPage />);
    fireEvent.click(await screen.findByRole("button", { name: "查看" }, { timeout: 10000 }));
    expect(await screen.findByText(/02:30 UTC\+11.*02:30 UTC\+10/)).toBeTruthy();
  });
  it("can retrieve a published revision from the preceding year", async () => {
    services.periods.mockImplementation((_storeId: string, from: string) => Promise.resolve(from.startsWith(String(year - 1))
      ? [period("archive-period", year - 1, "PUBLISHED")]
      : [period("current-period", year, "PUBLISHED")]));
    services.publications.mockImplementation((_storeId: string, periodId: string) => Promise.resolve([
      publication(periodId === "archive-period" ? "archive-revision" : "current-revision", periodId === "archive-period" ? year - 1 : year, periodId),
    ]));

    render(<ExportPage />);
    await waitFor(() => expect(screen.getByRole("link", { name: "导出" }).getAttribute("href")).toContain("current-revision"));
    fireEvent.click(screen.getByRole("button", { name: "上一年" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "导出" }).getAttribute("href")).toContain("archive-revision"));
    expect(services.periods).toHaveBeenCalledWith("store-1", `${year - 1}-01-01`, `${year - 1}-12-31`);
    expect(screen.getByRole("link", { name: "导出" }).getAttribute("href")).toContain("publicationId=archive-revision");
  });

  it("hides the former year's export while the next year's periods are loading", async () => {
    let resolveArchive: (rows: unknown[]) => void = () => {};
    const pendingArchive = new Promise<unknown[]>((resolve) => { resolveArchive = resolve; });
    services.periods.mockImplementation((_storeId: string, from: string) => from.startsWith(String(year - 1))
      ? pendingArchive : Promise.resolve([period("current-period", year, "PUBLISHED")]));
    services.publications.mockImplementation((_storeId: string, periodId: string) => Promise.resolve([publication("current-revision", year, periodId)]));

    render(<ExportPage />);
    await waitFor(() => expect(screen.getByRole("link", { name: "导出" }).getAttribute("href")).toContain("current-revision"));
    fireEvent.click(screen.getByRole("button", { name: "上一年" }));
    expect(screen.queryByRole("link", { name: "导出" })).toBeNull();
    expect(screen.getByText("下载 CSV").closest("a")?.getAttribute("href")).toBeNull();
    resolveArchive([period("archive-period", year - 1, "DRAFT")]);
    await waitFor(() => expect((screen.getByRole("combobox", { name: "排班周期" }) as HTMLSelectElement).value).toBe("archive-period"));
  });

  it("clears a prior period's publication before the new publication read settles", async () => {
    let resolveDraft: (rows: unknown[]) => void = () => {};
    const pendingDraft = new Promise<unknown[]>((resolve) => { resolveDraft = resolve; });
    services.periods.mockResolvedValue([period("draft-period", year, "DRAFT"), period("published-period", year, "PUBLISHED")]);
    services.publications.mockImplementation((_storeId: string, periodId: string) => periodId === "draft-period"
      ? pendingDraft : Promise.resolve([publication("published-revision", year)]));

    render(<ExportPage />);
    await waitFor(() => expect(screen.getByRole("link", { name: "导出" }).getAttribute("href")).toContain("published-revision"));
    fireEvent.change(screen.getByRole("combobox", { name: "排班周期" }), { target: { value: "draft-period" } });
    expect(screen.queryByRole("link", { name: "导出" })).toBeNull();
    expect(screen.getByRole("link", { name: /下载 CSV/ }).getAttribute("href")).toContain("periodId=draft-period");
    resolveDraft([]);
    await waitFor(() => expect(services.publications).toHaveBeenCalledWith("store-1", "draft-period"));
  });
});

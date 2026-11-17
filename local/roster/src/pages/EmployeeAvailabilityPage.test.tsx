import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmployeeAvailabilityPage } from "./EmployeeAvailabilityPage";
import { EmployeePortalError, type EmployeeWeek } from "../services/employeePortalRepository";

const api = vi.hoisted(() => ({ mode: "demo" as const, accounts: vi.fn(), me: vi.fn(), login: vi.fn(), logout: vi.fn(), week: vi.fn(), save: vi.fn(), preview: vi.fn() }));
vi.mock("../services/employeePortalRepository", async (importOriginal) => ({ ...await importOriginal<typeof import("../services/employeePortalRepository")>(), employeePortalRepository: api }));
vi.mock("../components/ui/AppSelect", () => ({ AppSelect: ({ ariaLabel, options, value, disabled, onValueChange }: {
  ariaLabel: string; options: { value: string; label: string }[]; value: string; disabled: boolean; onValueChange: (value: string) => void;
}) => <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={e => onValueChange(e.target.value)}>{options.map(o => <option value={o.value} key={o.value}>{o.label}</option>)}</select> }));
const account = { id: "demo-1", name: "演示员工 A", storeId: "hurstville", storeName: "Hurstville" };
function snapshot(week: string): EmployeeWeek {
  const dates = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${week}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
  return { accountId: account.id, week, timezone: "Australia/Sydney", ruleVersion: "v1", ruleScope: "DEFAULT", revision: 0, updatedAt: null,
    days: dates.map(date => ({ date, status: "UNKNOWN", slots: [] })),
    capacity: dates.map(date => ({ date, bands: [{ start: "10:00", end: "12:00", signal: "GREEN" }] })),
    shortcutsVersion: 1, shortcuts: [{ code: "AA", startTime: "10:00", endTime: "12:00" }, { code: "BB", startTime: "10:00", endTime: "11:00" }, { code: "CC", startTime: "11:00", endTime: "12:00" }] };
}
beforeEach(() => {
  vi.resetAllMocks();
  api.accounts.mockResolvedValue({ accounts: [account, { ...account, id: "demo-2", name: "演示员工 B" }, { ...account, id: "demo-3", name: "演示员工 C" }] });
  api.me.mockResolvedValue({ account });
  api.week.mockImplementation(async (week: string) => snapshot(week));
  api.save.mockImplementation(async (value: EmployeeWeek, days) => ({ ...value, days, revision: value.revision + 1, updatedAt: new Date().toISOString() }));
});
afterEach(() => cleanup());
const open = (url = "/employee/availability") => render(<MemoryRouter initialEntries={[url]}><EmployeeAvailabilityPage /></MemoryRouter>);

describe("employee availability page", () => {
  it("uses only the session identity in account mode, ignoring demo URL hints", async () => {
    render(<MemoryRouter initialEntries={["/employee/availability?account=other-person"]}><EmployeeAvailabilityPage portal={{ ...api, mode: "account" }} /></MemoryRouter>);
    await screen.findAllByRole("button", { name: /选择 AA$/ });
    expect(screen.getByText("Hurstville · 演示员工 A")).toBeTruthy();
    expect(api.accounts).not.toHaveBeenCalled();
    expect(api.login).not.toHaveBeenCalled();
    expect(screen.queryByText(/体验模式/)).toBeNull();
  });
  it("shows formal login when the session expires without offering demo identities", async () => {
    api.me.mockRejectedValue(new EmployeePortalError("expired", 401));
    render(<MemoryRouter><EmployeeAvailabilityPage portal={{ ...api, mode: "account", signInPath: "/staff/sign-in" }} /></MemoryRouter>);
    expect((await screen.findByRole("link", { name: "登录员工账号" })).getAttribute("href")).toBe("/staff/sign-in");
    expect(api.accounts).not.toHaveBeenCalled();
    expect(api.week).not.toHaveBeenCalled();
  });
  it("counts unavailable days as filled and keeps unfilled days distinct", async () => {
    open();
    fireEvent.click((await screen.findAllByRole("button", { name: /选择 AA$/ }))[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /无法报班$/ })[1]);
    expect(screen.getByRole("progressbar", { name: "已填写天数" }).getAttribute("value")).toBe("2");
    expect(screen.getByText("1 天可报班 · 1 天无法报班 · 5 天未填写")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /清除选择$/ })[0]);
    expect(screen.getByRole("progressbar", { name: "已填写天数" }).getAttribute("value")).toBe("1");
  });
  it("uses the personal account link without silently entering another account", async () => {
    open("/employee/availability?account=demo-2");
    await screen.findByRole("button", { name: /演示员工 B/ });
    expect(screen.queryByRole("button", { name: /演示员工 A/ })).toBeNull();
    expect(api.week).not.toHaveBeenCalled();
  });
  it("submits a personal draft and confirms the returned version", async () => {
    open();
    const controls = await screen.findAllByRole("button", { name: /选择 AA$/ });
    fireEvent.click(controls[0]);
    expect((screen.getByRole("button", { name: "下一周" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "提交本周报班" }));
    await screen.findByText(/报班已提交。/);
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ accountId: "demo-1", revision: 0 }), expect.arrayContaining([
      expect.objectContaining({ status: "AVAILABLE", shortcut: "AA", slots: [{ start: "10:00", end: "12:00" }] }),
    ]));
    expect((screen.getByRole("button", { name: "下一周" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("keeps a failed submission editable instead of falsely marking it saved", async () => {
    api.save.mockRejectedValue(new Error("连接中断")); open();
    fireEvent.click((await screen.findAllByRole("button", { name: /选择 AA$/ }))[0]);
    fireEvent.click(screen.getByRole("button", { name: "提交本周报班" }));
    await screen.findByRole("alert");
    expect(screen.getAllByRole("button", { name: /选择 AA$/ })[0].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("修改尚未提交")).toBeTruthy();
    expect((screen.getByRole("button", { name: "提交本周报班" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("refreshes colors without discarding selected codes", async () => {
    open();
    const button = (await screen.findAllByRole("button", { name: /选择 BB$/ }))[0];
    fireEvent.click(button);
    api.week.mockImplementation(async (week: string) => ({ ...snapshot(week), capacity: snapshot(week).capacity.map(c => ({ ...c, bands: c.bands.map(b => ({ ...b, signal: "RED" })) })) }));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(screen.getAllByText("已饱满").length).toBeGreaterThan(1));
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("修改尚未提交")).toBeTruthy();
  });
  it("requires a successful code preview before submitting a typed expression", async () => {
    api.preview.mockImplementation(async (_account: string, week: string) => {
      const result = snapshot(week); result.days[0] = { ...result.days[0], status: "AVAILABLE", shortcut: "BB", slots: [{ start: "10:00", end: "11:00" }] }; return result;
    });
    open();
    const input = await screen.findByLabelText("用代码快速填写整周");
    fireEvent.change(input, { target: { value: "1bb" } });
    expect((screen.getByRole("button", { name: "提交本周报班" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "转换并预览" }));
    await screen.findByText(/代码已转换为下方每天的选择/);
    expect(api.preview).toHaveBeenCalledWith("demo-1", expect.any(String), "1bb");
    expect(screen.getAllByRole("button", { name: /选择 BB$/ })[0].getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button", { name: "提交本周报班" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

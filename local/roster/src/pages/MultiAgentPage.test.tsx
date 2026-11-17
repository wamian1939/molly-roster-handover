import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultiAgentPage } from "./MultiAgentPage";
import { addCalendarDays } from "../lib/storeTime";

const mocks = vi.hoisted(() => ({
  stores: vi.fn(), initialize: vi.fn(), inputs: vi.fn(), latest: vi.fn(), status: vi.fn(), start: vi.fn(), health: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { accountId: "account-1" } }) }));
vi.mock("../store/StoreContext", () => ({ useStoreSelection: () => ({ selectedStoreId: "hurstville", setSelectedStoreId: vi.fn(), initializeStoreId: mocks.initialize }) }));
vi.mock("../services/workforceRepository", () => ({ workforceRepository: { stores: mocks.stores } }));
vi.mock("../services/multiAgentRepository", () => ({ multiAgentRepository: { health: mocks.health, inputs: mocks.inputs, latest: mocks.latest, status: mocks.status, start: mocks.start } }));

function fixture() {
  const person = { id: "bob", name: "HandoverEmployee018", score: 80.3 };
  const targets = [{ employee_id: "bob", employee_name: "HandoverEmployee018", rating: 80.3, available_minutes: 3600, target_fraction: .7, target_scheduled_minutes: 2520, target_assigned_minutes: 300 }];
  const context = { employees: [person], rating_hour_targets: targets, days: [{ date: "2026-10-27" }] };
  return { context, employees: [person], rules: { version: "hurstville:v20", timezone: "Australia/Sydney" }, snapshot_version: "official-snapshot", availability_count: 5, existing_shift_count: 0, detached_existing_count: 41, preserve_existing: false, rating_source: "Official CLOSED", source_diagnostics: [] };
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  mocks.stores.mockResolvedValue({ stores: [{ id: "hurstville", name: "Hurstville" }] });
  mocks.health.mockResolvedValue({ ok: true, provider_configured: true });
  mocks.inputs.mockResolvedValue(fixture());
});
afterEach(cleanup);

describe("main Roster Multi-Agent page", () => {
  it("defaults to a detached draft and invalidates the preview when the week changes", async () => {
    render(<MultiAgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "读取真实排班输入" }));
    await screen.findByText("hurstville:v20");
    expect(mocks.inputs.mock.calls[0][0]).toBe("hurstville");
    expect(mocks.inputs.mock.calls[0][3]).toBe(false);
    expect((screen.getByRole("button", { name: "生成排班草稿" }) as HTMLButtonElement).disabled).toBe(false);
    const weekInput=screen.getByLabelText("排班周") as HTMLInputElement;
    fireEvent.change(weekInput, { target: { value: addCalendarDays(weekInput.value, 7) } });
    expect((screen.getByRole("button", { name: "生成排班草稿" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("renders the actual shared vertical calendar, authoritative targets and failed-week status", async () => {
    const preview = fixture();
    const shift = { id: "s1", employee_id: "bob", date: "2026-10-27", pattern_name: "Late", role_code: "late", start: "2026-10-27T06:00:00Z", end: "2026-10-27T11:00:00Z", fixed: false, reason: "Mandatory evening coverage" };
    const slot = { date: shift.date, start: shift.start, end: "2026-10-27T06:30:00Z", required: 1, scheduled: 1, difference: 0, employee_ids: ["bob"] };
    mocks.latest.mockResolvedValue({ status: "FAILED", timezone: "Australia/Sydney", events: [], history: [], result: {
      run_id: "historical-run", context: preview.context, assignments: [shift], failed_days: [{ date: "2026-10-28" }],
      validation: { valid: false, coverage: [slot], errors: [] }, ledger: { version: 1, employees: [] },
      business_rule_report: { rows: preview.context.rating_hour_targets, mandatory_coverage: [{ date: shift.date, employee_name: "HandoverEmployee018", start: "17:00", end: "22:00", satisfied: true }] },
    } });
    const { container } = render(<MultiAgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "查看最近真实测试结果" }));
    await screen.findByText(/全周验证未通过/);
    expect(container.querySelectorAll(".verticalShift").length).toBe(1);
    expect(screen.getByText("已满足")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("42 h")).toBeTruthy();
    expect((screen.getByRole("button", { name: "导出已验证草稿 JSON" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("reports an unavailable engine without substituting fixture employees", async () => {
    mocks.inputs.mockRejectedValue(new Error("该门店还未确认 RuleSet"));
    render(<MultiAgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "读取真实排班输入" }));
    await screen.findByRole("alert");
    expect(screen.getByText("该门店还未确认 RuleSet")).toBeTruthy();
    expect((screen.getByRole("button", { name: "生成排班草稿" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("explains preserved overstaffing separately from actual available-staff shortages", async () => {
    const preview = fixture();
    mocks.inputs.mockResolvedValue({ ...preview, preserve_existing: true, source_diagnostics: [{ date: "2026-10-26", proven_slot_conflicts: [{ code: "FIXED_EXACT_EXCESS" }], conflict_groups: [{ code: "FIXED_EXACT_EXCESS", start: "2026-10-25T23:00:00Z", end: "2026-10-26T00:00:00Z", required: 3, fixed_employee_ids: ["a", "b", "c", "d", "e", "f"], slot_count: 2 }] }] });
    render(<MultiAgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "读取真实排班输入" }));
    await screen.findByText(/已有班次人数超额/);
    expect(screen.getByText(/要求恰好 3 人，保留的旧班次已有 6 人/)).toBeTruthy();
    expect(screen.queryByText(/项人员、资格或固定班次冲突/)).toBeNull();
    expect(screen.queryByText(/当前可用人选不足/)).toBeNull();
  });
  it("resumes the session-owned run after returning to the page", async () => {
    sessionStorage.setItem("molly-roster:agent-run:account-1:hurstville", "owned-run");
    mocks.status.mockResolvedValue({ status: "INTERRUPTED", result: null, events: [], history: [] });
    render(<MultiAgentPage />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalledWith("hurstville", "owned-run"));
    await screen.findByText(/服务重启前的任务未完成/);
  });
  it("displays requirement-agent failures before a context exists", async () => {
    mocks.latest.mockResolvedValue({ status: "FAILED", timezone: "Australia/Sydney", events: [], history: [], result: {
      context: null, assignments: [], failed_days: [], validation: { valid: false, coverage: [], errors: [{ code: "REQUIREMENT_FAILED", message: "需求输出未通过 Schema 检查" }] },
      business_rule_report: null, ledger: { version: 0, employees: [] },
    } });
    render(<MultiAgentPage />);
    fireEvent.click(screen.getByRole("button", { name: "查看最近真实测试结果" }));
    await screen.findByText(/全周验证未通过/);
    expect(screen.getByText(/REQUIREMENT_FAILED/)).toBeTruthy();
  });
});

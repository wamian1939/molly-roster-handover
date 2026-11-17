import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftTemplate } from "../types/roster";
import { TemplatesPage } from "./TemplatesPage";

const services = vi.hoisted(() => ({
  storeId: "store-a", rerender: () => {},
  toast: vi.fn(), stores: vi.fn(), jobs: vi.fn(), roles: vi.fn(), templates: vi.fn(), availabilityTemplates: vi.fn(),
  createTemplate: vi.fn(), updateTemplate: vi.fn(), createAvailabilityTemplate: vi.fn(), updateAvailabilityTemplate: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { role: "ADMIN", storeIds: ["store-a", "store-b"] } }) }));
vi.mock("../store/StoreContext", () => ({ useStoreSelection: () => ({
  selectedStoreId: services.storeId,
  setSelectedStoreId: (id: string) => { services.storeId = id; services.rerender(); },
  initializeStoreId: vi.fn(),
}) }));
vi.mock("../services/workforceRepository", () => ({ workforceRepository: { stores: services.stores, jobs: services.jobs } }));
vi.mock("../services/rosterRepository", () => ({ rosterRepository: {
  roles: services.roles, templates: services.templates, availabilityTemplates: services.availabilityTemplates,
  createTemplate: services.createTemplate, updateTemplate: services.updateTemplate,
  createAvailabilityTemplate: services.createAvailabilityTemplate, updateAvailabilityTemplate: services.updateAvailabilityTemplate,
} }));
vi.mock("../components/ui/ToastProvider", () => ({ useToast: () => ({ showToast: services.toast }), InlineSpinner: () => null }));
vi.mock("../components/ui/AppSelect", () => ({ AppSelect: ({ label, value, onValueChange, options }: { label: string; value: string; onValueChange: (value: string) => void; options: { label: string }[] }) =>
  label === "门店" ? <button type="button" onClick={() => onValueChange(value === "store-a" ? "store-b" : "store-a")}>切换门店</button> : <span aria-label={label} data-value={value}>{label === "默认岗位" ? options.map((option) => option.label).join("|") : label}</span> }));

const template = (storeId: string): ShiftTemplate => ({
  id: `${storeId}-template`, storeId, name: `${storeId} 早班`, startTime: "09:00", endTime: "17:00",
  breakMinutes: 30, shiftRoleId: null, isActive: true, displayOrder: 0, version: 1, shiftRole: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  services.storeId = "store-a";
  services.rerender = () => {};
  services.stores.mockResolvedValue({ stores: [{ id: "store-a", name: "A" }, { id: "store-b", name: "B" }] });
  services.roles.mockResolvedValue([]);
  services.jobs.mockResolvedValue({ jobs: [] });
  services.templates.mockReset().mockResolvedValue([]);
  services.availabilityTemplates.mockReset().mockResolvedValue([]);
  services.createAvailabilityTemplate.mockReset();
  services.createTemplate.mockResolvedValue(template("store-b"));
  services.updateTemplate.mockResolvedValue(template("store-b"));
});
afterEach(cleanup);

describe("Templates store scope", () => {
  it("does not claim a shift template was created from a foreign-store success response", async () => {
    services.createTemplate.mockResolvedValue(template("store-b"));
    render(<TemplatesPage />);
    await waitFor(() => expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByPlaceholderText("例如：早班"), { target: { value: "New shift" } });
    fireEvent.click(screen.getAllByRole("button", { name: "创建模板" })[0]!);

    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({
      tone: "error", title: "保存结果未确认",
    })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ tone: "success", title: "模板已创建" }));
    expect(screen.getByPlaceholderText("例如：早班")).toHaveProperty("value", "New shift");
  });

  it("does not accept another template's successful update response", async () => {
    services.templates.mockResolvedValue([template("store-a")]);
    services.updateTemplate.mockResolvedValue({ ...template("store-a"), id: "different-template" });
    render(<TemplatesPage />);
    await screen.findByText("store-a 早班");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({
      tone: "error", title: "保存结果未确认",
    })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ tone: "success", title: "模板已更新" }));
    expect(screen.getByRole("button", { name: "保存修改" })).toBeTruthy();
  });

  it("does not confirm a same-store create with a different template name", async () => {
    services.createTemplate.mockResolvedValue(template("store-a"));
    render(<TemplatesPage />);
    await waitFor(() => expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByPlaceholderText("例如：早班"), { target: { value: "New shift" } });
    fireEvent.click(screen.getAllByRole("button", { name: "创建模板" })[0]!);
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "保存结果未确认" })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "模板已创建" }));
    expect(screen.getByPlaceholderText("例如：早班")).toHaveProperty("value", "New shift");
  });

  it("does not confirm a template edit at the previous version", async () => {
    services.templates.mockResolvedValue([template("store-a")]);
    services.updateTemplate.mockResolvedValue(template("store-a"));
    render(<TemplatesPage />);
    await screen.findByText("store-a 早班");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "保存结果未确认" })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "模板已更新" }));
    expect(screen.getByRole("button", { name: "保存修改" })).toBeTruthy();
  });

  it("does not accept an availability toggle response with the old active state", async () => {
    const availability = { id: "availability-a", storeId: "store-a", name: "标准全天",
      slots: [{ dayOffset: 0, status: "AVAILABLE", startTime: "09:00", endTime: "22:00" }],
      isActive: true, displayOrder: 0, version: 2 };
    services.availabilityTemplates.mockResolvedValue([availability]);
    services.updateAvailabilityTemplate.mockResolvedValue({ ...availability, version: 3 });
    render(<TemplatesPage />);
    const row = (await screen.findByText("标准全天")).closest("article")!;
    fireEvent.click(row.querySelector("button")!);
    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "保存结果未确认" })));
    expect(row.textContent).toContain("启用");
  });

  it("keeps availability-template input when its success response is malformed", async () => {
    services.createAvailabilityTemplate.mockResolvedValue({ id: "missing-fields", storeId: "store-a" });
    render(<TemplatesPage />);
    fireEvent.change(screen.getByPlaceholderText("例如：标准全天"), { target: { value: "Evening" } });
    await waitFor(() => expect((screen.getAllByRole("button", { name: "创建模板" })[1] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole("button", { name: "创建模板" })[1]!);

    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({
      tone: "error", title: "保存结果未确认",
    })));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ tone: "success", title: "可用时间模板已创建" }));
    expect(screen.getByPlaceholderText("例如：标准全天")).toHaveProperty("value", "Evening");
  });

  it("rejects a malformed successful shift-template list without enabling edits", async () => {
    services.templates.mockResolvedValue({ id: "not-an-array" });
    render(<TemplatesPage />);

    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({
      tone: "error", title: "班次模板加载失败",
    })));
    expect((screen.getAllByRole("button", { name: "创建模板" })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("rejects a different store's successful availability-template list", async () => {
    services.availabilityTemplates.mockResolvedValue([{ id: "foreign", storeId: "store-b", name: "Other store",
      slots: [], isActive: true, displayOrder: 0, version: 1 }]);
    render(<TemplatesPage />);

    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({
      tone: "error", title: "可用时间模板加载失败",
    })));
    expect(screen.queryByText("Other store")).toBeNull();
    expect((screen.getAllByRole("button", { name: "创建模板" })[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("rejects a different store's successful shift-template list", async () => {
    services.templates.mockResolvedValue([template("store-b")]);
    render(<TemplatesPage />);

    await waitFor(() => expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({
      tone: "error", title: "班次模板加载失败",
    })));
    expect(screen.queryByText("store-b 早班")).toBeNull();
    expect((screen.getAllByRole("button", { name: "创建模板" })[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps availability templates usable while the formal job catalog is pending", async () => {
    services.jobs.mockImplementation(() => new Promise(() => {}));
    services.availabilityTemplates.mockResolvedValue([{ id: "availability-a", storeId: "store-a", name: "标准全天",
      slots: [{ dayOffset: 0, status: "AVAILABLE", startTime: "09:00", endTime: "22:00" }], isActive: true, displayOrder: 0, version: 1 }]);
    render(<TemplatesPage />);

    expect(await screen.findByText("标准全天")).toBeTruthy();
    expect((screen.getAllByRole("button", { name: "创建模板" })[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("例如：标准全天"), { target: { value: "新模板" } });
    expect((screen.getAllByRole("button", { name: "创建模板" })[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps a created shift template visible when the follow-up list refresh fails", async () => {
    services.templates.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("刷新中断"));
    services.createTemplate.mockResolvedValue(template("store-a"));
    render(<TemplatesPage />);
    await waitFor(() => expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByPlaceholderText("例如：早班"), { target: { value: "store-a 早班" } });
    fireEvent.click(screen.getAllByRole("button", { name: "创建模板" })[0]!);
    await waitFor(() => expect(services.templates).toHaveBeenCalledTimes(2));
    expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "success", title: "模板已创建" }));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "保存失败" }));
    expect(screen.getByText("store-a 早班")).toBeTruthy();
  });

  it("keeps a created availability template visible when its list refresh fails", async () => {
    services.templates.mockResolvedValue([]);
    services.availabilityTemplates.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("刷新中断"));
    services.createAvailabilityTemplate.mockResolvedValue({ id: "availability-a", storeId: "store-a", name: "标准全天", slots: [{ dayOffset: 0, status: "AVAILABLE", startTime: "09:00", endTime: "22:00" }], isActive: true, displayOrder: 0, version: 1 });
    render(<TemplatesPage />);
    await waitFor(() => expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByPlaceholderText("例如：标准全天"), { target: { value: "标准全天" } });
    fireEvent.click(screen.getAllByRole("button", { name: "创建模板" })[1]!);
    await waitFor(() => expect(services.availabilityTemplates).toHaveBeenCalledTimes(2));
    expect(services.toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "success", title: "可用时间模板已创建" }));
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "保存失败" }));
    expect(screen.getByText("标准全天")).toBeTruthy();
  });

  it("allows Store B to edit while a Store A mutation is pending", async () => {
    services.templates.mockImplementation(async (id: string) => [template(id)]);
    let resolveA!: (value: ShiftTemplate) => void;
    let resolveB!: (value: ShiftTemplate) => void;
    services.updateTemplate.mockImplementation((id: string) => id === "store-a-template"
      ? new Promise((resolve) => { resolveA = resolve; }) : new Promise((resolve) => { resolveB = resolve; }));
    const view = render(<TemplatesPage />);
    services.rerender = () => view.rerender(<TemplatesPage />);
    await screen.findByText("store-a 早班");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.updateTemplate).toHaveBeenCalledWith("store-a-template", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await screen.findByText("store-b 早班");
    expect((screen.getByRole("button", { name: "编辑" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.updateTemplate).toHaveBeenCalledWith("store-b-template", expect.anything()));
    await act(async () => { resolveA(template("store-a")); });
    expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveB(template("store-b")); });
    expect((screen.getByRole("button", { name: "编辑" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the template being saved selected until its response settles", async () => {
    const first = template("store-a");
    const second = { ...first, id: "store-a-second", name: "Second shift" };
    services.templates.mockResolvedValue([first, second]);
    let resolveSave!: (value: ShiftTemplate) => void;
    services.updateTemplate.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    render(<TemplatesPage />);
    await waitFor(() => expect(screen.getByText("Second shift")).toBeTruthy());
    const editButtons = screen.getAllByRole("button", { name: "编辑" });
    fireEvent.click(editButtons[0]!);
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.updateTemplate).toHaveBeenCalledOnce());
    expect(screen.getAllByRole("button", { name: "编辑" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect((screen.getByRole("button", { name: "取消" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveSave(first); });
    expect(screen.getAllByRole("button", { name: "编辑" }).every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
  });

  it("starts a new preset with the observed BHS time and break defaults", async () => {
    services.roles.mockResolvedValue([]);
    services.jobs.mockResolvedValue({ jobs: [] });
    services.templates.mockResolvedValue([]);
    render(<TemplatesPage />);
    await waitFor(() => expect(document.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false));
    const clocks = document.querySelectorAll('fieldset input[type="time"]');
    expect((clocks[0] as HTMLInputElement).value).toBe("09:00");
    expect((clocks[1] as HTMLInputElement).value).toBe("22:00");
    expect(screen.getByLabelText("休息").getAttribute("data-value")).toBe("0");
  });

  it("offers only current formal jobs and flags a legacy template role", async () => {
    const legacyRole = { id: "legacy", storeId: "store-a", code: "qa-role", nameZh: "验收岗", colorToken: "#ff0000", requiredSkillCodes: [], isActive: true };
    const formalRole = { id: "formal", storeId: "store-a", code: "water-bar", nameZh: "旧水吧", colorToken: "#00ff00", requiredSkillCodes: [], isActive: true };
    services.roles.mockResolvedValue([legacyRole, formalRole]);
    services.jobs.mockResolvedValue({ jobs: [{ id: "job-1", storeId: "store-a", code: "water-bar", name: "水吧", colorToken: "#00ff00", isActive: true, displayOrder: 1 }] });
    services.templates.mockResolvedValue([{ ...template("store-a"), shiftRoleId: "legacy", shiftRole: legacyRole }]);
    render(<TemplatesPage />);
    await waitFor(() => expect(screen.getByLabelText("默认岗位").textContent).toContain("水吧"));
    expect(screen.getByLabelText("默认岗位").textContent).not.toContain("验收岗");
    expect(screen.getByText(/旧岗位：验收岗 · 需重新关联/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByRole("alert").textContent).toContain("请选择当前岗位");
    expect((screen.getByRole("button", { name: "保存修改" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignores an old-store read and blocks editing until the selected store loads", async () => {
    let resolveA!: (value: ShiftTemplate[]) => void;
    let resolveB!: (value: ShiftTemplate[]) => void;
    services.templates.mockImplementation((storeId: string) => new Promise((resolve) => {
      if (storeId === "store-a") resolveA = resolve;
      else resolveB = resolve;
    }));
    const view = render(<TemplatesPage />);
    services.rerender = () => view.rerender(<TemplatesPage />);
    await waitFor(() => expect(services.templates).toHaveBeenCalledWith("store-a"));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect(services.templates).toHaveBeenCalledWith("store-b"));
    expect(screen.getAllByRole("button", { name: "创建模板" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    await act(async () => { resolveB([template("store-b")]); });
    expect(screen.getByText("store-b 早班")).toBeTruthy();
    await act(async () => { resolveA([template("store-a")]); });
    expect(screen.queryByText("store-a 早班")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.updateTemplate).toHaveBeenCalledWith("store-b-template",
      expect.objectContaining({ storeId: "store-b", name: "store-b 早班" })));
  });

  it("discards an old-store mutation response after switching stores", async () => {
    services.templates.mockImplementation(async (storeId: string) => [template(storeId)]);
    let resolveSave!: (value: ShiftTemplate) => void;
    services.updateTemplate.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const view = render(<TemplatesPage />);
    services.rerender = () => view.rerender(<TemplatesPage />);
    await waitFor(() => expect(screen.getByText("store-a 早班")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.updateTemplate).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect(screen.getByText("store-b 早班")).toBeTruthy());
    await act(async () => { resolveSave(template("store-a")); });
    expect(screen.queryByText("store-a 早班")).toBeNull();
    expect(services.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "模板已更新" }));
  });
});

describe("Templates returning-store refresh", () => {
  it("refreshes a completed shift-template save after A to B to A navigation", async () => {
    let currentA = template("store-a");
    services.templates.mockImplementation(async (id: string) => [id === "store-a" ? currentA : template("store-b")]);
    let resolveSave!: (value: ShiftTemplate) => void;
    services.updateTemplate.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const view = render(<TemplatesPage />);
    services.rerender = () => view.rerender(<TemplatesPage />);
    await screen.findByText("store-a 早班");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.updateTemplate).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await screen.findByText("store-b 早班");
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await screen.findByText("store-a 早班");
    currentA = { ...currentA, name: "store-a 更新后早班", version: 2 };
    await act(async () => { resolveSave(currentA); });
    expect(await screen.findByText("store-a 更新后早班")).toBeTruthy();
  });

  it("refreshes a completed availability-template toggle after A to B to A navigation", async () => {
    let currentA = { id: "availability-a", storeId: "store-a", name: "A availability",
      slots: [{ dayOffset: 0, status: "AVAILABLE", startTime: "09:00", endTime: "22:00" }],
      isActive: true, displayOrder: 0, version: 1 };
    services.availabilityTemplates.mockImplementation(async (id: string) => id === "store-a" ? [currentA] : []);
    let resolveSave!: (value: typeof currentA) => void;
    services.updateAvailabilityTemplate.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const view = render(<TemplatesPage />);
    services.rerender = () => view.rerender(<TemplatesPage />);
    const toggle = () => screen.getByText("A availability").closest("article")!.querySelector("button")!;
    await screen.findByText("A availability");
    fireEvent.click(toggle());
    await waitFor(() => expect(services.updateAvailabilityTemplate).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect(services.availabilityTemplates).toHaveBeenCalledWith("store-b"));
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await screen.findByText("A availability");
    currentA = { ...currentA, isActive: false, version: 2 };
    await act(async () => { resolveSave(currentA); });
    await waitFor(() => expect(toggle().textContent).toBe("启用"));
  });

  it("does not let an earlier returning-store read overwrite the committed template", async () => {
    const oldA = template("store-a");
    const updatedA = { ...oldA, name: "store-a 已保存", version: 2 };
    let aReads = 0;
    let resolveOldRead!: (value: ShiftTemplate[]) => void;
    services.templates.mockImplementation((id: string) => {
      if (id === "store-b") return Promise.resolve([template("store-b")]);
      aReads += 1;
      return aReads === 2 ? new Promise((resolve) => { resolveOldRead = resolve; })
        : Promise.resolve(aReads === 1 ? [oldA] : [updatedA]);
    });
    let resolveSave!: (value: ShiftTemplate) => void;
    services.updateTemplate.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const view = render(<TemplatesPage />);
    services.rerender = () => view.rerender(<TemplatesPage />);
    await screen.findByText(oldA.name);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    await waitFor(() => expect(services.updateTemplate).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await screen.findByText("store-b 早班");
    fireEvent.click(screen.getByRole("button", { name: "切换门店" }));
    await waitFor(() => expect(aReads).toBe(2));
    await act(async () => { resolveSave(updatedA); });
    await waitFor(() => expect(aReads).toBe(3));
    await act(async () => { resolveOldRead([oldA]); });
    expect(await screen.findByText(updatedA.name)).toBeTruthy();
    expect(screen.queryByText(oldA.name)).toBeNull();
  });
});

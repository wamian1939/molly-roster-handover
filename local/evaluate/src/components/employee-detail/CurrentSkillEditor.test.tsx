// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { employeeRepository } from "../../services/employeeRepository";
import { CurrentSkillEditor } from "./CurrentSkillEditor";

vi.mock("../ui/Dialog", () => ({ Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../../services/employeeRepository", () => ({ employeeRepository: {
  fetchCurrentSkills: vi.fn(), fetchCurrentSkillConfirmations: vi.fn(), confirmCurrentSkill: vi.fn(),
} }));

describe("CurrentSkillEditor", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.mocked(employeeRepository.fetchCurrentSkills).mockResolvedValue({ skills: [{
      id: "skill-milk", code: "milk-bar", nameZh: "奶吧", category: "BackKitchen",
      skillMode: "PROGRESSIVE", status: "NotTrained", updatedAt: "2026-10-09T00:00:00.000Z",
    }] });
    vi.mocked(employeeRepository.confirmCurrentSkill).mockResolvedValue({ skills: [] });
    vi.mocked(employeeRepository.fetchCurrentSkillConfirmations).mockResolvedValue({
      items: [], page: 1, pageSize: 5, total: 0, totalPages: 0,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllMocks();
  });

  it("allows a reasoned confirmation when the official status stays the same", async () => {
    const onSaved = vi.fn(async () => {});
    await act(async () => {
      root.render(<CurrentSkillEditor employeeId="employee-1" onClose={() => {}} onSaved={onSaved} />);
      await Promise.resolve();
    });
    const button = [...host.querySelectorAll("button")].find((item) => item.textContent?.includes("确认当前技能"));
    const reason = host.querySelector("textarea");
    expect(button?.disabled).toBe(true);
    expect(reason).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(reason, "Manager checked the source record");
      reason?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button?.disabled).toBe(false);
    await act(async () => { button?.click(); await Promise.resolve(); });
    expect(employeeRepository.confirmCurrentSkill).toHaveBeenCalledWith("employee-1", expect.objectContaining({ id: "skill-milk", status: "NotTrained" }), "NotTrained", "Manager checked the source record");
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("shows the administrator's prior confirmation separately from the editable status", async () => {
    vi.mocked(employeeRepository.fetchCurrentSkillConfirmations).mockResolvedValue({
      items: [{ id: "confirmation-1", previousStatus: "Training", confirmedStatus: "NotTrained", confirmedByAccountId: "admin-1", confirmedByName: "Manager", reason: "Reviewed source record", confirmedAt: "2026-10-09T00:00:00.000Z" }],
      page: 1, pageSize: 5, total: 1, totalPages: 1,
    });
    await act(async () => {
      root.render(<CurrentSkillEditor employeeId="employee-1" onClose={() => {}} onSaved={async () => {}} />);
      await Promise.resolve();
    });
    await act(async () => { await Promise.resolve(); });
    expect(employeeRepository.fetchCurrentSkillConfirmations).toHaveBeenCalledWith("employee-1", "skill-milk", 1);
    expect(host.textContent).toContain("培训中 → 未培训");
    expect(host.textContent).toContain("Reviewed source record");
    expect(host.textContent).toContain("Manager");
  });
});

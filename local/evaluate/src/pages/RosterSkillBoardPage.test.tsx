// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "../services/evaluationRepository";
import type { RosterSkillBoardResponse } from "../types/evaluation";
import { RosterSkillBoardPage } from "./RosterSkillBoardPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN", storeId: null }, isLoading: false }),
}));

let root: Root | null;
let container: HTMLDivElement;

const data: RosterSkillBoardResponse = {
  stores: [{ id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney" }],
  selectedStoreId: "store-1",
  skillDefinitions: [
    skill("skill-tea", "tea-preparation", "Back Kitchen", 10),
    skill("skill-milk", "milk-bar", "Back Kitchen", 20),
    skill("skill-cup", "cup-labeling", "Bar", 30),
  ],
  employees: [
    employee("employee-1", "HandoverEmployee016", [
      { skillDefinitionId: "skill-tea", status: "Independent" },
      { skillDefinitionId: "skill-milk", status: "Proficient" },
    ], 82, "T2", 4, 4),
    employee("employee-2", "Bob", [
      { skillDefinitionId: "skill-tea", status: "Training" },
      { skillDefinitionId: "skill-milk", status: "NotTrained" },
      { skillDefinitionId: "skill-cup", status: "Proficient" },
    ], 91, "T1", 5, 2),
    employee("employee-3", "No Score", [], null, null, null, null),
  ],
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container.remove();
  root = null;
  vi.restoreAllMocks();
});

describe("RosterSkillBoardPage", () => {
  it("renders a compact Chinese skill-first matrix with score actions and no legacy fields", async () => {
    vi.spyOn(evaluationRepository, "fetchRosterSkillBoard").mockResolvedValue(data);
    root = createRoot(container);

    await act(async () => {
      root?.render(<MemoryRouter><RosterSkillBoardPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("排班技能板");
    expect(container.textContent).toContain("开茶");
    expect(container.textContent).toContain("奶吧");
    expect(container.textContent).toContain("员工");
    expect(container.textContent).toContain("综合评分");
    expect(container.textContent).toContain("后厨");
    expect(container.textContent).toContain("水吧");
    expect(container.textContent).toContain("操作能力");
    expect(container.textContent).toContain("HandoverEmployee016");
    expect(container.textContent).toContain("82.0");
    expect(container.textContent).toContain("未评分");
    expect(container.textContent).toContain("再次评分");
    expect(container.textContent).toContain("去评分");
    expect(container.textContent).toContain("2/2 可排 · 1 未确认");
    expect(container.textContent).toContain("3 项未确认");
    expect(container.querySelector('[aria-label="状态未确认: 未确认"]')?.textContent).toBe("?");
    expect(container.querySelector('a[href="/employees/employee-1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/employees/employee-1/evaluation/v1/new"]')).toBeTruthy();
    expect(container.querySelectorAll("colgroup col")).toHaveLength(data.skillDefinitions.length + 2);
    expect(container.textContent).not.toMatch(/Grade|AI Risk|Synthetic|Manual Weighted|Attendance|Pressure|Teamwork|BackKitchen|Back Kitchen|Qualifications|Opening|Closing|Weekly|Score Now|Continue Draft|Not Evaluated/i);
  });

  it("combines multiple SkillDefinition filters for roster decisions", async () => {
    vi.spyOn(evaluationRepository, "fetchRosterSkillBoard").mockResolvedValue(data);
    root = createRoot(container);

    await act(async () => {
      root?.render(<MemoryRouter><RosterSkillBoardPage /></MemoryRouter>);
      await Promise.resolve();
    });

    const milkBar = [...container.querySelectorAll("input[type='checkbox']")]
      .find((input) => input.parentElement?.textContent?.includes("奶吧")) as HTMLInputElement;
    const cupLabeling = [...container.querySelectorAll("input[type='checkbox']")]
      .find((input) => input.parentElement?.textContent?.includes("贴杯")) as HTMLInputElement;

    await act(async () => {
      milkBar.click();
      cupLabeling.click();
    });

    expect(container.textContent).toContain("没有符合筛选条件的员工");
    expect(container.textContent).not.toContain("HandoverEmployee016");
    expect(container.textContent).not.toContain("Bob");
  });

  it("initializes from storeId query and allows multi-store switching", async () => {
    const fetchBoard = vi.spyOn(evaluationRepository, "fetchRosterSkillBoard")
      .mockResolvedValue({
        ...data,
        stores: [
          ...data.stores,
          { id: "store-2", name: "Chatswood", region: "Sydney", managerName: "Kelly", city: "Sydney" },
        ],
      });
    root = createRoot(container);

    await act(async () => {
      root?.render(<MemoryRouter initialEntries={["/skill-board?storeId=store-1"]}><RosterSkillBoardPage /></MemoryRouter>);
      await Promise.resolve();
    });

    expect(fetchBoard).toHaveBeenCalledWith("store-1");

    const storeSelect = container.querySelector('button[role="combobox"][aria-labelledby]') as HTMLButtonElement;
    await act(async () => {
      storeSelect.focus();
      storeSelect.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      await Promise.resolve();
      const chatswood = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent?.includes("Chatswood"));
      expect(chatswood).toBeTruthy();
      chatswood?.click();
      await Promise.resolve();
    });

    expect(fetchBoard).toHaveBeenLastCalledWith("store-2");
  });
});

function skill(id: string, code: string, category: string, displayOrder: number) {
  return { id, code, nameZh: code, nameEn: code, category, displayOrder, isActive: true };
}

function employee(
  employeeId: string,
  name: string,
  skills: Array<{ skillDefinitionId: string; status: "NotTrained" | "Training" | "Independent" | "Proficient" }>,
  overallScore: number | null,
  tier: "T1" | "T2" | "T3" | "T4" | "T5" | null,
  speedRating: number | null,
  availabilityRating: number | null,
) {
  return {
    employeeId,
    displayName: name,
    storeId: "store-1",
    storeName: "Hurstville",
    employmentType: "PartTime" as const,
    status: "Active" as const,
    employeeType: "REGULAR" as const,
    latestEvaluation: overallScore == null ? null : {
      id: `eval-${employeeId}`,
      overallScore,
      tier,
      speedRating,
      initiativeRating: 4,
      attitudeRating: 5,
      availabilityRating,
      skillCoverage: 0.8,
      completedAt: "2026-08-12T00:00:00.000Z",
      employeeTypeSnapshot: "REGULAR" as const,
    },
    skills: skills.map((item) => ({
      ...item,
      skillCode: item.skillDefinitionId,
      category: "Back Kitchen",
      updatedAt: "2026-08-12T00:00:00.000Z",
    })),
  };
}

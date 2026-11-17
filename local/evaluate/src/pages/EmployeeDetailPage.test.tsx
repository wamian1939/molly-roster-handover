// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "../services/evaluationRepository";
import type { EmployeeEvaluationSummary, EvaluationV1 } from "../types/evaluation";
import { EmployeeDetailPage } from "./EmployeeDetailPage";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    user: { accountId: "manager-1", role: "STORE_EVALUATOR", storeId: "store-1" },
    isLoading: false,
  }),
}));

const snapshotSkill = {
  skillDefinitionId: "skill-tea",
  skillCode: "tea",
  skillNameZh: "开茶",
  skillNameEn: "Tea Preparation",
  category: "BackKitchen",
  status: "Independent" as const,
  weight: 1.5,
};

function v1Evaluation(): EvaluationV1 {
  return {
    id: "v1-1",
    roundId: "round-1",
    employeeId: "emp-1",
    employeeName: "HandoverEmployee016 Snapshot",
    storeId: "store-1",
    storeName: "Hurstville Snapshot",
    status: "Completed",
    scoringVersion: "v1",
    employeeTypeSnapshot: "REGULAR",
    round: { id: "round-1", status: "CLOSED", eligibleCount: 2, completedCount: 2 },
    // This CLOSED historical snapshot keeps its legacy policy; current live-round fixtures use REGULAR_V3.
    policy: { skillWeight: 50, speedWeight: 12, initiativeWeight: 10, attitudeWeight: 10, availabilityWeight: 8, textWeight: 10 },
    ratings: { speed: 4, initiative: 4, attitude: 5, availability: 3 },
    textFeedback: "最近水吧速度提升明显。",
    textScoreSource: "Ai",
    scores: {
      skillScore: 41,
      speedScore: 9.6,
      initiativeScore: 8,
      attitudeScore: 10,
      availabilityScore: 4.8,
      textScore: 8,
      overallScore: 81.4,
      tier: "T2",
    },
    skillCoverage: 0.8,
    skills: [snapshotSkill],
    ai: {
      runId: "run-1",
      status: "Success",
      textScore: 8,
      error: null,
      evidence: [{ type: "Positive", dimension: "speed", skillCode: null, message: "Speed", confidence: 0.9 }],
    },
    evaluatorId: "manager-1",
    evaluatorNameSnapshot: "Manager",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    completedAt: "2026-08-12T00:00:00.000Z",
    version: 3,
  };
}

function summary(overrides: Partial<EmployeeEvaluationSummary> = {}): EmployeeEvaluationSummary {
  const evaluation = v1Evaluation();
  return {
    employee: {
      id: "emp-1",
      storeId: "store-1",
      storeName: "Hurstville",
      displayName: "HandoverEmployee016",
      employmentType: "Part-time",
      employmentCommencementDate: "2025-01-01",
      tenureMonths: 19,
      status: "Active",
      employeeType: "REGULAR",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
      jobs: [],
    },
    currentSkillProfileInitialized: true,
    currentSkillsUpdatedAt: "2026-08-13T00:00:00.000Z",
    currentSkills: [{ ...snapshotSkill, status: "Proficient", updatedAt: "2026-08-13T00:00:00.000Z" }],
    latestEvaluation: evaluation,
    officialScore: { score: 81.4, tier: "T2", roundId: "round-1", closedAt: "2026-08-12T00:00:00.000Z", employeeTypeSnapshot: "REGULAR", skillCoverage: 0.8 },
    latestRound: {
      id: "round-1",
      employee: { id: "emp-1", displayName: "HandoverEmployee016 Snapshot" },
      store: { id: "store-1", name: "Hurstville Snapshot" },
      employeeTypeSnapshot: "REGULAR",
      scoringVersion: "v1",
      policy: evaluation.policy,
      status: "CLOSED",
      createdAt: "2026-08-01T00:00:00.000Z",
      closedAt: "2026-08-12T00:00:00.000Z",
      completedCount: 2,
      eligibleCount: 2,
      isComplete: true,
      aggregateStatus: "FINAL",
      aggregateOverall: 81.4,
      aggregateTier: "T2",
      aggregateSkillCoverage: 0.8,
      components: { skill: 41, speed: 9.6, initiative: 8, attitude: 10, availability: 4.8, text: 8, normalized: { skill: 82, speed: 80, initiative: 80, attitude: 100, availability: 60, text: 80 } },
      distribution: { highest: 84, lowest: 78.8, spread: 5.2 },
      evaluators: [],
    },
    history: [{
      id: "v1-1",
      scoringVersion: "v1",
      employeeId: "emp-1",
      employeeName: "HandoverEmployee016 Snapshot",
      storeId: "store-1",
      storeName: "Hurstville Snapshot",
      completedAt: "2026-08-12T00:00:00.000Z",
      employeeTypeSnapshot: "REGULAR",
      overallScore: 81.4,
      tier: "T2",
      skillScore: 41,
      skillCoverage: 0.8,
    }],
    ...overrides,
  };
}

let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  const mountedRoot = root;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  container.remove();
  root = null;
  vi.restoreAllMocks();
});

async function renderPage(data: EmployeeEvaluationSummary) {
  vi.spyOn(evaluationRepository, "fetchEmployeeEvaluationSummary").mockResolvedValue(data);
  const mountedRoot = createRoot(container);
  root = mountedRoot;
  await act(async () => {
    mountedRoot.render(
      <MemoryRouter initialEntries={["/employees/emp-1"]}>
        <Routes><Route path="/employees/:employeeId" element={<EmployeeDetailPage />} /></Routes>
      </MemoryRouter>,
    );
    await Promise.resolve();
  });
}

describe("EmployeeDetailPage", () => {
  it("does not render sensitive HR fields for a STORE_EVALUATOR", async () => {
    await renderPage(summary());
    expect(container.textContent).not.toMatch(/TFN|BSB|银行账号|Super 账号|出生日期|Address/);
  });
  it("links CLOSED Round history to Round Detail with an employee-detail return context", async () => {
    const base = summary();
    await renderPage(summary({ history: [{ ...base.history[0], id: "round-1", roundId: "round-1", roundNumber: 1 }] }));

    const link = container.querySelector<HTMLAnchorElement>('a[href^="/evaluation-rounds/round-1"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toContain("source=employee-detail");
    expect(link?.getAttribute("href")).toContain("returnTo=%2Femployees%2Femp-1");
    expect(container.querySelector('button[disabled][aria-expanded]')).toBeNull();
  });

  it("shows current skills, latest Completed score, coverage, and separate timestamps", async () => {
    await renderPage(summary());

    expect(container.textContent).toContain("81.4");
    expect(container.textContent).toContain("T2");
    expect(container.textContent).toContain("80%");
    expect(container.textContent).toContain("当前技能");
    expect(container.textContent).toContain("熟练");
    expect(container.textContent).toContain("更新于");
    expect(container.textContent).toContain("完成于 2026年8月12日");
    expect(container.textContent).toContain("当前技能");
  });

  it("shows server-saved scores, ratings and AI evidence while remaining read-only", async () => {
    await renderPage(summary());

    expect(container.textContent).toContain("9.6 / 12");
    expect(container.textContent).toContain("8.0 / 10");
    expect(container.textContent).toContain("4 / 5");
    expect(container.textContent).toContain("3 / 5");
    expect(container.textContent).toContain("最近水吧速度提升明显");
    expect(container.textContent).toContain("正向依据");
    expect(container.querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(container.textContent).not.toContain("Analyze");
    expect(container.textContent).not.toContain("Apply");
    expect(container.textContent).not.toContain("Legacy");
    expect(container.textContent).not.toContain("Grade");
  });

  it("keeps the historical skill snapshot distinct from the current profile", async () => {
    await renderPage(summary());
    const historyButton = container.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
    expect(historyButton).toBeTruthy();
    await act(async () => historyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("技能快照");
    expect(container.textContent).toContain("可独立");
    expect(container.textContent).toContain("当前技能变化不会影响该历史记录");
  });

  it("shows honest empty states without synthesizing skills or a score", async () => {
    await renderPage(summary({
      currentSkillProfileInitialized: false,
      currentSkillsUpdatedAt: null,
      currentSkills: [],
      latestEvaluation: null,
      latestRound: null,
      officialScore: null,
      history: [],
    }));

    expect(container.textContent).toContain("技能画像尚未初始化");
    expect(container.textContent).toContain("尚无历史评分");
    expect(container.textContent).not.toContain("未培训");
  });

  it("separates the current employee type from the latest evaluation snapshot", async () => {
    await renderPage(summary({ employee: { ...summary().employee, employeeType: "TRAINING" } }));

    expect(container.textContent).toContain("当前员工类型");
    expect(container.textContent).toContain("最近轮次标准");
    expect(container.textContent).toContain("当前类型已变化");
  });

  it("shows a transferred employee's official score without exposing the former store history", async () => {
    await renderPage(summary({
      latestEvaluation: null,
      latestRound: null,
      history: [],
      officialScore: { score: 77.5, tier: "T2", roundId: "prior-store-round", closedAt: "2026-08-12T00:00:00.000Z", employeeTypeSnapshot: "REGULAR", skillCoverage: 0.8 },
    }));
    expect(container.textContent).toContain("77.5");
    expect(container.textContent).toContain("T2");
    expect(container.textContent).toContain("当前门店暂无个人评分快照");
    expect(container.querySelector('a[href*="prior-store-round"]')).toBeNull();
  });
});

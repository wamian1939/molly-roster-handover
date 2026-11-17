// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "../services/evaluationRepository";
import type { EvaluationRoundAggregate } from "../types/evaluation";
import { EvaluationRoundDetailPage } from "./EvaluationRoundDetailPage";
import { ToastProvider } from "../components/ui/ToastProvider";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { role: "ADMIN" } }),
}));

const round: EvaluationRoundAggregate = {
  id: "round-1",
  roundNumber: 1,
  employee: { id: "employee-1", displayName: "HandoverEmployee006" },
  store: { id: "hurstville", name: "Hurstville" },
  employeeTypeSnapshot: "REGULAR",
  scoringVersion: "v1",
  policy: { skillWeight: 60, speedWeight: 15, initiativeWeight: 5, attitudeWeight: 5, availabilityWeight: 10, textWeight: 5, policyId: "REGULAR_V3", tierPolicyVersion: 2 },
  status: "OPEN",
  createdAt: "2026-09-01T00:00:00.000Z",
  openedAt: "2026-09-01T00:00:00.000Z",
  closedAt: null,
  completedCount: 1,
  eligibleCount: 2,
  isComplete: false,
  aggregateStatus: "PROVISIONAL",
  aggregateOverall: 82.3,
  aggregateTier: "T2",
  aggregateSkillCoverage: 0.8,
  components: { skill: 49.2, speed: 12, initiative: 4, attitude: 5, availability: 7.65, text: 4.45, normalized: { skill: 82, speed: 80, initiative: 80, attitude: 100, availability: 76.5, text: 89 } },
  itemAverages: {
    basis: "SUBMITTED_STORE_EVALUATORS", submittedEvaluatorCount: 1,
    components: { skill: { average: 49.2, maximum: 60, unit: "points" }, speed: { average: 12, maximum: 15, unit: "points" }, initiative: { average: 4, maximum: 5, unit: "points" }, attitude: { average: 5, maximum: 5, unit: "points" }, availability: { average: 7.65, maximum: 10, unit: "points" }, text: { average: 4.45, maximum: 5, unit: "points" } },
    categories: { backOfHouse: { average: 88, maximum: 100, unit: "percent" }, waterBar: { average: 76, maximum: 100, unit: "percent" }, frontOfHouse: { average: 82, maximum: 100, unit: "percent" }, operations: { average: 66.7, maximum: 100, unit: "percent" } },
  },
  distribution: { highest: 82.3, lowest: 82.3, spread: 0 },
  evaluators: [{
    membershipId: "member-1",
    evaluatorAccountId: "evaluator-1",
    evaluatorDisplayName: "Winnie",
    accountActive: true,
    status: "Submitted",
    evaluation: { id: "evaluation-1", status: "Submitted", submittedAt: "2026-09-01T01:00:00.000Z", completedAt: null, overallScore: 82.3, tier: "T2", components: { skill: 49.2, speed: 12, initiative: 4, attitude: 5, availability: 7.65, text: 4.45 }, textFeedback: "Good", skills: [] },
  }],
};

let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  vi.spyOn(evaluationRepository, "fetchEvaluationRoundAggregate").mockResolvedValue(round);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

describe("EvaluationRoundDetailPage", () => {
  it("is aggregate-only, omits qualification opinions, and deep-link falls back to the correct employee list", async () => {
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter initialEntries={["/evaluation-rounds/round-1"]}><Routes><Route path="/evaluation-rounds/:roundId" element={<EvaluationRoundDetailPage />} /></Routes></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("本轮汇总");
    expect(container.textContent).toContain("1 / 2 位门店评分账号已评分");
    expect(container.textContent).toContain("小项目平均分");
    expect(container.textContent).toContain("技能总分 平均分49.2 / 60");
    expect(container.textContent).toContain("操作能力 平均分66.7 / 100%");
    expect(container.textContent).toContain("未评分账号不按 0 分");
    expect(container.textContent).not.toMatch(/岗位资格意见|建议资格|应用本轮岗位资格/);
    expect(container.querySelector('a[href="/evaluations/stores/hurstville/employees/regular"]')?.textContent).toContain("返回正式员工");
    expect(container.querySelector('a[href^="/evaluations/v1/evaluation-1?"]')).toBeTruthy();
  });

  it("closes once, announces success, and immediately renders the frozen state", async () => {
    const closed = { ...round, status: "CLOSED" as const, aggregateStatus: "FINAL" as const, closedAt: "2026-09-02T00:00:00.000Z" };
    vi.spyOn(evaluationRepository, "closeEvaluationRound").mockResolvedValue(closed);
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter initialEntries={["/evaluation-rounds/round-1"]}><ToastProvider><Routes><Route path="/evaluation-rounds/:roundId" element={<EvaluationRoundDetailPage />} /></Routes></ToastProvider></MemoryRouter>);
      await Promise.resolve(); await Promise.resolve();
    });
    const openDialog = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("结束本轮评价"));
    await act(async () => openDialog!.click());
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "结束本轮");
    await act(async () => { confirm!.click(); confirm!.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(evaluationRepository.closeEvaluationRound).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("本轮评价已结束");
    expect(container.textContent).toContain("最终综合评分");
    expect(container.textContent).not.toContain("结束本轮评价");
  });

  it("keeps a CLOSED round fully read-only", async () => {
    vi.mocked(evaluationRepository.fetchEvaluationRoundAggregate).mockResolvedValue({
      ...round,
      status: "CLOSED",
      aggregateStatus: "FINAL",
      identitySources: { employeeName: "EVALUATION_SNAPSHOT", storeName: "CURRENT_PROFILE_FALLBACK" },
      closedAt: "2026-09-02T00:00:00.000Z",
    });
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter initialEntries={["/evaluation-rounds/round-1"]}><Routes><Route path="/evaluation-rounds/:roundId" element={<EvaluationRoundDetailPage />} /></Routes></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("员工姓名取自个人评价记录");
    expect(container.textContent).toContain("门店名称暂用当前资料，历史名称未确认");

    expect(container.textContent).toContain("已结束");
    expect(container.textContent).not.toMatch(/我的评分|再次评分|结束本轮评价/);
  });

  it("keeps the close dialog and OPEN page state when closing fails", async () => {
    vi.spyOn(evaluationRepository, "closeEvaluationRound").mockRejectedValue(new Error("服务器暂时不可用"));
    root = createRoot(container);
    await act(async () => {
      root?.render(<MemoryRouter initialEntries={["/evaluation-rounds/round-1"]}><ToastProvider><Routes><Route path="/evaluation-rounds/:roundId" element={<EvaluationRoundDetailPage />} /></Routes></ToastProvider></MemoryRouter>);
      await Promise.resolve(); await Promise.resolve();
    });
    const openDialog = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("结束本轮评价"));
    await act(async () => openDialog!.click());
    const confirm = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "结束本轮");
    await act(async () => { confirm!.click(); await Promise.resolve(); });
    expect(container.textContent).toContain("临时综合评分");
    expect(document.body.textContent).toContain("本轮结束失败");
    expect(document.body.textContent).toContain("服务器暂时不可用");
    expect(document.body.textContent).toContain("确认结束本轮评价");
  });
});

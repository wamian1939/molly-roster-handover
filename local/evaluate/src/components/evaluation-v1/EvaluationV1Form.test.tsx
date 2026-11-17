// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { EvaluationV1 } from "../../types/evaluation";
import { EvaluationV1Form, type EvaluationV1Repository } from "./EvaluationV1Form";
import { ToastProvider } from "../ui/ToastProvider";
import { ApiRequestError } from "../../services/apiClient";

const context: EvaluationV1 = {
  id: "unsubmitted:round-1:account-1", roundId: "round-1", employeeId: "employee-1", employeeName: "HandoverEmployee006", storeId: "hurstville", storeName: "Hurstville",
  status: "Unsubmitted", scoringVersion: "v1", employeeTypeSnapshot: "REGULAR", round: { id: "round-1", status: "OPEN", eligibleCount: 3, completedCount: 1 },
  policy: { policyId: "REGULAR_V3", tierPolicyVersion: 2, skillWeight: 60, speedWeight: 15, initiativeWeight: 5, attitudeWeight: 5, availabilityWeight: 10, textWeight: 5 },
  ratings: { speed: null, initiative: null, attitude: null, availability: null }, textFeedback: "", textScoreSource: null, scores: null, skillCoverage: null,
  skills: [{ skillDefinitionId: "skill-opening", skillCode: "opening", skillNameZh: "开早", skillNameEn: "Opening", category: "OPERATIONS", skillMode: "BINARY", status: "Unknown", weight: 1 }],
  ai: null, evaluatorId: "account-1", evaluatorNameSnapshot: "Evaluator A", createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z", completedAt: null, version: 0,
};

describe("EvaluationV1Form live scoring", () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  it("does not persist merely by rendering an editable scoring context", async () => {
    const repository: EvaluationV1Repository = {
      previewLiveEvaluation: vi.fn(), previewLiveSkills: vi.fn(), analyzeLiveEvaluationText: vi.fn(), submitLiveEvaluation: vi.fn(),
    };
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><EvaluationV1Form initialEvaluation={context} repository={repository} live /></MemoryRouter>));
    expect(host.textContent).toContain("只有点击提交评分才会写入数据库");
    expect(repository.submitLiveEvaluation).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(repository.submitLiveEvaluation).not.toHaveBeenCalled();
  });

  it("shows current-round submitted state as editable", async () => {
    const repository: EvaluationV1Repository = { previewLiveEvaluation: vi.fn(), previewLiveSkills: vi.fn(), analyzeLiveEvaluationText: vi.fn(), submitLiveEvaluation: vi.fn() };
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><EvaluationV1Form initialEvaluation={{ ...context, status: "Submitted", submittedAt: "2026-09-05T01:00:00.000Z" }} repository={repository} live /></MemoryRouter>));
    expect(host.textContent).toContain("已评分，可再次提交");
    expect(host.textContent).not.toContain("草稿");
    await act(async () => root.unmount());
  });

  it("distinguishes a read-only OPEN submission from a CLOSED historical snapshot", async () => {
    const repository: EvaluationV1Repository = { previewLiveEvaluation: vi.fn(), previewLiveSkills: vi.fn(), analyzeLiveEvaluationText: vi.fn(), submitLiveEvaluation: vi.fn() };
    const host = document.createElement("div");
    const root = createRoot(host);
    const submitted = {
      ...context,
      status: "Submitted" as const,
      submittedAt: "2026-09-05T01:00:00.000Z",
      skills: [{ ...context.skills[0], status: "CanDo" as const }],
      scores: { skillScore: 60, speedScore: 15, initiativeScore: 5, attitudeScore: 5, availabilityScore: 10, textScore: 5, overallScore: 100, tier: "T1" as const },
      skillCoverage: 1,
    };

    await act(async () => root.render(<MemoryRouter><EvaluationV1Form initialEvaluation={submitted} repository={repository} live forceReadOnly /></MemoryRouter>));
    expect(host.textContent).toContain("当前评分 · 只读");
    expect(host.textContent).toContain("这是当前轮次的最新评分详情");
    expect(host.textContent).toContain("可排岗位 1 / 1");
    expect(host.textContent).not.toContain("本轮已结束");
    expect(host.textContent).not.toContain("已完成");

    await act(async () => root.render(<MemoryRouter><EvaluationV1Form key="closed" initialEvaluation={{ ...submitted, round: { ...submitted.round!, status: "CLOSED" } }} repository={repository} live forceReadOnly /></MemoryRouter>));
    expect(host.textContent).toContain("历史快照");
    expect(host.textContent).toContain("本轮已结束，该评分已冻结");
    expect(host.textContent).toContain("已完成");
    await act(async () => root.unmount());
  });

  it("refreshes the skill score and operations breakdown without requiring ratings", async () => {
    vi.useFakeTimers();
    const previewLiveSkills = vi.fn(async () => ({
      componentScore: 60,
      maxScore: 60,
      overallRatio: 1,
      skillCoverage: { capableSkills: 1, activeSkills: 1, ratio: 1, percentage: 100 },
      skillCategories: {
        backOfHouse: { ratio: null, percentage: null, weightedRaw: 0, weightedMax: 0, confirmedCount: 0, totalCount: 0, capableCount: 0 },
        waterBar: { ratio: null, percentage: null, weightedRaw: 0, weightedMax: 0, confirmedCount: 0, totalCount: 0, capableCount: 0 },
        frontOfHouse: { ratio: null, percentage: null, weightedRaw: 0, weightedMax: 0, confirmedCount: 0, totalCount: 0, capableCount: 0 },
        operations: { ratio: 1, percentage: 100, weightedRaw: 1, weightedMax: 1, confirmedCount: 1, totalCount: 1, capableCount: 1 },
      },
    }));
    const repository: EvaluationV1Repository = { previewLiveEvaluation: vi.fn(), previewLiveSkills, analyzeLiveEvaluationText: vi.fn(), submitLiveEvaluation: vi.fn() };
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><EvaluationV1Form initialEvaluation={context} repository={repository} live /></MemoryRouter>));
    const canDo = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((button) => button.textContent?.trim() === "会");
    expect(canDo).toBeDefined();
    await act(async () => canDo!.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(previewLiveSkills).toHaveBeenLastCalledWith("round-1", { skills: [{ skillDefinitionId: "skill-opening", status: "CanDo" }] });
    expect(host.textContent).toContain("技能总分 60.0 / 60");
    expect(host.textContent).toContain("操作能力1 / 1");
    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  it("prevents double submit and announces a first submission while synchronizing the saved score", async () => {
    let resolveSubmit!: (value: EvaluationV1) => void;
    const saved = submittedContext(82);
    const submitLiveEvaluation = vi.fn(() => new Promise<EvaluationV1>((resolve) => { resolveSubmit = resolve; }));
    const repository: EvaluationV1Repository = { previewLiveEvaluation: vi.fn(), previewLiveSkills: vi.fn(), analyzeLiveEvaluationText: vi.fn(), submitLiveEvaluation };
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><ToastProvider><EvaluationV1Form initialEvaluation={completeContext()} repository={repository} live /></ToastProvider></MemoryRouter>));
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === "提交评分")!;
    await act(async () => { button.click(); button.click(); });
    expect(submitLiveEvaluation).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(host.textContent).toContain("正在提交…");
    await act(async () => { resolveSubmit(saved); await Promise.resolve(); });
    expect(host.textContent).toContain("评分已提交");
    expect(host.textContent).toContain("最新评分已保存到本轮评价中");
    expect(host.textContent).toContain("82.0");
    await act(async () => root.unmount());
  });

  it("announces an update separately and keeps the editable form after a server failure", async () => {
    const repository: EvaluationV1Repository = { previewLiveEvaluation: vi.fn(), previewLiveSkills: vi.fn(), analyzeLiveEvaluationText: vi.fn(), submitLiveEvaluation: vi.fn().mockRejectedValue(new ApiRequestError("Unavailable", 503)) };
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><ToastProvider><EvaluationV1Form initialEvaluation={submittedContext(76)} repository={repository} live /></ToastProvider></MemoryRouter>));
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === "更新评分")!;
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(host.textContent).toContain("评分提交失败");
    expect(host.textContent).toContain("本次修改尚未保存");
    expect(button.disabled).toBe(false);
    expect(host.textContent).toContain("76.0");
    await act(async () => root.unmount());
  });

  it("announces a successful update with the old and new current-round scores", async () => {
    const repository: EvaluationV1Repository = { previewLiveEvaluation: vi.fn(), previewLiveSkills: vi.fn(), analyzeLiveEvaluationText: vi.fn(), submitLiveEvaluation: vi.fn().mockResolvedValue(submittedContext(82)) };
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><ToastProvider><EvaluationV1Form initialEvaluation={submittedContext(76)} repository={repository} live /></ToastProvider></MemoryRouter>));
    const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === "更新评分")!;
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(host.textContent).toContain("评分已更新");
    expect(host.textContent).toContain("76.0 → 82.0");
    expect(button.getAttribute("aria-busy")).toBe("false");
    await act(async () => root.unmount());
  });
});

function completeContext(): EvaluationV1 {
  return { ...context, ratings: { speed: 5, initiative: 5, attitude: 5, availability: 5 }, skills: [{ ...context.skills[0], status: "CanDo" }] };
}

function submittedContext(score: number): EvaluationV1 {
  return {
    ...completeContext(), status: "Submitted", submittedAt: "2026-09-05T01:00:00.000Z", skillCoverage: 1,
    scores: { skillScore: score * 0.6, speedScore: score * 0.15, initiativeScore: score * 0.05, attitudeScore: score * 0.05, availabilityScore: score * 0.1, textScore: score * 0.05, overallScore: score, tier: "T2" },
  };
}

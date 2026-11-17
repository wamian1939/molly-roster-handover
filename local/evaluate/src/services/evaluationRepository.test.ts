import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluationRepository } from "./evaluationRepository";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("evaluationRepository V1 business contracts", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the Store roster from the V1-only read endpoint", async () => {
    const response = {
      store: { id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney" },
      summary: { totalEmployees: 2, evaluatedEmployees: 1, submittedEmployees: 1, averageScore: 82.4 },
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));

    await expect(evaluationRepository.fetchStoreEvaluations("store-1", {
      status: "Completed",
      search: "HandoverEmployee016",
    })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/stores/store-1/evaluations?");
    expect(url).not.toContain("period=");
    expect(url).toContain("status=Completed");
    expect(url).not.toMatch(/grade|risk|synthetic/i);
  });

  it("fails closed without returning fallback roster rows", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network unavailable"));

    await expect(evaluationRepository.fetchStoreEvaluations("store-1"))
      .rejects.toThrow("无法连接服务器，请稍后重试。");
  });

  it("loads only the completed V1 History index contract", async () => {
    const history = { items: [{
      id: "eval-1",
      employeeId: "employee-1",
      employeeName: "HandoverEmployee016",
      storeId: "store-1",
      storeName: "Hurstville",
      evaluatorId: "manager-1",
      evaluatorName: "Winnie",
      overallScore: 82.4,
      tier: "T2",
      skillCoverage: 0.8,
      completedAt: "2026-08-13T01:00:00.000Z",
    }], page: 1, pageSize: 25, total: 1, totalPages: 1 };
    fetchMock.mockResolvedValueOnce(jsonResponse(history));

    await expect(evaluationRepository.fetchHistoryIndex()).resolves.toEqual(history);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/evaluation-rounds/history");
  });

  it("does not expose stale History when the API is unavailable", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network unavailable"));
    await expect(evaluationRepository.fetchHistoryIndex()).rejects.toThrow("无法连接服务器，请稍后重试。");
  });

  it("starts a scoring context and upserts only through live round endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ roundId: "round-1", status: "Unsubmitted" }))
      .mockResolvedValueOnce(jsonResponse({ id: "eval-1", roundId: "round-1", status: "Submitted" }));

    await evaluationRepository.startLiveScoring("employee-1");
    await evaluationRepository.submitLiveEvaluation("round-1", {
      speedRating: 3,
      initiativeRating: 3,
      attitudeRating: 3,
      availabilityRating: 3,
      textFeedback: "",
      skills: [{ skillDefinitionId: "skill-1", status: "Independent" }],
    });

    const [startUrl, startInit] = fetchMock.mock.calls[0] ?? [];
    const [submitUrl, submitInit] = fetchMock.mock.calls[1] ?? [];
    expect(String(startUrl)).toContain("/employees/employee-1/scoring-context");
    expect(startInit?.method).toBe("POST");
    expect(String(submitUrl)).toContain("/evaluation-rounds/round-1/my-evaluation");
    expect(submitInit?.method).toBe("PUT");
  });

  it("preserves HTTP errors instead of treating authorization failures as fallback", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Forbidden" }, 403));
    await expect(evaluationRepository.fetchHistoryIndex()).rejects.toEqual(
      expect.objectContaining({ status: 403, message: "Forbidden" }),
    );
  });
});

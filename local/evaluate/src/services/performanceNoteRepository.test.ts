import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { performanceNoteRepository, type PerformanceNoteMutationPayload } from "./performanceNoteRepository";

const noteResponse = {
  id: "note-1",
  employeeId: "emp-1",
  employeeName: "Molly Carter",
  employeeStatus: "Active",
  storeId: "store-1",
  storeName: "Downtown",
  authorId: "manager-1",
  noteDate: "2026-06-12T00:00:00.000Z",
  noteType: "Positive",
  dimensions: ["initiative"],
  scoreImpact: 5,
  noteText: "Handled a rush calmly.",
  createdAt: "2026-06-12T00:00:00.000Z",
  updatedAt: "2026-06-12T00:00:00.000Z",
};

const payload: PerformanceNoteMutationPayload = {
  employeeId: "emp-1",
  storeId: "store-1",
  noteType: "Positive",
  dimensions: ["initiative"],
  scoreImpact: 5,
  noteText: "Handled a rush calmly.",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => jsonResponse(body, status));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("performanceNoteRepository contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listPerformanceNotes builds filter query parameters and uses the session cookie", async () => {
    const fetchMock = mockFetchOnce({ items: [noteResponse], page: 2, pageSize: 10, total: 11, totalPages: 2 });

    const response = await performanceNoteRepository.listPerformanceNotes({
      employeeId: "emp-1",
      storeId: "store-1",
      noteType: "Positive",
      dimension: "initiative",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-12",
      page: 2,
      pageSize: 10,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/performance-notes?employeeId=emp-1&storeId=store-1&noteType=Positive&dimension=initiative&dateFrom=2026-06-01&dateTo=2026-06-12&page=2&pageSize=10",
      expect.objectContaining({
        credentials: "include",
      }),
    );
    expect(response.items[0]).toMatchObject(noteResponse);
  });

  it("getPerformanceNotesForEmployee calls the employee-scoped endpoint", async () => {
    const fetchMock = mockFetchOnce({ items: [noteResponse], page: 1, pageSize: 5, total: 1, totalPages: 1 });

    await performanceNoteRepository.getPerformanceNotesForEmployee("emp-1", { storeId: "store-1", pageSize: 5 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/employees/emp-1/performance-notes?storeId=store-1&pageSize=5",
      expect.any(Object),
    );
  });

  it("createPerformanceNote calls the write endpoint", async () => {
    const fetchMock = mockFetchOnce(noteResponse, 201);

    const created = await performanceNoteRepository.createPerformanceNote(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/performance-notes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(created).toMatchObject(noteResponse);
  });

  it("fails closed without returning mock notes when the API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("API unavailable");
      }),
    );

    await expect(performanceNoteRepository.listPerformanceNotes({ page: 2, pageSize: 5 }))
      .rejects.toThrow("无法连接服务器，请稍后重试。");
  });

  it("403 does not fallback to mock", async () => {
    mockFetchOnce({ message: "Access to store store-2 is forbidden." }, 403);

    await expect(performanceNoteRepository.listPerformanceNotes({ storeId: "store-2" })).rejects.toThrow(
      "Access to store store-2 is forbidden.",
    );
  });

  it("createPerformanceNote never fallback to mock when API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("API unavailable");
      }),
    );

    await expect(performanceNoteRepository.createPerformanceNote(payload))
      .rejects.toThrow("无法连接服务器，请稍后重试。");
  });
});

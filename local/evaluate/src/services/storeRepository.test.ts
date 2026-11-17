// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { storeRepository } from "./storeRepository";

describe("storeRepository archive contract", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses archive/reactivate POST endpoints and never a destructive DELETE", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "store-1", isActive: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "store-1", isActive: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));

    await storeRepository.archiveStore("store-1");
    await storeRepository.reactivateStore("store-1");

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/stores/store-1/archive");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/stores/store-1/reactivate");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(false);
  });

  it("requests archived stores only when the admin opts in", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await storeRepository.fetchStoresForManagement(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/stores/manage?includeArchived=1");
  });
});

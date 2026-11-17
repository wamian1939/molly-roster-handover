import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { employeeRepository, type EmployeeMutationPayload } from "./employeeRepository";

const employeeResponse = {
  id: "emp-1",
  storeId: "store-1",
  storeName: "Downtown",
  displayName: "Molly Carter",
  employmentType: "Full-time",
  employmentCommencementDate: "2023-01-01",
  tenureMonths: 43,
  status: "Active",
  employeeType: "REGULAR",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  evaluationCount: 1,
};

const payload: EmployeeMutationPayload = {
  storeId: "store-1",
  displayName: "Molly Carter",
  employmentType: "Full-time",
  status: "Active",
  employeeType: "REGULAR",
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

describe("employeeRepository contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchEmployees builds expected query parameters", async () => {
    const fetchMock = mockFetchOnce({
      items: [employeeResponse],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });

    const response = await employeeRepository.fetchEmployees({
      storeId: "store-1",
      page: 2,
      pageSize: 10,
      search: "molly",
      employmentType: "Full-time",
      status: "Active",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/employees?storeId=store-1&page=2&pageSize=10&search=molly&employmentType=Full-time&status=Active",
      expect.any(Object),
    );
    expect(response.items[0]).toMatchObject(employeeResponse);
  });

  it("uses the session cookie for employee API requests", async () => {
    const fetchMock = mockFetchOnce({
      items: [employeeResponse],
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
    });

    await employeeRepository.fetchEmployees();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/employees?",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("fetchEmployeesByStore calls the store-scoped endpoint", async () => {
    const fetchMock = mockFetchOnce({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 });

    await employeeRepository.fetchEmployeesByStore("store-1", { status: "Archived" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/stores/store-1/employees?status=Archived",
      expect.any(Object),
    );
  });

  it("fails closed without exposing mock employees when the API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("API unavailable");
      }),
    );

    await expect(employeeRepository.fetchEmployees({ storeId: "store-downtown" }))
      .rejects.toThrow("无法连接服务器，请稍后重试。");
  });

  it("read methods do not fallback on forbidden responses", async () => {
    mockFetchOnce({ message: "Access to store store-2 is forbidden." }, 403);

    await expect(employeeRepository.fetchEmployees()).rejects.toThrow("Access to store store-2 is forbidden.");
  });

  it("createEmployee calls the expected endpoint", async () => {
    const fetchMock = mockFetchOnce(employeeResponse, 201);

    await employeeRepository.createEmployee(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/employees",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("updateEmployee calls the expected endpoint", async () => {
    const fetchMock = mockFetchOnce({ ...employeeResponse, displayName: "HandoverEmployee003" });

    await employeeRepository.updateEmployee("emp-1", { displayName: "HandoverEmployee003", expectedUpdatedAt: "2026-05-02T00:00:00.000Z" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/employees/emp-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ displayName: "HandoverEmployee003", expectedUpdatedAt: "2026-05-02T00:00:00.000Z" }),
      }),
    );
  });

  it("promotes a training employee through the explicit transition endpoint", async () => {
    const fetchMock = mockFetchOnce({ ...employeeResponse, employeeType: "REGULAR" });
    await employeeRepository.promoteToRegular("emp-1");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/employees/emp-1/promote-to-regular"), expect.objectContaining({ method: "POST" }));
  });

  it("archiveEmployee and restoreEmployee call write endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ...employeeResponse, status: "Archived" }))
      .mockResolvedValueOnce(jsonResponse(employeeResponse));
    vi.stubGlobal("fetch", fetchMock);

    await employeeRepository.archiveEmployee("emp-1");
    await employeeRepository.restoreEmployee("emp-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:4000/api/employees/emp-1/archive",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:4000/api/employees/emp-1/restore",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("write operations never fallback to mock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("API unavailable");
      }),
    );

    await expect(employeeRepository.createEmployee(payload)).rejects.toThrow("无法连接服务器，请稍后重试。");
    await expect(employeeRepository.archiveEmployee("emp-1")).rejects.toThrow("无法连接服务器，请稍后重试。");
    await expect(employeeRepository.restoreEmployee("emp-1")).rejects.toThrow("无法连接服务器，请稍后重试。");
  });
});

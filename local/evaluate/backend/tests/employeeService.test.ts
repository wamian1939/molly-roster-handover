import { describe, expect, it, vi } from "vitest";
import { EmployeeService } from "../src/employeeService.js";

type EmployeeRow = ReturnType<typeof employeeRow>;

function store(overrides = {}) {
  return {
    id: "store-1",
    name: "Downtown",
    region: "Central",
    managerName: "Amelia",
    city: "Sydney",
    isActive: true,
    ...overrides,
  };
}

function employeeRow(overrides: Record<string, unknown> = {}) {
  const baseStore = store();
  return {
    id: "emp-1",
    storeId: baseStore.id,
    displayName: "Molly Carter",
    surname: null,
    givenName: null,
    englishName: null,
    gender: null,
    dateOfBirth: null,
    emailAddress: null,
    mobileTelephoneNumber: null,
    addressLine: null,
    suburb: null,
    state: null,
    postcode: null,
    employmentCommencementDate: new Date("2023-01-01T00:00:00.000Z"),
    bankAccountName: null,
    bsbNumber: null,
    bankAccountNumber: null,
    taxFileNumber: null,
    abn: null,
    holdsWorkingHolidayVisa: null,
    visaType: null,
    superannuationCompany: null,
    superannuationAccountNumber: null,
    uniqueSuperannuationIdentifier: null,
    employmentType: "FullTime",
    employeeType: "REGULAR",
    status: "Active",
    openingQualified: false,
    closingQualified: false,
    weeklyCleaningQualified: false,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
    archivedAt: null,
    store: baseStore,
    _count: { evaluations: 0 },
    jobAssignments: [],
    ...overrides,
  };
}

function createDb(initialRows: EmployeeRow[] = []) {
  const rows = [...initialRows];
  const stores = [store(), store({ id: "store-2", name: "Harbor" })];
  const evaluations = [{
    id: "eval-1",
    employeeId: "emp-1",
    scoringVersion: "v1",
    evaluationStatus: "Completed",
  }];
  const evaluationRounds: Array<{ id: string; employeeId: string; status: "OPEN" | "CLOSED" }> = [];

  const db = {
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async () => [{ isActive: true }]),
    store: {
      findUnique: vi.fn(async ({ where }) => stores.find((item) => item.id === where.id) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }) => stores.find((item) => item.id === where.id)!),
    },
    employee: {
      count: vi.fn(async ({ where } = {}) => applyWhere(rows, where).length),
      findMany: vi.fn(async ({ where, skip = 0, take } = {}) =>
        applyWhere(rows, where).slice(skip, take ? skip + take : undefined),
      ),
      findUnique: vi.fn(async ({ where, include } = {}) => {
        const row = rows.find((item) => item.id === where.id) ?? null;
        if (!row) return null;
        return include?._count
          ? { ...row, _count: { evaluations: evaluations.filter((item) => item.employeeId === row.id).length } }
          : row;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error("not found");
        return row;
      }),
      create: vi.fn(async ({ data }) => {
        const row = employeeRow({
          ...data,
          jobAssignments: [],
          id: data.id ?? "generated-employee",
          store: stores.find((item) => item.id === data.storeId),
          createdAt: new Date("2026-05-03T00:00:00.000Z"),
          updatedAt: new Date("2026-05-03T00:00:00.000Z"),
          _count: { evaluations: 0 },
        });
        rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }) => {
        const index = rows.findIndex((item) => item.id === where.id);
        if (index < 0) throw new Error("not found");
        rows[index] = {
          ...rows[index],
          ...data,
          store: stores.find((item) => item.id === (data.storeId ?? rows[index].storeId)),
          updatedAt: new Date("2026-05-04T00:00:00.000Z"),
        };
        return rows[index];
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        const index = rows.findIndex((item) => item.id === where.id
          && item.updatedAt.getTime() === where.updatedAt.getTime()
          && (!where.status || item.status === where.status)
          && (!where.employeeType || item.employeeType === where.employeeType));
        if (index < 0) return { count: 0 };
        rows[index] = {
          ...rows[index], ...data,
          store: stores.find((item) => item.id === (data.storeId ?? rows[index].storeId)),
        };
        return { count: 1 };
      }),
    },
    evaluation: {
      findFirst: vi.fn(async ({ where }) => evaluations.find((item) =>
        item.employeeId === where.employeeId &&
        item.scoringVersion === where.scoringVersion &&
        item.evaluationStatus === where.evaluationStatus,
      ) ?? null),
    },
    evaluationRound: {
      findMany: vi.fn(async () => evaluationRounds),
      updateMany: vi.fn(async () => ({ count: evaluationRounds.length })),
      findFirst: vi.fn(async ({ where }) => evaluationRounds.find((item) =>
        item.employeeId === where.employeeId && item.status === where.status,
      ) ?? null),
    },
    employeeJobAssignment: { deleteMany: vi.fn(async () => ({ count: 0 })), createMany: vi.fn(async () => ({ count: 0 })) },
    aiAnalysisRun: { updateMany: vi.fn(async () => ({ count: 0 })) },
    performanceNote: { updateMany: vi.fn(async () => ({ count: 0 })) },
    storeJobDefinition: { count: vi.fn(async () => 0) },
  };
  Object.assign(db, { $transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)) });

  return { db, rows, evaluations, evaluationRounds };
}

function applyWhere(rows: EmployeeRow[], where: Record<string, any> = {}) {
  return rows.filter((row) => {
    const searchMatches = where.OR
      ? where.OR.some((condition: any) => {
          const nameSearch = condition.displayName?.contains?.toLowerCase();
          return (
            (nameSearch && row.displayName.toLowerCase().includes(nameSearch))
          );
        })
      : true;

    return (
      (!where.storeId ||
        row.storeId === where.storeId ||
        (Array.isArray(where.storeId.in) && where.storeId.in.includes(row.storeId))) &&
      (!where.status || row.status === where.status) &&
      (!where.employmentType || row.employmentType === where.employmentType) &&
      searchMatches
    );
  });
}

describe("EmployeeService", () => {
  it("rejects duplicate and cross-Store job assignments", async () => {
    const { db } = createDb();
    const service = new EmployeeService(db as never);
    await expect(service.createEmployee({ storeId: "store-1", displayName: "Nina", employmentType: "Part-time", employeeType: "REGULAR", jobIds: ["job-1", "job-1"] })).rejects.toMatchObject({ status: 409 });
    db.storeJobDefinition.count.mockResolvedValueOnce(0);
    await expect(service.createEmployee({ storeId: "store-1", displayName: "Nina", employmentType: "Part-time", employeeType: "REGULAR", jobIds: ["foreign-job"] })).rejects.toMatchObject({ status: 409 });
  });
  it("creates an employee with backend-generated id and active status", async () => {
    const { db, rows } = createDb();
    const service = new EmployeeService(db as never);

    const created = await service.createEmployee({
      storeId: "store-1",
      displayName: "Nina Park",
      employmentType: "Part-time",
      employeeType: "REGULAR",
      status: "Active",
    });

    expect(created.id).toBe("generated-employee");
    expect(created.status).toBe("Active");
    expect(created.employmentType).toBe("Part-time");
    expect(rows).toHaveLength(1);
  });

  it("rejects duplicate client-provided employee ids", async () => {
    const { db } = createDb([employeeRow({ id: "emp-1" })]);
    const service = new EmployeeService(db as never);

    await expect(
      service.createEmployee({
        id: "emp-1",
        storeId: "store-1",
        displayName: "Duplicate",
        employmentType: "Full-time",
        employeeType: "REGULAR",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("updates employee details", async () => {
    const { db } = createDb([employeeRow()]);
    const service = new EmployeeService(db as never);

    const updated = await service.updateEmployee("emp-1", {
      displayName: "HandoverEmployee003",
      surname: "Chen",
      givenName: "Molly",
      emailAddress: "molly@example.com",
      employmentType: "Full-time",
      employmentCommencementDate: new Date("2022-05-01T00:00:00.000Z"),
    });

    expect(updated.displayName).toBe("HandoverEmployee003");
    expect(updated.emailAddress).toBeUndefined();
    expect(updated.tenureMonths).toBeGreaterThan(0);
    expect(db.employee.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ surname: "Chen", emailAddress: "molly@example.com" }),
    }));
    await expect(service.getEmployeeProfile("emp-1")).resolves.toMatchObject({
      surname: "Chen",
      emailAddress: "molly@example.com",
    });
  });

  it("transfers an employee with an OPEN round while keeping the archive guard", async () => {
    const { db, evaluationRounds } = createDb([employeeRow()]);
    evaluationRounds.push({ id: "round-open", employeeId: "emp-1", status: "OPEN" });
    const service = new EmployeeService(db as never);

    await expect(service.updateEmployee("emp-1", { storeId: "store-2" })).resolves.toMatchObject({ id: "emp-1", storeId: "store-2" });
    expect(db.evaluationRound.updateMany).toHaveBeenCalledWith({ where: { employeeId: "emp-1" }, data: { storeId: "store-2", storeNameSnapshot: "Harbor" } });
    expect(db.aiAnalysisRun.updateMany).toHaveBeenCalledWith({ where: { employeeId: "emp-1" }, data: { storeId: "store-2" } });
    expect(db.performanceNote.updateMany).toHaveBeenCalledWith({ where: { employeeId: "emp-1" }, data: { storeId: "store-2" } });
    await expect(service.archiveEmployee("emp-1")).rejects.toMatchObject({
      status: 409,
      message: "该员工有进行中的评价轮次，请先结束本轮后再归档。",
    });
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it("lists employees with pagination and filters", async () => {
    const { db } = createDb([
      employeeRow({ id: "emp-1", displayName: "Amy Lane", status: "Active" }),
      employeeRow({ id: "emp-2", displayName: "Amy Stone", status: "Active" }),
      employeeRow({ id: "emp-3", displayName: "Ben Archived", status: "Archived" }),
    ]);
    const service = new EmployeeService(db as never);

    const pageOne = await service.listEmployees({
      page: 1,
      pageSize: 1,
      storeId: "store-1",
      status: "Active",
      search: "amy",
    });
    const pageTwo = await service.listEmployees({
      page: 2,
      pageSize: 1,
      storeId: "store-1",
      status: "Active",
      search: "amy",
    });

    expect(pageOne.items.map((item) => item.id)).toEqual(["emp-1"]);
    expect(pageTwo.items.map((item) => item.id)).toEqual(["emp-2"]);
    expect(pageOne.total).toBe(2);
    expect(pageOne.totalPages).toBe(2);
  });

  it("searches names and jobs but never protected contact, tax, or bank fields", async () => {
    const { db } = createDb([employeeRow()]);
    const service = new EmployeeService(db as never);

    await service.listEmployees({ search: "private-name" });

    const where = db.employee.findMany.mock.calls[0]?.[0].where;
    expect(JSON.stringify(where)).not.toMatch(/emailAddress|mobileTelephoneNumber|taxFileNumber|bankAccountNumber|bsbNumber|dateOfBirth|addressLine|visaType|superannuation/);
    expect(where.OR).toEqual(expect.arrayContaining([
      { id: { contains: "private-name", mode: "insensitive" } },
      { displayName: { contains: "private-name", mode: "insensitive" } },
      { englishName: { contains: "private-name", mode: "insensitive" } },
      { givenName: { contains: "private-name", mode: "insensitive" } },
      { surname: { contains: "private-name", mode: "insensitive" } },
    ]));
  });

  it("scopes employee lists to accessible store ids", async () => {
    const { db } = createDb([
      employeeRow({ id: "store-1-emp", storeId: "store-1", store: store({ id: "store-1" }) }),
      employeeRow({ id: "store-2-emp", storeId: "store-2", store: store({ id: "store-2" }) }),
    ]);
    const service = new EmployeeService(db as never);

    const response = await service.listEmployees({ accessibleStoreIds: ["store-2"] });

    expect(response.items.map((item) => item.id)).toEqual(["store-2-emp"]);
  });

  it("promotes a Training employee without touching skills or evaluation history", async () => {
    const { db, evaluations } = createDb([employeeRow({ id: "emp-1", employeeType: "TRAINING" })]);
    const service = new EmployeeService(db as never);

    const updated = await service.promoteToRegular("emp-1");

    expect(updated.id).toBe("emp-1");
    expect(evaluations).toHaveLength(1);
    expect(db.employee.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "emp-1", status: "Active", employeeType: "TRAINING" }),
      data: expect.objectContaining({ employeeType: "REGULAR" }),
    }));
  });

  it("archives and restores without deleting evaluations", async () => {
    const { db, evaluations } = createDb([employeeRow({ id: "emp-1", status: "Active" })]);
    const service = new EmployeeService(db as never);

    const archived = await service.archiveEmployee("emp-1");
    const restored = await service.restoreEmployee("emp-1");

    expect(archived.status).toBe("Archived");
    expect(archived.archivedAt).toBeDefined();
    expect(restored.status).toBe("Active");
    expect(restored.archivedAt).toBeUndefined();
    expect(evaluations).toHaveLength(1);
    expect(db.employee.update).toHaveBeenCalledTimes(1);
    expect(db.employee.updateMany).toHaveBeenCalledTimes(1);
  });
});

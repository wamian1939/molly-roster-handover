import { describe, expect, it, vi } from "vitest";
import { PerformanceNoteService } from "../src/performanceNoteService.js";

type EmployeeRow = ReturnType<typeof employee>;
type NoteRow = ReturnType<typeof noteRow>;

function store(overrides = {}) {
  return {
    id: "store-1",
    name: "Downtown",
    region: "Central",
    managerName: "Amelia",
    city: "Sydney",
    ...overrides,
  };
}

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    storeId: "store-1",
    name: "Molly Carter",
    role: "Shift Lead",
    employmentType: "FullTime",
    tenure: "3y",
    status: "Active",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
    archivedAt: null,
    ...overrides,
  };
}

function noteRow(overrides: Record<string, unknown> = {}) {
  const baseStore = store();
  const baseEmployee = employee();
  return {
    id: "note-1",
    employeeId: baseEmployee.id,
    storeId: baseStore.id,
    authorId: "manager-1",
    noteDate: new Date("2026-06-10T00:00:00.000Z"),
    noteType: "Positive",
    dimensions: ["teamwork"],
    scoreImpact: 4,
    noteText: "Covered a difficult shift well.",
    createdAt: new Date("2026-06-10T01:00:00.000Z"),
    updatedAt: new Date("2026-06-10T01:00:00.000Z"),
    employee: baseEmployee,
    store: baseStore,
    ...overrides,
  };
}

function createDb(initialNotes: NoteRow[] = [], initialEmployees: EmployeeRow[] = [employee()]) {
  const notes = [...initialNotes];
  const employees = [...initialEmployees];
  const stores = [store(), store({ id: "store-2", name: "Harbor" })];
  const evaluations = [{ id: "eval-1", employeeId: "emp-1", finalScore: 80 }];

  const db = {
    employee: {
      findUnique: vi.fn(async ({ where }) => employees.find((item) => item.id === where.id) ?? null),
    },
    performanceNote: {
      count: vi.fn(async ({ where } = {}) => applyWhere(notes, where).length),
      findMany: vi.fn(async ({ where, skip = 0, take } = {}) =>
        applyWhere(notes, where).slice(skip, take ? skip + take : undefined),
      ),
      create: vi.fn(async ({ data }) => {
        const note = noteRow({
          id: "generated-note",
          ...data,
          noteDate: data.noteDate,
          employee: employees.find((item) => item.id === data.employeeId),
          store: stores.find((item) => item.id === data.storeId),
          createdAt: new Date("2026-06-12T00:00:00.000Z"),
          updatedAt: new Date("2026-06-12T00:00:00.000Z"),
        });
        notes.push(note);
        return note;
      }),
    },
  };

  return { db, notes, evaluations };
}

function applyWhere(notes: NoteRow[], where: Record<string, any> = {}) {
  return notes.filter((note) => {
    const noteDate = where.noteDate;
    return (
      (!where.employeeId || note.employeeId === where.employeeId) &&
      (!where.storeId ||
        note.storeId === where.storeId ||
        (Array.isArray(where.storeId.in) && where.storeId.in.includes(note.storeId))) &&
      (!where.noteType || note.noteType === where.noteType) &&
      (!where.dimensions?.has || note.dimensions.includes(where.dimensions.has)) &&
      (!noteDate?.gte || note.noteDate >= noteDate.gte) &&
      (!noteDate?.lte || note.noteDate <= noteDate.lte)
    );
  });
}

const payload = {
  employeeId: "emp-1",
  storeId: "store-1",
  noteDate: new Date("2026-06-12T00:00:00.000Z"),
  noteType: "Positive" as const,
  dimensions: ["teamwork" as const],
  scoreImpact: 5,
  noteText: "Handled a rush calmly.",
};

describe("PerformanceNoteService", () => {
  it("creates a note for an active employee without modifying evaluations", async () => {
    const { db, notes, evaluations } = createDb();
    const service = new PerformanceNoteService(db as never);

    const created = await service.createPerformanceNote(payload, "manager-1");

    expect(created).toMatchObject({
      id: "generated-note",
      employeeId: "emp-1",
      authorId: "manager-1",
      noteType: "Positive",
      dimensions: ["teamwork"],
      scoreImpact: 5,
    });
    expect(notes).toHaveLength(1);
    expect(evaluations[0].finalScore).toBe(80);
  });

  it("rejects notes for archived employees", async () => {
    const { db } = createDb([], [employee({ status: "Archived", archivedAt: new Date("2026-06-01T00:00:00.000Z") })]);
    const service = new PerformanceNoteService(db as never);

    await expect(service.createPerformanceNote(payload, "manager-1")).rejects.toMatchObject({ status: 409 });
  });

  it("filters notes by employee, store, type, date, dimension, and accessible stores", async () => {
    const { db } = createDb([
      noteRow({ id: "match", noteType: "Coaching", dimensions: ["skill"], noteDate: new Date("2026-06-11T00:00:00.000Z") }),
      noteRow({ id: "wrong-type", noteType: "Positive", dimensions: ["skill"], noteDate: new Date("2026-06-11T00:00:00.000Z") }),
      noteRow({
        id: "wrong-store",
        employeeId: "emp-2",
        storeId: "store-2",
        noteType: "Coaching",
        dimensions: ["skill"],
        noteDate: new Date("2026-06-11T00:00:00.000Z"),
        employee: employee({ id: "emp-2", storeId: "store-2" }),
        store: store({ id: "store-2" }),
      }),
    ]);
    const service = new PerformanceNoteService(db as never);

    const response = await service.listPerformanceNotes({
      employeeId: "emp-1",
      noteType: "Coaching",
      dimension: "skill",
      dateFrom: "2026-06-10T00:00:00.000Z",
      dateTo: "2026-06-12T00:00:00.000Z",
      accessibleStoreIds: ["store-1"],
    });

    expect(response.items.map((item) => item.id)).toEqual(["match"]);
    expect(response.total).toBe(1);
  });

  it("paginates notes", async () => {
    const { db } = createDb([
      noteRow({ id: "note-1" }),
      noteRow({ id: "note-2" }),
    ]);
    const service = new PerformanceNoteService(db as never);

    const pageTwo = await service.listPerformanceNotes({ page: 2, pageSize: 1 });

    expect(pageTwo.items.map((item) => item.id)).toEqual(["note-2"]);
    expect(pageTwo.total).toBe(2);
    expect(pageTwo.totalPages).toBe(2);
  });
});

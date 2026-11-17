import { afterEach, describe, expect, it, vi } from "vitest";
import { rosterRepository, type CopyDayPreview, type CopyPeriodPreview } from "./rosterRepository";

afterEach(() => vi.unstubAllGlobals());

const preview: CopyPeriodPreview = {
  policy: "ALL_OR_NOTHING", shiftCount: 1, readyShifts: 1, availableAssignments: 1,
  blockedAssignments: 0, unavailableAssignments: 0, conflictingAssignments: 0,
  issues: [], canCopy: true, targetStartDate: "2026-11-02", sourcePeriodVersion: 4,
};
const input = { storeId: "store-1", sourcePeriodId: "source-period", targetStartDate: "2026-11-02", expectedSourcePeriodVersion: 4 };
const expected = { endDate: "2026-11-08", cycleType: "WEEK" as const, preview };
const saved = { id: "new-period", storeId: "store-1", startDate: "2026-11-02", endDate: "2026-11-08",
  cycleType: "WEEK", status: "DRAFT", version: 1, publishedAt: null };

describe("Copy Period repository boundary", () => {
  it("rejects an incomplete successful preview before opening the copy dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...preview, issues: null }), { status: 200 })));
    await expect(rosterRepository.previewCopyPeriod({ storeId: input.storeId, sourcePeriodId: input.sourcePeriodId,
      targetStartDate: input.targetStartDate })).rejects.toMatchObject({ status: 200 });
  });

  it("confirms a new draft period matching the previewed target", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(saved), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(rosterRepository.copyPeriod(input, expected)).resolves.toEqual(saved);
    expect(fetchMock).toHaveBeenCalledWith("/api/roster/batch/copy", expect.objectContaining({
      method: "POST", body: JSON.stringify(input),
    }));
  });

  it("does not confirm a successful HTTP response for the wrong store", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...saved, storeId: "other-store" }), { status: 201 })));
    await expect(rosterRepository.copyPeriod(input, expected)).rejects.toMatchObject({ status: 0, message: expect.stringContaining("尚未确认") });
  });
});

describe("Copy Day repository boundary", () => {
  const dayPreview: CopyDayPreview = { policy: "ALL_OR_NOTHING", shiftCount: 1, readyShifts: 1,
    availableAssignments: 1, blockedAssignments: 0, unavailableAssignments: 0, conflictingAssignments: 0,
    issues: [], canCopy: true, sourceDate: "2026-10-27", targetDate: "2026-10-28",
    sourcePeriodVersion: 2, targetPeriodVersion: null };

  it("rejects a successful preview without issues before Calendar can render it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...dayPreview, issues: null }), { status: 200 })));
    await expect(rosterRepository.previewCopyDay({ storeId: "store-1", sourceDate: dayPreview.sourceDate,
      targetDate: dayPreview.targetDate })).rejects.toMatchObject({ status: 200 });
  });

  it("accepts a valid preview for the exact requested dates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(dayPreview), { status: 200 })));
    await expect(rosterRepository.previewCopyDay({ storeId: "store-1", sourceDate: dayPreview.sourceDate,
      targetDate: dayPreview.targetDate })).resolves.toEqual(dayPreview);
  });
});

describe("Availability replacement repository boundary", () => {
  const replacement = { storeId: "store-1", employeeId: "employee-1", dates: ["2026-10-26"], expectedRows: [],
    entries: [{ date: "2026-10-26", status: "AVAILABLE" as const,
      startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T06:00:00.000Z", source: "MANUAL" as const }] };

  it("does not confirm HTTP success that omits the saved time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    await expect(rosterRepository.replaceAvailability(replacement)).rejects.toMatchObject({ status: 0 });
  });

  it("rejects an HTTP-success availability read from another employee", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{
      id: "row-1", storeId: "store-1", employeeId: "employee-2", date: "2026-10-26",
      status: "AVAILABLE", startAt: "2026-10-25T23:00:00.000Z",
      endAt: "2026-10-26T06:00:00.000Z", note: null, source: "MANUAL", version: 1,
    }]), { status: 200 })));
    await expect(rosterRepository.availability("store-1", "2026-10-26", "2026-10-26", "employee-1"))
      .rejects.toMatchObject({ status: 200 });
  });
});

describe("Preset script repository boundary", () => {
  const hash = "a".repeat(64);
  const input = { storeId: "store-1", week: "NEXT" as const, script: "HandoverEmployee006 1AA", expectedShortcutsVersion: 1 };
  const slot = { employeeId: "employee-1", employeeName: "HandoverEmployee006", date: "2026-11-02",
    startAt: "2026-11-01T23:00:00.000Z", endAt: "2026-11-02T11:00:00.000Z",
    shortcut: "AA", line: 1, status: "CREATE" };
  const scriptPreview = { weekStart: "2026-11-02", timezone: "Australia/Sydney",
    previewHash: hash, slotStatusHash: hash, slots: [slot], issues: [],
    summary: { create: 1, unchanged: 0, conflict: 0 }, canCommit: true };

  it("rejects an incomplete successful preview before the dialog can render it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...scriptPreview, issues: null }), { status: 200 })));
    await expect(rosterRepository.previewPresetScript(input)).rejects.toMatchObject({ status: 200 });
  });

  it("rejects a preview whose counts do not match its slots", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...scriptPreview, slots: [] }), { status: 200 })));
    await expect(rosterRepository.previewPresetScript(input)).rejects.toMatchObject({ status: 200 });
  });

  it("accepts a complete preview and exact idempotent commit count", async () => {
    const replies = [scriptPreview, { importId: "import-1", alreadyImported: true, created: 1, unchanged: 0 }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 })));
    await expect(rosterRepository.previewPresetScript(input)).resolves.toEqual(scriptPreview);
    await expect(rosterRepository.commitPresetScript({ ...input, previewHash: hash,
      expectedSlotStatusHash: hash, expectedCreateCount: 1, expectedUnchangedCount: 0 }))
      .resolves.toEqual({ importId: "import-1", alreadyImported: true, created: 1, unchanged: 0 });
  });

  it("keeps an HTTP-success import with the wrong count unconfirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      importId: "import-1", alreadyImported: false, created: 0, unchanged: 0,
    }), { status: 200 })));
    await expect(rosterRepository.commitPresetScript({ ...input, previewHash: hash,
      expectedSlotStatusHash: hash, expectedCreateCount: 1, expectedUnchangedCount: 0 }))
      .rejects.toMatchObject({ status: 0 });
  });
});

describe("Period publication repository boundary", () => {
  const period = { id: "period-1", storeId: "store-1", startDate: "2026-10-26", endDate: "2026-11-01",
    cycleType: "WEEK" as const, status: "DRAFT" as const, version: 4, publishedAt: null };
  const publishedAt = "2026-10-27T01:00:00.000Z";
  const published = { ...period, status: "PUBLISHED" as const, version: 5, publishedAt };
  const publication = { id: "publication-1", rosterPeriodId: period.id, periodVersion: 5, publishedAt,
    snapshot: { schemaVersion: 1, store: { id: period.storeId, name: "Store" }, period: published,
      shifts: [{ id: "shift-1", rosterPeriodId: period.id, storeId: period.storeId }] } };

  it("confirms a publication only with the exact period transition and archive link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ period: published, publication }), { status: 200 })));
    await expect(rosterRepository.publishPeriod(period.storeId, period.id, period.version, period))
      .resolves.toMatchObject({ period: published, publication });
  });

  it.each([
    { name: "missing publication", body: { period: published } },
    { name: "wrong store", body: { period: { ...published, storeId: "other-store" }, publication } },
    { name: "skipped version", body: { period: { ...published, version: 6 }, publication } },
    { name: "archive for another period", body: { period: published, publication: { ...publication, rosterPeriodId: "other-period" } } },
    { name: "empty archive", body: { period: published, publication: {
      ...publication, snapshot: { ...publication.snapshot, shifts: [] },
    } } },
  ])("keeps $name unconfirmed", async ({ body }) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    await expect(rosterRepository.publishPeriod(period.storeId, period.id, period.version, period))
      .rejects.toMatchObject({ status: 0 });
  });

  it("confirms reopening only at the next draft version", async () => {
    const reopened = { ...period, version: 6, publishedAt };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(reopened), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(rosterRepository.reopenPeriod(period.storeId, period.id, 5, published))
      .resolves.toEqual(reopened);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/period-1/reopen"), expect.objectContaining({ method: "POST" }));
  });

  it("keeps a published reopening response unconfirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...published, version: 6 }), { status: 200 })));
    await expect(rosterRepository.reopenPeriod(period.storeId, period.id, 5, published))
      .rejects.toMatchObject({ status: 0 });
  });
});

describe("repeat and batch repository boundaries", () => {
  it("accepts a complete repeat preview for the exact requested dates", async () => {
    const body = { policy: "ALL_OR_NOTHING", shiftCount: 2, readyShifts: 2,
      availableAssignments: 2, blockedAssignments: 0, issues: [], canCopy: true,
      targetDates: ["2026-11-02", "2026-11-09"], sourcePeriodVersion: 3,
      targetPeriodVersions: [{ date: "2026-11-02", version: null }, { date: "2026-11-09", version: 2 }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    await expect(rosterRepository.previewRepeatShift({ storeId: "store-1", sourceShiftId: "shift-1",
      targetDates: body.targetDates })).resolves.toEqual(body);
  });

  it("keeps a blocked repeat preview visible when the source period is invalid", async () => {
    const body = { policy: "ALL_OR_NOTHING", shiftCount: 1, readyShifts: 0,
      availableAssignments: 0, blockedAssignments: 1, canCopy: false,
      targetDates: ["2026-11-02"], sourcePeriodVersion: null,
      targetPeriodVersions: [{ date: "2026-11-02", version: null }],
      issues: [{ shiftDate: "2026-11-02", employeeName: "—", code: "SHIFT_PERIOD_MISMATCH",
        severity: "BLOCKING_ERROR", reason: "来源周期无效" }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    await expect(rosterRepository.previewRepeatShift({ storeId: "store-1", sourceShiftId: "shift-1",
      targetDates: body.targetDates })).resolves.toEqual(body);
  });

  it("rejects a repeat preview with no issues array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      policy: "ALL_OR_NOTHING", shiftCount: 1, readyShifts: 1,
      availableAssignments: 1, blockedAssignments: 0, canCopy: true,
      targetDates: ["2026-11-02"], sourcePeriodVersion: 1,
      targetPeriodVersions: [{ date: "2026-11-02", version: null }],
    }), { status: 200 })));
    await expect(rosterRepository.previewRepeatShift({ storeId: "store-1", sourceShiftId: "shift-1",
      targetDates: ["2026-11-02"] })).rejects.toMatchObject({ status: 200 });
  });

  it("keeps a repeat with the wrong created count unconfirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ created: 0 }), { status: 201 })));
    await expect(rosterRepository.repeatShift({ storeId: "store-1", sourceShiftId: "shift-1",
      targetDates: ["2026-11-02"], expectedSourcePeriodVersion: 1,
      expectedTargetPeriodVersions: [{ date: "2026-11-02", version: null }] }))
      .rejects.toMatchObject({ status: 0 });
  });

  it("accepts exact repeat and batch mutation counts", async () => {
    const responses = [{ created: 1 }, { updated: 1 }, { deleted: 1 }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })));
    await expect(rosterRepository.repeatShift({ storeId: "store-1", sourceShiftId: "shift-1",
      targetDates: ["2026-11-02"], expectedSourcePeriodVersion: 1,
      expectedTargetPeriodVersions: [{ date: "2026-11-02", version: null }] })).resolves.toEqual({ created: 1 });
    await expect(rosterRepository.batchUpdateRole("store-1", [{ id: "shift-1", version: 1 }], "role-2"))
      .resolves.toEqual({ updated: 1 });
    await expect(rosterRepository.batchDelete("store-1", [{ id: "shift-1", version: 1 }]))
      .resolves.toEqual({ deleted: 1 });
  });

  it("keeps a batch role update with the wrong count unconfirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ updated: 0 }), { status: 200 })));
    await expect(rosterRepository.batchUpdateRole("store-1", [{ id: "shift-1", version: 1 }], "role-2"))
      .rejects.toMatchObject({ status: 0 });
  });

  it("keeps a batch delete with the wrong count unconfirmed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ deleted: 0 }), { status: 200 })));
    await expect(rosterRepository.batchDelete("store-1", [{ id: "shift-1", version: 1 }]))
      .rejects.toMatchObject({ status: 0 });
  });
});

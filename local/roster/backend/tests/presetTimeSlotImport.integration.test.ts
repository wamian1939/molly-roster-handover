import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";
import { parsePresetTimeSlotScript, type ScriptSlot } from "../src/presetTimeSlotScript.js";
import { presetTimeSlotFingerprint, previewPresetTimeSlots } from "../src/presetTimeSlotPreview.js";
import { presetTimeSlotReviewFingerprint } from "../src/presetTimeSlotReview.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("Preset Time Slot Script append on isolated PostgreSQL", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `script-import-${suffix}`;
  const employeeId = `script-employee-${suffix}`;
  const slots: ScriptSlot[] = [
    { employeeId, employeeName: "Fixture Worker", date: "2037-10-05", startAt: "2037-10-05T09:00:00.000Z", endAt: "2037-10-05T17:00:00.000Z", shortcut: "AA", line: 1 },
    { employeeId, employeeName: "Fixture Worker", date: "2037-10-06", startAt: "2037-10-06T09:00:00.000Z", endAt: "2037-10-06T17:00:00.000Z", shortcut: "AA", line: 1 },
  ];
  const allCreateHash = (rows: ScriptSlot[]) => presetTimeSlotReviewFingerprint(rows.map((slot) => ({
    ...slot, status: "CREATE" as const, existingRows: [],
  })));
  const input = { storeId, actorAccountId: "qa-account", sourceHash: "a".repeat(64), weekStart: "2037-10-05",
    expectedShortcutsVersion: null, expectedSettingsVersion: 1, slots, expectedSlotStatusHash: allCreateHash(slots) };

  afterAll(async () => {
    await prisma.shift.deleteMany({ where: { storeId } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.availabilityScriptImport.deleteMany({ where: { storeId } });
    await prisma.availabilityScriptShortcuts.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("refuses overlapping adjacent-day windows even when a direct caller bypasses preview", async () => {
    const overlapping: ScriptSlot[] = [
      { ...slots[0]!, startAt: "2037-10-05T22:00:00.000Z", endAt: "2037-10-06T02:00:00.000Z" },
      { ...slots[1]!, startAt: "2037-10-06T01:00:00.000Z", endAt: "2037-10-06T04:00:00.000Z" },
    ];
    const before = await prisma.employeeAvailability.count({ where: { storeId } });
    const auditsBefore = await prisma.availabilityScriptImport.count({ where: { storeId } });
    await expect(service.commitPresetTimeSlots({ ...input, sourceHash: "9".repeat(64), slots: overlapping,
      expectedSlotStatusHash: allCreateHash(overlapping) })).rejects.toMatchObject({ status: 422 });
    expect(await prisma.employeeAvailability.count({ where: { storeId } })).toBe(before);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId } })).toBe(auditsBefore);
  });

  it("refuses two nonoverlapping windows on one local day before any write", async () => {
    const sameDay: ScriptSlot[] = [slots[0]!, {
      ...slots[0]!, startAt: slots[0]!.endAt, endAt: "2037-10-05T19:00:00.000Z", shortcut: "BB",
    }];
    const before = await prisma.employeeAvailability.count({ where: { storeId } });
    const auditsBefore = await prisma.availabilityScriptImport.count({ where: { storeId } });
    await expect(service.commitPresetTimeSlots({ ...input, sourceHash: "8".repeat(64), slots: sameDay,
      expectedSlotStatusHash: allCreateHash(sameDay) })).rejects.toMatchObject({ status: 422 });
    expect(await prisma.employeeAvailability.count({ where: { storeId } })).toBe(before);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId } })).toBe(auditsBefore);
  });

  it("refuses direct imports until the store timezone is configured", async () => {
    await expect(service.commitPresetTimeSlots({ ...input, expectedSettingsVersion: null }))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId } })).toBe(0);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId } })).toBe(0);
  });

  it("rolls back the whole paste on a recorded date, then records an idempotent audited append", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-06"], entries: [{
      date: "2037-10-06", status: "AVAILABLE", startAt: "2037-10-06T10:00:00.000Z", endAt: "2037-10-06T16:00:00.000Z",
    }] });
    await expect(service.commitPresetTimeSlots(input)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId, date: new Date("2037-10-05T00:00:00.000Z") } })).toBe(0);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId } })).toBe(0);
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-06"], entries: [] });
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-06"], entries: [{
      date: "2037-10-06", status: "AVAILABLE", startAt: slots[1]!.startAt, endAt: slots[1]!.endAt,
    }] });
    await expect(service.commitPresetTimeSlots({ ...input, expectedCreateCount: 2, expectedUnchangedCount: 0 }))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId, date: new Date("2037-10-05T00:00:00.000Z") } })).toBe(0);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId } })).toBe(0);
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-06"], entries: [] });
    const committed = await service.commitPresetTimeSlots(input);
    expect(committed).toMatchObject({ alreadyImported: false, created: 2, unchanged: 0 });
    expect(await prisma.employeeAvailability.count({ where: { storeId, source: "SCRIPT" } })).toBe(2);
    expect(await prisma.availabilityScriptImport.findFirstOrThrow({ where: { storeId } })).toMatchObject({
      actorAccountId: "qa-account", sourceHash: "a".repeat(64), mode: "APPEND", createdCount: 2, unchangedCount: 0,
    });
    expect(await service.commitPresetTimeSlots(input)).toMatchObject({
      importId: committed.importId, alreadyImported: true, created: 2, unchanged: 0,
    });
    expect(await prisma.employeeAvailability.count({ where: { storeId } })).toBe(2);
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-06"], entries: [{
      date: "2037-10-06", status: "AVAILABLE", startAt: "2037-10-06T10:00:00.000Z", endAt: "2037-10-06T16:00:00.000Z",
    }] });
    await expect(service.commitPresetTimeSlots(input)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId } })).toBe(2);
  });

  it("reads assigned Shifts into the dry-run before an uncovered window is committed", async () => {
    const role = await prisma.shiftRole.create({ data: {
      storeId, code: `script-test-${suffix}`, nameZh: "Fixture Role", colorToken: "#123456",
    } });
    const period = await prisma.rosterPeriod.create({ data: {
      storeId, startDate: new Date("2037-10-05T00:00:00.000Z"),
      endDate: new Date("2037-10-11T00:00:00.000Z"), cycleType: "WEEK", createdByAccountId: "qa-account",
    } });
    await prisma.shift.create({ data: {
      storeId, rosterPeriodId: period.id, date: new Date("2037-10-07T00:00:00.000Z"),
      startAt: new Date("2037-10-07T08:00:00.000Z"), endAt: new Date("2037-10-07T10:00:00.000Z"),
      shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account",
      assignments: { create: { employeeId, employeeNameSnapshot: "Fixture Worker", employeeTypeSnapshot: "FullTime" } },
    } });
    const proposed: ScriptSlot = { ...slots[0]!, date: "2037-10-07",
      startAt: "2037-10-07T10:00:00.000Z", endAt: "2037-10-07T17:00:00.000Z" };
    const assignments = await service.listAssignedShiftsForPresetPreview(storeId, [proposed]);
    expect(assignments).toMatchObject([{ employeeId, date: proposed.date,
      startAt: "2037-10-07T08:00:00.000Z", endAt: "2037-10-07T10:00:00.000Z" }]);
    const preview = previewPresetTimeSlots([proposed], await service.listAvailability(storeId, "2037-10-06", "2037-10-07"), assignments);
    expect(preview.summary).toEqual({ create: 0, unchanged: 0, conflict: 1 });
  });

  it("persists normalized store shortcuts and rejects stale or invalid edits", async () => {
    expect(await service.getPresetShortcuts(storeId)).toBeNull();
    const first = await service.savePresetShortcuts({ storeId, actorAccountId: "manager-a",
      shortcuts: [{ code: " aa ", startTime: "10:00", endTime: "17:00" }] });
    expect(first).toMatchObject({ storeId, version: 1,
      shortcuts: [{ code: "AA", startTime: "10:00", endTime: "17:00" }] });
    await expect(service.savePresetShortcuts({ storeId, actorAccountId: "manager-b", shortcuts: first.shortcuts }))
      .rejects.toMatchObject({ status: 409 });
    await expect(service.savePresetShortcuts({ storeId, actorAccountId: "manager-b", version: 1,
      shortcuts: [{ code: "AA", startTime: "17:00", endTime: "17:00" }] }))
      .rejects.toMatchObject({ status: 400 });
    const second = await service.savePresetShortcuts({ storeId, actorAccountId: "manager-b", version: 1,
      shortcuts: [{ code: "BB", startTime: "12:00", endTime: "20:00" }] });
    expect(second).toMatchObject({ version: 2, shortcuts: [{ code: "BB" }] });
    await expect(service.savePresetShortcuts({ storeId, actorAccountId: "manager-a", version: 1,
      shortcuts: [{ code: "CC", startTime: "13:00", endTime: "21:00" }] }))
      .rejects.toMatchObject({ status: 409 });
    expect(await service.getPresetShortcuts(storeId)).toMatchObject(second);
    expect(await service.getPresetShortcuts(`${storeId}-other`)).toBeNull();
    expect(await prisma.availabilityScriptShortcuts.findUniqueOrThrow({ where: { storeId } })).toMatchObject({
      updatedByAccountId: "manager-b", version: 2,
    });
  });

  it("persists a 20-letter shortcut without truncating the saved configuration", async () => {
    const longStoreId = `${storeId}-twenty-letter`;
    const code = "ABCDEFGHIJKLMNOPQRST";
    try {
      const saved = await service.savePresetShortcuts({ storeId: longStoreId, actorAccountId: "manager-a",
        shortcuts: [{ code: code.toLowerCase(), startTime: "10:00", endTime: "22:00" }] });
      expect(saved.shortcuts).toEqual([{ code, startTime: "10:00", endTime: "22:00" }]);
      expect(await service.getPresetShortcuts(longStoreId)).toMatchObject({ version: 1, shortcuts: saved.shortcuts });
      await expect(service.savePresetShortcuts({ storeId: longStoreId, actorAccountId: "manager-a", version: 1,
        shortcuts: [{ code: `${code}U`, startTime: "10:00", endTime: "22:00" }] }))
        .rejects.toMatchObject({ status: 400 });
      expect(await service.getPresetShortcuts(longStoreId)).toMatchObject({ version: 1, shortcuts: saved.shortcuts });
    } finally {
      await prisma.availabilityScriptShortcuts.deleteMany({ where: { storeId: longStoreId } });
    }
  });

  it("serializes concurrent submissions of the same paste without duplicate rows or audits", async () => {
    const concurrentSlots: ScriptSlot[] = [
      { ...slots[0]!, date: "2037-10-08", startAt: "2037-10-08T09:00:00.000Z", endAt: "2037-10-08T17:00:00.000Z" },
      { ...slots[1]!, date: "2037-10-09", startAt: "2037-10-09T09:00:00.000Z", endAt: "2037-10-09T17:00:00.000Z" },
    ];
    const concurrentInput = { ...input, sourceHash: "b".repeat(64), expectedShortcutsVersion: 2,
      slots: concurrentSlots, expectedSlotStatusHash: allCreateHash(concurrentSlots) };
    const results = await Promise.all([
      service.commitPresetTimeSlots(concurrentInput), service.commitPresetTimeSlots(concurrentInput),
    ]);
    expect(results.map((result) => result.alreadyImported).sort()).toEqual([false, true]);
    expect(results[0]!.importId).toBe(results[1]!.importId);
    expect(await prisma.employeeAvailability.count({ where: { storeId, source: "SCRIPT" } })).toBe(3);
    expect(await prisma.employeeAvailability.count({ where: { storeId,
      date: { in: [new Date("2037-10-08T00:00:00.000Z"), new Date("2037-10-09T00:00:00.000Z")] },
    } })).toBe(2);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId, sourceHash: concurrentInput.sourceHash } })).toBe(1);
  });

  it("rolls back availability rows when the later audit insert fails", async () => {
    const schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema");
    if (!schema || !/^codex_roster_backend_test_[0-9]+_[0-9a-f]{4}$/.test(schema)) {
      throw new Error("Audit failure injection requires a disposable backend test schema");
    }
    const sourceHash = "c".repeat(64);
    const failureSlots = [{ ...slots[0]!, date: "2037-10-10",
      startAt: "2037-10-10T09:00:00.000Z", endAt: "2037-10-10T17:00:00.000Z" }];
    const failureInput = { ...input, sourceHash, expectedShortcutsVersion: 2, slots: failureSlots,
      expectedSlotStatusHash: allCreateHash(failureSlots) };
    // Only this source hash is rejected; no other test store or import is affected.
    await prisma.$executeRawUnsafe(`ALTER TABLE "availability_script_imports" ADD CONSTRAINT "qa_reject_script_audit" CHECK ("sourceHash" <> '${sourceHash}')`);
    try {
      await expect(service.commitPresetTimeSlots(failureInput)).rejects.toThrow();
      expect(await prisma.employeeAvailability.count({ where: {
        storeId, date: new Date("2037-10-10T00:00:00.000Z"), source: "SCRIPT",
      } })).toBe(0);
      expect(await prisma.availabilityScriptImport.count({ where: { storeId, sourceHash } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "availability_script_imports" DROP CONSTRAINT "qa_reject_script_audit"');
    }
  });

  it("rejects a commit after store shortcuts or settings changed since request parsing", async () => {
    const shortcuts = await service.getPresetShortcuts(storeId);
    const settings = await service.getSettings(storeId);
    expect(shortcuts?.version).toBe(2);
    expect(settings?.version).toBe(1);
    await service.savePresetShortcuts({ storeId, actorAccountId: "manager-c", version: shortcuts!.version,
      shortcuts: [{ code: "AA", startTime: "11:00", endTime: "18:00" }] });
    const staleShortcutInput = { ...input, sourceHash: "d".repeat(64),
      expectedShortcutsVersion: shortcuts!.version, expectedSettingsVersion: settings!.version,
      slots: [{ ...slots[0]!, date: "2037-10-11", startAt: "2037-10-11T09:00:00.000Z",
        endAt: "2037-10-11T17:00:00.000Z" }] };
    await expect(service.commitPresetTimeSlots(staleShortcutInput)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId,
      date: new Date("2037-10-11T00:00:00.000Z") } })).toBe(0);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId,
      sourceHash: staleShortcutInput.sourceHash } })).toBe(0);

    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10, version: settings!.version });
    const staleSettingsInput = { ...staleShortcutInput, sourceHash: "e".repeat(64),
      expectedShortcutsVersion: shortcuts!.version + 1,
      slots: [{ ...slots[0]!, date: "2037-10-10", startAt: "2037-10-10T09:00:00.000Z",
        endAt: "2037-10-10T17:00:00.000Z" }] };
    await expect(service.commitPresetTimeSlots(staleSettingsInput)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId,
      date: new Date("2037-10-10T00:00:00.000Z") } })).toBe(0);
    expect(await prisma.availabilityScriptImport.count({ where: { storeId,
      sourceHash: staleSettingsInput.sourceHash } })).toBe(0);
  });

  it("rejects swapped create/unchanged rows even when preview totals stay the same", async () => {
    const swappedStore = `${storeId}-swapped`;
    const swappedEmployee = `${employeeId}-swapped`;
    const first = { ...slots[0]!, employeeId: swappedEmployee };
    const second = { ...slots[1]!, employeeId: swappedEmployee };
    await service.saveSettings({ storeId: swappedStore, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    try {
      await service.replaceAvailability({ storeId: swappedStore, employeeId: swappedEmployee, dates: [second.date], entries: [{
        date: second.date, status: "AVAILABLE", startAt: second.startAt, endAt: second.endAt,
      }] });
      const reviewed = previewPresetTimeSlots([first, second], await service.listAvailability(swappedStore, first.date, second.date));
      expect(reviewed.slots.map((slot) => slot.status)).toEqual(["CREATE", "UNCHANGED"]);
      const reviewedHash = presetTimeSlotReviewFingerprint(reviewed.slots);
      await service.replaceAvailability({ storeId: swappedStore, employeeId: swappedEmployee, dates: [second.date], entries: [{
        date: second.date, status: "AVAILABLE", startAt: second.startAt, endAt: second.endAt, note: "Concurrent note update",
      }] });
      const sameStatuses = previewPresetTimeSlots([first, second], await service.listAvailability(swappedStore, first.date, second.date));
      expect(sameStatuses.summary).toEqual(reviewed.summary);
      expect(sameStatuses.slots.map((slot) => slot.status)).toEqual(["CREATE", "UNCHANGED"]);
      expect(presetTimeSlotReviewFingerprint(sameStatuses.slots)).not.toBe(reviewedHash);
      await expect(service.commitPresetTimeSlots({ storeId: swappedStore, actorAccountId: "qa-account",
        sourceHash: "f".repeat(64), weekStart: "2037-10-05", expectedShortcutsVersion: null,
        expectedSettingsVersion: 1, slots: [first, second], expectedCreateCount: 1,
        expectedUnchangedCount: 1, expectedSlotStatusHash: reviewedHash })).rejects.toMatchObject({ status: 409 });
      expect(await prisma.availabilityScriptImport.count({ where: { storeId: swappedStore } })).toBe(0);
      await service.replaceAvailability({ storeId: swappedStore, employeeId: swappedEmployee, dates: [first.date], entries: [{
        date: first.date, status: "AVAILABLE", startAt: first.startAt, endAt: first.endAt,
      }] });
      await service.replaceAvailability({ storeId: swappedStore, employeeId: swappedEmployee, dates: [second.date], entries: [] });
      const changed = previewPresetTimeSlots([first, second], await service.listAvailability(swappedStore, first.date, second.date));
      expect(changed.slots.map((slot) => slot.status)).toEqual(["UNCHANGED", "CREATE"]);
      expect(changed.summary).toEqual(reviewed.summary);
      await expect(service.commitPresetTimeSlots({ storeId: swappedStore, actorAccountId: "qa-account",
        sourceHash: "f".repeat(64), weekStart: "2037-10-05", expectedShortcutsVersion: null,
        expectedSettingsVersion: 1, slots: [first, second], expectedCreateCount: 1,
        expectedUnchangedCount: 1,
        expectedSlotStatusHash: presetTimeSlotReviewFingerprint(reviewed.slots) })).rejects.toMatchObject({ status: 409 });
      expect(await prisma.employeeAvailability.count({ where: { storeId: swappedStore } })).toBe(1);
      expect(await prisma.availabilityScriptImport.count({ where: { storeId: swappedStore } })).toBe(0);
      const accepted = await service.commitPresetTimeSlots({ storeId: swappedStore, actorAccountId: "qa-account",
        sourceHash: "f".repeat(64), weekStart: "2037-10-05", expectedShortcutsVersion: null,
        expectedSettingsVersion: 1, slots: [first, second], expectedCreateCount: 1,
        expectedUnchangedCount: 1, expectedSlotStatusHash: presetTimeSlotReviewFingerprint(changed.slots) });
      expect(accepted).toMatchObject({ alreadyImported: false, created: 1, unchanged: 1 });
      expect(await prisma.employeeAvailability.count({ where: { storeId: swappedStore } })).toBe(2);
      expect(await prisma.availabilityScriptImport.count({ where: { storeId: swappedStore } })).toBe(1);
    } finally {
      await prisma.availabilityScriptImport.deleteMany({ where: { storeId: swappedStore } });
      await prisma.employeeAvailability.deleteMany({ where: { storeId: swappedStore } });
      await prisma.rosterStoreSettings.deleteMany({ where: { storeId: swappedStore } });
    }
  });

  it("previews, atomically commits, and replays a Sunday overnight script across the week boundary", async () => {
    const nightStore = `${storeId}-night`;
    const nightEmployee = `${employeeId}-night`;
    await service.saveSettings({ storeId: nightStore, timezone: "Australia/Sydney",
      openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60,
      defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const configuration = await service.savePresetShortcuts({ storeId: nightStore, actorAccountId: "qa-account",
      shortcuts: [{ code: "NN", startTime: "22:00", endTime: "02:00" }] });
    const parsed = parsePresetTimeSlotScript({ storeId: nightStore, timezone: "Australia/Sydney",
      today: "2026-10-20", week: "NEXT", script: "Fixture Worker 7NN",
      shortcuts: configuration.shortcuts,
      employees: [{ id: nightEmployee, displayName: "Fixture Worker", storeId: nightStore, isActive: true }] });
    expect(parsed.issues).toEqual([]);
    expect(parsed.slots).toMatchObject([{ date: "2026-11-01",
      startAt: "2026-11-01T11:00:00.000Z", endAt: "2026-11-01T15:00:00.000Z" }]);
    const sourceHash = presetTimeSlotFingerprint(nightStore, parsed.weekStart, "Australia/Sydney", parsed.slots);
    const commitInput = { storeId: nightStore, actorAccountId: "qa-account", sourceHash,
      weekStart: parsed.weekStart, expectedShortcutsVersion: configuration.version,
      expectedSettingsVersion: 1, slots: parsed.slots, expectedCreateCount: 1,
      expectedUnchangedCount: 0, expectedSlotStatusHash: allCreateHash(parsed.slots) };
    try {
      const role = await prisma.shiftRole.create({ data: {
        storeId: nightStore, code: "night", nameZh: "Fixture Night", colorToken: "#123456",
      } });
      const period = await prisma.rosterPeriod.create({ data: {
        storeId: nightStore, startDate: new Date("2026-11-02T00:00:00.000Z"),
        endDate: new Date("2026-11-08T00:00:00.000Z"), cycleType: "WEEK", createdByAccountId: "qa-account",
      } });
      await prisma.shift.create({ data: {
        storeId: nightStore, rosterPeriodId: period.id, date: new Date("2026-11-02T00:00:00.000Z"),
        startAt: new Date("2026-11-01T14:00:00.000Z"), endAt: new Date("2026-11-01T16:00:00.000Z"),
        shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
        createdByAccountId: "qa-account", updatedByAccountId: "qa-account",
        assignments: { create: { employeeId: nightEmployee, employeeNameSnapshot: "Fixture Worker",
          employeeTypeSnapshot: "FullTime" } },
      } });
      const assigned = await service.listAssignedShiftsForPresetPreview(nightStore, parsed.slots);
      expect(assigned).toMatchObject([{ date: "2026-11-02",
        startAt: "2026-11-01T14:00:00.000Z", endAt: "2026-11-01T16:00:00.000Z" }]);
      expect(previewPresetTimeSlots(parsed.slots, [], assigned).summary.conflict).toBe(1);
      await expect(service.commitPresetTimeSlots(commitInput)).rejects.toMatchObject({ status: 422 });
      expect(await prisma.employeeAvailability.count({ where: { storeId: nightStore } })).toBe(0);
      expect(await prisma.availabilityScriptImport.count({ where: { storeId: nightStore } })).toBe(0);
      await prisma.shift.deleteMany({ where: { storeId: nightStore } });
      expect(previewPresetTimeSlots(parsed.slots, [], []).summary.create).toBe(1);
      const committed = await service.commitPresetTimeSlots(commitInput);
      expect(committed).toMatchObject({ alreadyImported: false, created: 1, unchanged: 0 });
      expect(await prisma.employeeAvailability.findFirstOrThrow({ where: { storeId: nightStore } }))
        .toMatchObject({ employeeId: nightEmployee, date: new Date("2026-11-01T00:00:00.000Z"),
          startAt: new Date("2026-11-01T11:00:00.000Z"), endAt: new Date("2026-11-01T15:00:00.000Z"),
          source: "SCRIPT" });
      expect(await service.commitPresetTimeSlots(commitInput)).toMatchObject({
        importId: committed.importId, alreadyImported: true });
      expect(await prisma.availabilityScriptImport.count({ where: { storeId: nightStore } })).toBe(1);
    } finally {
      await prisma.shift.deleteMany({ where: { storeId: nightStore } });
      await prisma.rosterPeriod.deleteMany({ where: { storeId: nightStore } });
      await prisma.shiftRole.deleteMany({ where: { storeId: nightStore } });
      await prisma.availabilityScriptImport.deleteMany({ where: { storeId: nightStore } });
      await prisma.employeeAvailability.deleteMany({ where: { storeId: nightStore } });
      await prisma.availabilityScriptShortcuts.deleteMany({ where: { storeId: nightStore } });
      await prisma.rosterStoreSettings.deleteMany({ where: { storeId: nightStore } });
    }
  });
});

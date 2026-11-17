import { describe, expect, it } from "vitest";
import { parsePresetTimeSlotScript } from "../src/presetTimeSlotScript.js";

const base = {
  shortcuts: [{ code: "AA", startTime: "10:00", endTime: "22:00" }, { code: "BB", startTime: "10:00", endTime: "17:00" }],
  employees: [{ id: "canonical-1", displayName: "Example Worker", storeId: "hurstville", isActive: true }],
  storeId: "hurstville", today: "2026-10-20", week: "NEXT" as const, timezone: "Australia/Sydney",
};

describe("BHS Preset Time Slot Script subset", () => {
  it("decodes a tab-separated nickname and weekday shortcuts in the store time zone", () => {
    const result = parsePresetTimeSlotScript({ ...base, script: "Example Worker\t1AA 2BB\n" });
    expect(result.weekStart).toBe("2026-10-26");
    expect(result.issues).toEqual([]);
    expect(result.slots.map(({ employeeId, date, startAt, endAt }) => ({ employeeId, date, startAt, endAt }))).toEqual([
      { employeeId: "canonical-1", date: "2026-10-26", startAt: "2026-10-25T23:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z" },
      { employeeId: "canonical-1", date: "2026-10-27", startAt: "2026-10-26T23:00:00.000Z", endAt: "2026-10-27T06:00:00.000Z" },
    ]);
  });

  it("accepts BHS contiguous day notation and ranges, case insensitively", () => {
    const result = parsePresetTimeSlotScript({ ...base, script: "example worker\t12aa 3-5bb" });
    expect(result.issues).toEqual([]);
    expect(result.slots.map((slot) => slot.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
  });

  it("accepts the 20-letter shortcut advertised in BHS Edit Script and rejects 21 letters", () => {
    const code = "ABCDEFGHIJKLMNOPQRST";
    const accepted = parsePresetTimeSlotScript({ ...base,
      shortcuts: [{ code, startTime: "10:00", endTime: "22:00" }],
      script: `Example Worker\t1${code}` });
    expect(accepted.issues).toEqual([]);
    expect(accepted.slots).toMatchObject([{ shortcut: code, date: "2026-10-26", employeeId: "canonical-1" }]);
    const tooLong = parsePresetTimeSlotScript({ ...base,
      shortcuts: [{ code: `${code}U`, startTime: "10:00", endTime: "22:00" }],
      script: `Example Worker\t1${code}U` });
    expect(tooLong.slots).toEqual([]);
    expect(tooLong.issues.map((issue) => issue.code)).toContain("INVALID_SHORTCUT");
  });

  it("accepts a name followed by joined or spaced weekday-shortcut groups", () => {
    const joined = parsePresetTimeSlotScript({ ...base, script: "Example Worker\t1AA2AA34567AA" });
    expect(joined.issues).toEqual([]);
    expect(joined.slots.map((slot) => slot.date)).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
    const allDays = parsePresetTimeSlotScript({ ...base, script: "Example Worker 1234567AA" });
    expect(allDays.issues).toEqual([]);
    expect(allDays.slots).toHaveLength(7);
    const spaced = parsePresetTimeSlotScript({ ...base, script: "Example Worker 1AA 2AA 34567AA" });
    expect(spaced.issues).toEqual([]);
    expect(spaced.slots.map((slot) => slot.date)).toEqual(joined.slots.map((slot) => slot.date));
    for (const expression of ["1234567AA", "1AA 2AA 34567AA"]) {
      const bhsTabSeparated = parsePresetTimeSlotScript({ ...base, script: `Example Worker\t${expression}` });
      expect(bhsTabSeparated.issues).toEqual([]);
      expect(bhsTabSeparated.slots).toEqual(joined.slots);
    }
  });

  it("accepts codes directly after an exact known employee name without a separator", () => {
    for (const expression of ["1234567AA", "1AA2AA34567AA"]) {
      const result = parsePresetTimeSlotScript({ ...base, script: `Example Worker${expression}` });
      expect(result.issues).toEqual([]);
      expect(result.slots.map((slot) => slot.date)).toEqual([
        "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
      ]);
      expect(result.slots.every((slot) => slot.employeeId === "canonical-1")).toBe(true);
    }
  });

  it("accepts punctuation in a canonical Evaluate display name while rejecting control characters", () => {
    const employees = [{ ...base.employees[0]!, displayName: "Anne (Tea) & Co" }];
    for (const script of ["Anne (Tea) & Co\t1234567AA", "Anne (Tea) & Co1AA2AA34567AA"]) {
      const result = parsePresetTimeSlotScript({ ...base, employees, script });
      expect(result.issues).toEqual([]);
      expect(result.slots).toHaveLength(7);
      expect(result.slots.every((slot) => slot.employeeId === "canonical-1")).toBe(true);
    }
    const control = parsePresetTimeSlotScript({ ...base, employees, script: "Anne (Tea) & Co\u202e\t1AA" });
    expect(control.slots).toEqual([]);
    expect(control.issues[0]?.code).toBe("INVALID_CHARACTERS");
  });

  it("does not guess a directly joined employee boundary or resolve a duplicate name", () => {
    const employees = [
      { id: "canonical-alex", displayName: "Alex", storeId: "hurstville", isActive: true },
      { id: "canonical-alex-code", displayName: "Alex1AA", storeId: "hurstville", isActive: true },
    ];
    const boundary = parsePresetTimeSlotScript({ ...base, employees, script: "Alex1AA2BB" });
    expect(boundary.slots).toEqual([]);
    expect(boundary.issues.map((issue) => issue.code)).toContain("AMBIGUOUS_NAME_BOUNDARY");
    const duplicate = parsePresetTimeSlotScript({ ...base,
      employees: [...base.employees, { ...base.employees[0]!, id: "canonical-2" }],
      script: "Example Worker1AA" });
    expect(duplicate.slots).toEqual([]);
    expect(duplicate.issues.map((issue) => issue.code)).toContain("AMBIGUOUS_EMPLOYEE");
    const identifier = parsePresetTimeSlotScript({ ...base, script: "canonical-11AA" });
    expect(identifier.slots).toEqual([]);
  });

  it("requires a tab when a code-looking suffix also belongs to another employee name", () => {
    const employees = [
      { id: "canonical-alex", displayName: "Alex", storeId: "hurstville", isActive: true },
      { id: "canonical-alex-code", displayName: "Alex 1AA", storeId: "hurstville", isActive: true },
    ];
    const ambiguous = parsePresetTimeSlotScript({ ...base, employees, script: "Alex 1AA 2BB" });
    expect(ambiguous.slots).toEqual([]);
    expect(ambiguous.issues.map((issue) => issue.code)).toContain("AMBIGUOUS_NAME_BOUNDARY");
    const shorter = parsePresetTimeSlotScript({ ...base, employees, script: "Alex\t1AA 2BB" });
    expect(shorter.issues).toEqual([]);
    expect(shorter.slots).toHaveLength(2);
    expect(shorter.slots.every((slot) => slot.employeeId === "canonical-alex")).toBe(true);
    const longer = parsePresetTimeSlotScript({ ...base, employees, script: "Alex 1AA\t2BB" });
    expect(longer.issues).toEqual([]);
    expect(longer.slots).toMatchObject([{ employeeId: "canonical-alex-code" }]);
  });

  it("counts populated employee rows rather than trailing blank paste lines", () => {
    const employees = Array.from({ length: 100 }, (_, index) => ({
      id: `canonical-${index}`, displayName: `Worker ${index}`, storeId: "hurstville", isActive: true,
    }));
    const rows = employees.map((employee) => `${employee.displayName}\t1AA`);
    const accepted = parsePresetTimeSlotScript({ ...base, employees, script: `${rows.join("\n")}\n\n` });
    expect(accepted.issues).toEqual([]);
    expect(accepted.slots).toHaveLength(100);
    const tooMany = parsePresetTimeSlotScript({ ...base, employees: [...employees, {
      id: "canonical-100", displayName: "Worker 100", storeId: "hurstville", isActive: true,
    }], script: [...rows, "Worker 100\t1AA"].join("\n") });
    expect(tooMany.issues.map((issue) => issue.code)).toContain("TOO_MANY_LINES");
  });

  it("rejects duplicate days, missing code, unknown and ambiguous employees", () => {
    const duplicate = parsePresetTimeSlotScript({ ...base, script: "Example Worker\t12AA 2BB" });
    expect(duplicate.issues.map((issue) => issue.code)).toContain("DUPLICATE_DAY");
    const sameDay = parsePresetTimeSlotScript({ ...base, script: "Example Worker\t1AA1BB" });
    expect(sameDay.slots.map(({ date, shortcut }) => ({ date, shortcut }))).toEqual([
      { date: "2026-10-26", shortcut: "AA" },
      { date: "2026-10-26", shortcut: "BB" },
    ]);
    expect(sameDay.issues.map((issue) => issue.code)).toContain("DUPLICATE_DAY");
    expect(parsePresetTimeSlotScript({ ...base, script: "Example Worker" }).issues[0]?.code).toBe("INVALID_ROW");
    expect(parsePresetTimeSlotScript({ ...base, script: "Missing\t1AA" }).issues[0]?.code).toBe("UNKNOWN_EMPLOYEE");
    expect(parsePresetTimeSlotScript({ ...base, employees: [...base.employees, { ...base.employees[0]!, id: "canonical-2" }], script: "Example Worker\t1AA" }).issues[0]?.code).toBe("AMBIGUOUS_EMPLOYEE");
  });

  it("rejects inactive or cross-store employees and unknown shortcuts", () => {
    expect(parsePresetTimeSlotScript({ ...base, employees: [{ ...base.employees[0]!, isActive: false }], script: "Example Worker\t1AA" }).issues[0]?.code).toBe("EMPLOYEE_OUT_OF_SCOPE");
    expect(parsePresetTimeSlotScript({ ...base, employees: [{ ...base.employees[0]!, storeId: "other" }], script: "Example Worker\t1AA" }).issues[0]?.code).toBe("EMPLOYEE_OUT_OF_SCOPE");
    expect(parsePresetTimeSlotScript({ ...base, script: "Example Worker\t1ZZ" }).issues[0]?.code).toBe("UNKNOWN_SHORTCUT");
  });

  it("requires an explicit canonical choice for an unknown nickname and rechecks current scope", () => {
    const script = "Tea Nickname\t1AA";
    const unresolved = parsePresetTimeSlotScript({ ...base, script });
    expect(unresolved.issues).toMatchObject([{ code: "UNKNOWN_EMPLOYEE", nickname: "Tea Nickname" }]);
    const mapped = parsePresetTimeSlotScript({ ...base, script,
      employeeMappings: [{ nickname: "Tea Nickname", employeeId: "canonical-1" }] });
    expect(mapped.issues).toEqual([]);
    expect(mapped.slots).toMatchObject([{ employeeId: "canonical-1", employeeName: "Example Worker" }]);
    const transferred = parsePresetTimeSlotScript({ ...base, script,
      employeeMappings: [{ nickname: "Tea Nickname", employeeId: "other-store-id" }] });
    expect(transferred.issues).toMatchObject([{ code: "MAPPED_EMPLOYEE_MISSING", nickname: "Tea Nickname" }]);
    const archived = parsePresetTimeSlotScript({ ...base, script, employees: [{ ...base.employees[0]!, isActive: false }],
      employeeMappings: [{ nickname: "Tea Nickname", employeeId: "canonical-1" }] });
    expect(archived.issues).toMatchObject([{ code: "EMPLOYEE_OUT_OF_SCOPE", nickname: "Tea Nickname" }]);
  });

  it("offers an explicit employee choice for an unknown nickname joined directly to codes", () => {
    for (const expression of ["1234567AA", "1AA2AA34567AA"]) {
      const script = `Tea Nickname${expression}`;
      const unresolved = parsePresetTimeSlotScript({ ...base, script });
      expect(unresolved.slots).toEqual([]);
      expect(unresolved.issues).toMatchObject([{ code: "UNKNOWN_EMPLOYEE", nickname: "Tea Nickname" }]);
      const mapped = parsePresetTimeSlotScript({ ...base, script,
        employeeMappings: [{ nickname: "Tea Nickname", employeeId: "canonical-1" }] });
      expect(mapped.issues).toEqual([]);
      expect(mapped.slots).toHaveLength(7);
      expect(mapped.slots.every((slot) => slot.employeeId === "canonical-1")).toBe(true);
    }
    const digitName = parsePresetTimeSlotScript({ ...base, script: "Tea 2 Nickname1AA" });
    expect(digitName.slots).toEqual([]);
    expect(digitName.issues[0]?.code).toBe("AMBIGUOUS_NAME_BOUNDARY");
  });

  it("offers an employee choice when an unknown joined nickname ends in punctuation", () => {
    for (const expression of ["1234567AA", "1AA2AA34567AA"]) {
      const script = `Tea (Nick)${expression}`;
      const unresolved = parsePresetTimeSlotScript({ ...base, script });
      expect(unresolved.issues).toMatchObject([{ code: "UNKNOWN_EMPLOYEE", nickname: "Tea (Nick)" }]);
      const mapped = parsePresetTimeSlotScript({ ...base, script,
        employeeMappings: [{ nickname: "Tea (Nick)", employeeId: "canonical-1" }] });
      expect(mapped.issues).toEqual([]);
      expect(mapped.slots).toHaveLength(7);
    }
  });

  it("rejects duplicate normalized nickname mappings and resolves duplicate display names only by explicit ID", () => {
    const employees = [...base.employees, { ...base.employees[0]!, id: "canonical-2" }];
    const script = "Example Worker\t1AA";
    expect(parsePresetTimeSlotScript({ ...base, employees, script }).issues).toMatchObject([
      { code: "AMBIGUOUS_EMPLOYEE", nickname: "Example Worker" },
    ]);
    expect(parsePresetTimeSlotScript({ ...base, employees, script,
      employeeMappings: [{ nickname: "Example Worker", employeeId: "canonical-2" }] }).slots[0]?.employeeId).toBe("canonical-2");
    expect(parsePresetTimeSlotScript({ ...base, script,
      employeeMappings: [{ nickname: "Tea Nickname", employeeId: "canonical-1" }, { nickname: "tea nickname", employeeId: "canonical-1" }] })
      .issues[0]?.code).toBe("DUPLICATE_MAPPING");
  });

  it("refuses an alias mapping that redirects an unambiguous employee name", () => {
    const employees = [...base.employees, { id: "canonical-2", displayName: "Another Worker", storeId: "hurstville", isActive: true }];
    const result = parsePresetTimeSlotScript({ ...base, employees, script: "Example Worker 1AA",
      employeeMappings: [{ nickname: "Example Worker", employeeId: "canonical-2" }] });
    expect(result.slots).toEqual([]);
    expect(result.issues).toMatchObject([{ code: "MAPPING_CONFLICT", nickname: "Example Worker" }]);
    const ambiguous = parsePresetTimeSlotScript({ ...base,
      employees: [...employees, { ...base.employees[0]!, id: "canonical-3" }], script: "Example Worker 1AA",
      employeeMappings: [{ nickname: "Example Worker", employeeId: "canonical-2" }] });
    expect(ambiguous.slots).toEqual([]);
    expect(ambiguous.issues).toMatchObject([{ code: "MAPPING_CONFLICT", nickname: "Example Worker" }]);
  });

  it("resolves script names to Evaluate canonical IDs without accepting an ID as a display name", () => {
    const name = parsePresetTimeSlotScript({ ...base, script: "Example Worker 1AA" });
    expect(name.issues).toEqual([]);
    expect(name.slots[0]).toMatchObject({ employeeId: "canonical-1", employeeName: "Example Worker" });
    const identifier = parsePresetTimeSlotScript({ ...base, script: "canonical-1\t1AA" });
    expect(identifier.slots).toEqual([]);
    expect(identifier.issues).toMatchObject([{ code: "UNKNOWN_EMPLOYEE", nickname: "canonical-1" }]);
  });

  it("rejects nonexistent and repeated DST wall clocks rather than silently choosing an occurrence", () => {
    const spring = parsePresetTimeSlotScript({ ...base, today: "2026-09-28", week: "CURRENT", shortcuts: [{ code: "AA", startTime: "02:30", endTime: "03:30" }], script: "Example Worker\t7AA" });
    expect(spring.issues[0]?.code).toBe("INVALID_LOCAL_TIME");
    const fall = parsePresetTimeSlotScript({ ...base, today: "2027-04-01", week: "CURRENT", shortcuts: [{ code: "AA", startTime: "02:30", endTime: "03:30" }], script: "Example Worker\t7AA" });
    expect(fall.issues[0]?.code).toBe("AMBIGUOUS_LOCAL_TIME");
  });

  it("resolves an overnight shortcut into the following local day, including midnight", () => {
    const night = parsePresetTimeSlotScript({ ...base, script: "Example Worker 1NN",
      shortcuts: [{ code: "NN", startTime: "22:00", endTime: "02:00" }] });
    expect(night.issues).toEqual([]);
    expect(night.slots).toMatchObject([{ date: "2026-10-26",
      startAt: "2026-10-26T11:00:00.000Z", endAt: "2026-10-26T15:00:00.000Z" }]);
    const midnight = parsePresetTimeSlotScript({ ...base, script: "Example Worker 1NN",
      shortcuts: [{ code: "NN", startTime: "22:00", endTime: "00:00" }] });
    expect(midnight.issues).toEqual([]);
    expect(midnight.slots[0]).toMatchObject({ date: "2026-10-26",
      startAt: "2026-10-26T11:00:00.000Z", endAt: "2026-10-26T13:00:00.000Z" });
  });

  it("validates the next day's DST clock and rejects an overnight window longer than 24 elapsed hours", () => {
    const missing = parsePresetTimeSlotScript({ ...base, today: "2026-09-28", week: "CURRENT",
      script: "Example Worker 6NN", shortcuts: [{ code: "NN", startTime: "22:00", endTime: "02:30" }] });
    expect(missing.issues[0]?.code).toBe("INVALID_LOCAL_TIME");
    const repeated = parsePresetTimeSlotScript({ ...base, today: "2027-03-29", week: "CURRENT",
      script: "Example Worker 6NN", shortcuts: [{ code: "NN", startTime: "22:00", endTime: "02:30" }] });
    expect(repeated.issues[0]?.code).toBe("AMBIGUOUS_LOCAL_TIME");
    const tooLong = parsePresetTimeSlotScript({ ...base, today: "2027-03-29", week: "CURRENT",
      script: "Example Worker 6NN", shortcuts: [{ code: "NN", startTime: "23:00", endTime: "22:30" }] });
    expect(tooLong.issues[0]?.code).toBe("INVALID_TIME_RANGE");
  });
});

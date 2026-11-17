import { ApiRequestError } from "./apiClient";
import type { AvailabilityStatus, EmployeeAvailability } from "../types/roster";

type Replacement = {
  storeId: string;
  employeeId: string;
  dates: string[];
  entries: Array<{ date: string; status: AvailabilityStatus; startAt: string | null;
    endAt: string | null; note?: string; source?: "MANUAL" | "TEMPLATE" }>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function instant(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function signature(value: { date: string; status: string; startAt: string | null;
  endAt: string | null; note: string | null; source: string }): string {
  return JSON.stringify([value.date, value.status, instant(value.startAt), instant(value.endAt),
    value.note, value.source]);
}

/** Shared by Staff and Calendar; reject a read that could corrupt an edit or an availability warning. */
export function assertAvailabilityRows(value: unknown, storeId: string, from: string, to: string,
  employeeId?: string): EmployeeAvailability[] {
  if (!Array.isArray(value)) throw invalidRead();
  const ids = new Set<string>();
  for (const row of value) {
    if (!record(row) || typeof row.id !== "string" || !row.id || ids.has(row.id)
      || row.storeId !== storeId || typeof row.employeeId !== "string" || !row.employeeId
      || (employeeId !== undefined && row.employeeId !== employeeId)
      || typeof row.date !== "string" || !validDate(row.date) || row.date < from || row.date > to
      || !["AVAILABLE", "UNAVAILABLE", "UNKNOWN"].includes(String(row.status))
      || !Number.isInteger(row.version) || Number(row.version) < 1
      || (row.note !== null && typeof row.note !== "string")
      || !["MANUAL", "TEMPLATE", "SCRIPT"].includes(String(row.source))) throw invalidRead();
    if (row.status === "UNKNOWN") {
      if (row.startAt !== null || row.endAt !== null) throw invalidRead();
    } else {
      const start = instant(row.startAt);
      const end = instant(row.endAt);
      if (!start || !end || start >= end) throw invalidRead();
    }
    ids.add(row.id);
  }
  return value as EmployeeAvailability[];
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function invalidRead(): ApiRequestError {
  return new ApiRequestError("可用时间读取结果不完整或不属于所选门店、员工与日期；请重新加载。", 200);
}

/** A replacement deletes and recreates exactly the requested date rows. */
export function assertSavedAvailabilityRows(value: unknown, input: Replacement): EmployeeAvailability[] {
  if (!Array.isArray(value) || value.length !== input.entries.length) throw unconfirmed();
  const dates = new Set(input.dates);
  const ids = new Set<string>();
  const actual: string[] = [];
  for (const row of value) {
    if (!record(row) || typeof row.id !== "string" || !row.id || ids.has(row.id)
      || row.storeId !== input.storeId || row.employeeId !== input.employeeId
      || typeof row.date !== "string" || !dates.has(row.date)
      || !["AVAILABLE", "UNAVAILABLE", "UNKNOWN"].includes(String(row.status))
      || !Number.isInteger(row.version) || Number(row.version) < 1
      || (row.note !== null && typeof row.note !== "string")
      || !["MANUAL", "TEMPLATE", "SCRIPT"].includes(String(row.source))
      || instant(row.startAt) === undefined || instant(row.endAt) === undefined) throw unconfirmed();
    ids.add(row.id);
    actual.push(signature(row as Parameters<typeof signature>[0]));
  }
  const expected = input.entries.map((entry) => signature({
    date: entry.date, status: entry.status, startAt: entry.startAt, endAt: entry.endAt,
    note: entry.note?.trim() || null, source: entry.source ?? "MANUAL",
  }));
  actual.sort(); expected.sort();
  if (actual.some((row, index) => row !== expected[index])) throw unconfirmed();
  return value as EmployeeAvailability[];
}

function unconfirmed(): ApiRequestError {
  return new ApiRequestError("服务器返回的可用时间与本次提交不一致，结果尚未确认；请重新加载核对。", 0);
}

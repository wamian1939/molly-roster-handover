import { ApiRequestError } from "./apiClient";
import type { RosterPeriod } from "../types/roster";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nextPeriod(value: unknown, previous: RosterPeriod, status: RosterPeriod["status"]): value is RosterPeriod {
  return record(value) && value.id === previous.id && value.storeId === previous.storeId
    && value.startDate === previous.startDate && value.endDate === previous.endDate
    && value.cycleType === previous.cycleType && value.status === status
    && value.version === previous.version + 1
    && (value.publishedAt === null || validInstant(value.publishedAt));
}

/** Publication and period status are committed in the same backend transaction. */
export function assertPublishedPeriod(value: unknown, previous: RosterPeriod): { period: RosterPeriod; publication: Record<string, unknown> } {
  if (!record(value) || previous.status !== "DRAFT" || !nextPeriod(value.period, previous, "PUBLISHED")
    || !validInstant(value.period.publishedAt) || !record(value.publication)) throw unconfirmed();
  const publication = value.publication;
  const snapshot = publication.snapshot;
  if (typeof publication.id !== "string" || !publication.id
    || publication.rosterPeriodId !== previous.id || publication.periodVersion !== previous.version + 1
    || publication.publishedAt !== value.period.publishedAt
    || !record(snapshot) || snapshot.schemaVersion !== 1
    || !record(snapshot.store) || snapshot.store.id !== previous.storeId
    || !record(snapshot.period) || snapshot.period.id !== previous.id
    || snapshot.period.storeId !== previous.storeId
    || snapshot.period.startDate !== previous.startDate || snapshot.period.endDate !== previous.endDate
    || snapshot.period.cycleType !== previous.cycleType
    || snapshot.period.status !== "PUBLISHED" || snapshot.period.version !== previous.version + 1
    || !Array.isArray(snapshot.shifts) || snapshot.shifts.length === 0) throw unconfirmed();
  return value as { period: RosterPeriod; publication: Record<string, unknown> };
}

export function assertReopenedPeriod(value: unknown, previous: RosterPeriod): RosterPeriod {
  if (previous.status !== "PUBLISHED" || !nextPeriod(value, previous, "DRAFT")
    || value.publishedAt !== previous.publishedAt) throw unconfirmed();
  return value;
}

function unconfirmed(): ApiRequestError {
  return new ApiRequestError("排班周期状态或发布记录与本次操作不一致，结果尚未确认；请刷新核对。", 0);
}

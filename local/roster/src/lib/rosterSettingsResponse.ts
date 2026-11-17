import type { RosterStoreSettings } from "../types/roster";

function validStoredSettings(value: unknown, storeId: string): value is RosterStoreSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const clock = (time: unknown) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (typeof row.timezone !== "string") return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: row.timezone }); }
  catch { return false; }
  return row.storeId === storeId && Number.isInteger(row.version) && Number(row.version) > 0
    && clock(row.openingTime) && clock(row.closingTime)
    && (row.slotIntervalMinutes === 15 || row.slotIntervalMinutes === 30 || row.slotIntervalMinutes === 60)
    && ["minimumShiftMinutes", "defaultBreakMinutes", "weeklyHourWarning", "dailyHourWarning"].every((field) =>
      typeof row[field] === "number" && Number.isFinite(row[field]))
    && Number.isInteger(row.weekStartsOn) && Number(row.weekStartsOn) >= 0 && Number(row.weekStartsOn) <= 6
    && (row.cycleType === "WEEK" || row.cycleType === "FORTNIGHT")
    && (row.fortnightAnchorDate === undefined || row.fortnightAnchorDate === null
      || (typeof row.fortnightAnchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.fortnightAnchorDate)));
}

export function assertRosterSettingsResponse(value: unknown, storeId: string): RosterStoreSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "settings")) {
    throw new Error("门店设置响应不完整，请重试");
  }
  const settings = (value as Record<string, unknown>).settings;
  if (settings !== null && !validStoredSettings(settings, storeId)) {
    throw new Error("门店设置响应不完整，请重试");
  }
  return settings;
}

export class RosterSettingsMutationResponseError extends Error {
  constructor() {
    super("服务器返回的设置与当前门店不符或内容不完整。请重新读取核对是否已保存，避免重复提交。");
    this.name = "RosterSettingsMutationResponseError";
  }
}

export function assertSavedRosterSettingsResponse(value: unknown, submitted: RosterStoreSettings): RosterStoreSettings {
  if (!validStoredSettings(value, submitted.storeId)
    || value.version !== (submitted.version === undefined ? 1 : submitted.version + 1)
    || (submitted.id !== undefined && value.id !== submitted.id)
    || ["timezone", "openingTime", "closingTime", "slotIntervalMinutes", "minimumShiftMinutes",
      "defaultBreakMinutes", "weekStartsOn", "cycleType", "weeklyHourWarning", "dailyHourWarning"].some((key) =>
      value[key as keyof RosterStoreSettings] !== submitted[key as keyof RosterStoreSettings])
    || (value.fortnightAnchorDate ?? null) !== (submitted.cycleType === "FORTNIGHT" ? submitted.fortnightAnchorDate ?? null : null)) {
    throw new RosterSettingsMutationResponseError();
  }
  return value;
}

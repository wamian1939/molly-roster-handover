import { DateTime } from "luxon";

export const DEFAULT_STORE_TIMEZONE = "Australia/Sydney";

export function storeParts(value: Date | string, timezone: string) {
  const instant = typeof value === "string" ? new Date(value) : value;
  const local = DateTime.fromJSDate(instant, { zone: timezone });
  if (!local.isValid) throw new Error("门店时区或班次时间无效");
  return { date: local.toFormat("yyyy-MM-dd"), time: local.toFormat("HH:mm") };
}

export function storeDateTime(date: string, time: string, timezone: string) {
  return storeDateTimeCandidates(date, time, timezone)[0];
}

export function storeDateTimeCandidates(date: string, time: string, timezone: string): Date[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("请输入有效的日期和 HH:mm 时间");
  const local = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  if (!local.isValid || local.toFormat("yyyy-MM-dd HH:mm") !== `${date} ${time}`) throw new Error(`${date} ${time} 在门店时区不存在，请选择其他时间`);
  const possible = local.getPossibleOffsets().sort((left, right) => left.toMillis() - right.toMillis());
  return (possible.length ? possible : [local]).map((candidate) => candidate.toJSDate());
}

export function addCalendarDays(date: string, days: number) {
  const value = DateTime.fromISO(date, { zone: "UTC" });
  if (!value.isValid) throw new Error("日期无效");
  return value.plus({ days }).toFormat("yyyy-MM-dd");
}

export function isStoreClockChangeDate(date: string, timezone: string): boolean {
  const start = storeDateTime(date, "00:00", timezone);
  const next = storeDateTime(addCalendarDays(date, 1), "00:00", timezone);
  return next.getTime() - start.getTime() !== 24 * 60 * 60 * 1000;
}

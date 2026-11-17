import { DateTime } from "luxon";

export function dateInputValue(date: Date) {
  const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function timeInputValue(date: Date) { return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; }

export function combineLocal(date: string, time: string) { return new Date(`${date}T${time}:00`); }

export function weekRange(date: string, weekStartsOn = 1) {
  const target = new Date(`${date}T12:00:00Z`);
  const offset = (target.getUTCDay() - weekStartsOn + 7) % 7;
  const start = new Date(target); start.setUTCDate(start.getUTCDate() - offset);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

export function rosterCycleRange(date: string, settings: { cycleType: "WEEK" | "FORTNIGHT"; weekStartsOn: number; fortnightAnchorDate?: string | null } | null) {
  if (settings?.cycleType !== "FORTNIGHT") return { ...weekRange(date, settings?.weekStartsOn ?? 1), cycleType: "WEEK" as const };
  const anchor = settings.fortnightAnchorDate;
  if (!anchor || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) throw new Error("\u8bf7\u5148\u5728\u95e8\u5e97\u8bbe\u7f6e\u4e2d\u786e\u8ba4\u53cc\u5468\u8d77\u59cb\u65e5\u671f");
  const targetDate = new Date(`${date}T12:00:00Z`);
  const anchorDate = new Date(`${anchor}T12:00:00Z`);
  if (!Number.isFinite(targetDate.getTime()) || targetDate.toISOString().slice(0, 10) !== date ||
    !Number.isFinite(anchorDate.getTime()) || anchorDate.toISOString().slice(0, 10) !== anchor ||
    anchorDate.getUTCDay() !== settings.weekStartsOn) {
    throw new Error("\u53cc\u5468\u8d77\u59cb\u65e5\u671f\u4e0e\u95e8\u5e97\u5468\u8d77\u59cb\u65e5\u4e0d\u4e00\u81f4\uff0c\u8bf7\u68c0\u67e5\u95e8\u5e97\u8bbe\u7f6e\u548c\u6240\u9009\u65e5\u671f");
  }
  const dayOffset = Math.floor((targetDate.getTime() - anchorDate.getTime()) / 86_400_000 / 14) * 14;
  const cycleStart = new Date(anchorDate); cycleStart.setUTCDate(cycleStart.getUTCDate() + dayOffset);
  const cycleEnd = new Date(cycleStart); cycleEnd.setUTCDate(cycleEnd.getUTCDate() + 13);
  return { startDate: cycleStart.toISOString().slice(0, 10), endDate: cycleEnd.toISOString().slice(0, 10), cycleType: "FORTNIGHT" as const };
}

export function formatTime(value: string | Date, timezone?: string) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, ...(timezone ? { timeZone: timezone } : {}) }).format(typeof value === "string" ? new Date(value) : value); }

export function formatShiftTimeRange(startAt: string, endAt: string, timezone?: string) {
  if (!timezone) return `${formatTime(startAt)}–${formatTime(endAt)}`;
  const start = DateTime.fromISO(startAt, { zone: timezone });
  const end = DateTime.fromISO(endAt, { zone: timezone });
  const offset = (value: DateTime) => ` UTC${value.toFormat("ZZ").replace(/:00$/, "")}`;
  const showOffset = start.offset !== end.offset;
  const endDate = start.toISODate() === end.toISODate() ? "" : `（${end.toFormat("MM-dd")}）`;
  return `${start.toFormat("HH:mm")}${showOffset ? offset(start) : ""}–${end.toFormat("HH:mm")}${showOffset ? offset(end) : ""}${endDate}`;
}

export function formatElapsedDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0) return "--";
  const wholeMinutes = Math.round(minutes);
  const hours = Math.floor(wholeMinutes / 60);
  const remainder = wholeMinutes % 60;
  return `${hours ? `${hours} 小时` : ""}${hours && remainder ? " " : ""}${remainder ? `${remainder} 分钟` : ""}` || "0 分钟";
}

export function safeTimeRangeLabel(start: Date, end: Date, startFallback = "", endFallback = "") {
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? `${formatTime(start)} - ${formatTime(end)}` : `${startFallback || "--:--"} - ${endFallback || "--:--"}`;
}

export function netHours(startAt: string, endAt: string, breakMinutes: number) { return Math.max(0, (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000 - breakMinutes / 60); }

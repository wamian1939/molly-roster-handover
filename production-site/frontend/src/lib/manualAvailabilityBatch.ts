import { addCalendarDays, storeDateTimeCandidates } from "./storeTime";

export function manualAvailabilityBatchEntries(
  dates: string[], startTime: string, endTime: string, endNextDay: boolean, timezone: string,
) {
  if (!dates.length || dates.length > 31) throw new Error("请选择 1–31 个日期");
  if (new Set(dates).size !== dates.length) throw new Error("日期不能重复");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
    throw new Error("请输入有效的开始和结束时间");
  }
  return [...dates].sort().map((date) => {
    const starts = storeDateTimeCandidates(date, startTime, timezone);
    const ends = storeDateTimeCandidates(endNextDay ? addCalendarDays(date, 1) : date, endTime, timezone);
    if (starts.length !== 1 || ends.length !== 1) {
      throw new Error(`${date} 的时间不存在或在夏令时回拨时重复；请在逐日编辑器中明确选择时间`);
    }
    const start = starts[0]!;
    const end = ends[0]!;
    if (!(start < end) || end.getTime() - start.getTime() > 86_400_000) {
      throw new Error(`${date} 的结束时间必须晚于开始时间，且实际时长不得超过 24 小时`);
    }
    return { date, status: "AVAILABLE" as const, startAt: start.toISOString(), endAt: end.toISOString(), source: "MANUAL" as const };
  });
}

export function zonedLocalParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function offsetMinutes(value: Date, timezone: string) {
  const label = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(value).find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(label ?? "");
  if (label === "GMT") return 0;
  if (!match) throw new Error(`Unsupported time zone offset: ${timezone}`);
  return (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

export function zonedClockToDate(date: string, time: string, timezone: string) {
  return zonedClockCandidates(date, time, timezone)[0];
}

export function zonedClockCandidates(date: string, time: string, timezone: string): Date[] {
  const wallClockUtc = Date.parse(`${date}T${time}:00.000Z`);
  if (!Number.isFinite(wallClockUtc)) throw new Error("Invalid calendar date or time");
  const candidates = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const probe = new Date(wallClockUtc + hours * 3_600_000);
    candidates.add(wallClockUtc - offsetMinutes(probe, timezone) * 60_000);
  }
  const matches = [...candidates].sort((a, b) => a - b).filter((candidate) => {
    const local = zonedLocalParts(new Date(candidate), timezone);
    return local.date === date && local.time === time;
  });
  if (!matches.length) throw new Error(`${date} ${time} does not exist in ${timezone} because of a clock change`);
  return matches.map((candidate) => new Date(candidate));
}

function occurrenceIndex(instant: Date, local: { date: string; time: string }, timezone: string) {
  const minute = Math.floor(instant.getTime() / 60_000);
  return Math.max(0, zonedClockCandidates(local.date, local.time, timezone)
    .findIndex((candidate) => Math.floor(candidate.getTime() / 60_000) === minute));
}

export function copyShiftWallClock(shift: { date: Date; startAt: Date; endAt: Date }, dayOffset: number, timezone: string) {
  const sourceDate = shift.date.toISOString().slice(0, 10);
  const movedDate = new Date(`${sourceDate}T00:00:00.000Z`);
  movedDate.setUTCDate(movedDate.getUTCDate() + dayOffset);
  const date = movedDate.toISOString().slice(0, 10);
  const sourceStart = zonedLocalParts(shift.startAt, timezone);
  const sourceEnd = zonedLocalParts(shift.endAt, timezone);
  const endDayOffset = Math.round((Date.parse(`${sourceEnd.date}T00:00:00Z`) - Date.parse(`${sourceStart.date}T00:00:00Z`)) / 86_400_000);
  const targetEnd = new Date(`${date}T00:00:00.000Z`);
  targetEnd.setUTCDate(targetEnd.getUTCDate() + endDayOffset);
  const targetStart = zonedClockCandidates(date, sourceStart.time, timezone);
  const targetFinish = zonedClockCandidates(targetEnd.toISOString().slice(0, 10), sourceEnd.time, timezone);
  const startAt = targetStart[occurrenceIndex(shift.startAt, sourceStart, timezone)] ?? targetStart[0];
  const endAt = targetFinish[occurrenceIndex(shift.endAt, sourceEnd, timezone)] ?? targetFinish[0];
  if (!(startAt < endAt)) throw new Error("复制后的结束时间必须晚于开始时间；目标日期不包含来源班次的重复时段");
  return { date, startAt, endAt };
}

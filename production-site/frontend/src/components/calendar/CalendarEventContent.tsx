import { isCalendarShiftGroup } from "../../lib/calendarGrouping";
import { formatElapsedDuration, formatShiftTimeRange } from "../../lib/dateTime";
import { DateTime } from "luxon";
import { ShiftEventCard } from "./ShiftEventCard";

export type CalendarEventContentProps = {
  isMirror: boolean;
  timeText: string;
  viewType: string;
  shiftGroup: unknown;
  timezone?: string;
  startAt?: Date | null;
  endAt?: Date | null;
  unverifiedRole?: boolean;
};

export function CalendarEventContent({ isMirror, timeText, viewType, shiftGroup, timezone, startAt, endAt, unverifiedRole = false }: CalendarEventContentProps) {
  if (isMirror) {
    const offsetChanged = timezone && startAt && endAt && DateTime.fromJSDate(startAt, { zone: timezone }).offset !== DateTime.fromJSDate(endAt, { zone: timezone }).offset;
    const mirrorTime = offsetChanged ? formatShiftTimeRange(startAt.toISOString(), endAt.toISOString(), timezone) : timeText;
    const duration = offsetChanged ? formatElapsedDuration((endAt.getTime() - startAt.getTime()) / 60_000) : null;
    return (
      <div className="shift-selection-mirror" aria-label={`${mirrorTime}${duration ? `，实际 ${duration}` : ""}，松开创建班次`}>
        <strong>{mirrorTime}</strong>
        {duration ? <span>实际 {duration}</span> : null}
        <span>松开创建班次</span>
      </div>
    );
  }

  if (!isCalendarShiftGroup(shiftGroup)) {
    if (import.meta.env.DEV) console.warn("Missing or invalid calendar shift group");
    return <div className="shift-event-invalid" role="status">班次数据暂不可用</div>;
  }

  return <ShiftEventCard group={shiftGroup} compact={viewType === "dayGridMonth"} timezone={timezone} unverifiedRole={unverifiedRole} />;
}

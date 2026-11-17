import { formatBreakHours, type CalendarShiftGroup } from "../../lib/calendarGrouping";
import { formatShiftTimeRange } from "../../lib/dateTime";
import { roleColorStyle } from "../../lib/roleColor";
import {isAgentShift} from '../../lib/agentShift';

export function ShiftEventCard({ group, compact = false, timezone, unverifiedRole = false }: { group: CalendarShiftGroup; compact?: boolean; timezone?: string; unverifiedRole?: boolean }) {
  const names = group.assignments.map((assignment) => assignment.employeeName);
  const durationMinutes = Math.max(0, (new Date(group.endAt).getTime() - new Date(group.startAt).getTime()) / 60_000);
  const density = durationMinutes >= 360 ? "tall" : durationMinutes >= 180 ? "medium" : "short";
  const visibleNames = density === "short" ? names.slice(0, 1) : names;
  const hiddenNameCount = names.length - visibleNames.length;
  const timeRange = formatShiftTimeRange(group.startAt, group.endAt, timezone);
  const preview=group.sourceShifts.some(s=>s.agentPreview);
  const pendingBreak=preview||group.sourceShifts.some(s=>s.breakMinutes===0&&s.internalNote?.includes('休息尚未安排'));
  const baseRoleLabel = unverifiedRole ? `待核对 · ${group.role.name}` : group.role.name;
  const roleLabel=baseRoleLabel;
  const agentCount=group.sourceShifts.filter(isAgentShift).length;
  const agentLabel=agentCount===group.sourceShifts.length?'智能体排班':'含智能体排班';
  const breakLabel = pendingBreak?'休息待核对':group.mixedBreakMinutes ? "休息时长不同" : `Break: ${formatBreakHours(group.breakMinutes)}`;
  const label = [
    roleLabel,
    timeRange,
    breakLabel,
    names.join("、") || "暂未分配员工",
    ...(agentCount?[agentLabel,...(preview?['尚未保存']:[])]:[]),
  ].join("，");

  if (compact) {
    return <article
      className="shift-event-card shift-event-card--compact"
      style={roleColorStyle({ id: group.role.id, code: group.role.code, colorToken: group.role.colorToken })}
      aria-label={label}
      title={label}
      data-assignment-count={group.assignments.length}
      data-duration-density="month"
      data-agent-preview={preview||undefined}
    >
      <strong className="shift-event-compact-role">{roleLabel}</strong>
      <span className="shift-event-compact-time">{timeRange.replace("–", " ~ ")} / {pendingBreak?'休息待核对':group.mixedBreakMinutes ? "休息各异" : formatBreakHours(group.breakMinutes)}</span>
      {agentCount>0&&<small className="shift-event-origin" title={preview?'智能体排班，尚未保存':'智能体排班'}>{agentLabel}</small>}
    </article>;
  }

  return (
    <article
      className={`shift-event-card shift-event-card--${density}`}
      style={roleColorStyle({ id: group.role.id, code: group.role.code, colorToken: group.role.colorToken })}
      aria-label={label}
      title={label}
      data-assignment-count={group.assignments.length}
      data-duration-density={density}
      data-break-minutes={group.mixedBreakMinutes ? undefined : group.breakMinutes}
      data-agent-preview={preview||undefined}
    >
      <span className="shift-event-header">
        <strong className="shift-event-role">{roleLabel}</strong>
        {agentCount>0&&<small className="shift-event-origin" title={preview?'智能体排班，尚未保存':'智能体排班'}>{agentLabel}</small>}
        <span className="shift-event-time">{timeRange}</span>
        <span className="shift-event-break"><span className="sr-only">{breakLabel}</span><span className="shift-event-break-full">{pendingBreak?'休息待核对':group.mixedBreakMinutes ? "休息时长不同" : formatBreakLabel(group.breakMinutes)}</span><span className="shift-event-break-short">{pendingBreak?'休待定':group.mixedBreakMinutes ? "休息各异" : formatCompactBreak(group.breakMinutes)}</span></span>
      </span>
      <span className="shift-event-assignment-body">
        <span className="shift-event-names">
        {visibleNames.length ? visibleNames.map((name, index) => (
          <span className="shift-event-name" key={`${name}-${index}`}>
            {index ? <span className="shift-event-separator" aria-hidden="true">/</span> : null}
            {name}
          </span>
        )) : <span className="shift-event-name">暂未分配员工</span>}
        {hiddenNameCount ? <span className="shift-event-more">+{hiddenNameCount}</span> : null}
        </span>
      </span>
    </article>
  );
}

function formatBreakLabel(minutes: number) {
  if (minutes === 0) return "无休息";
  if (minutes % 60 === 0) return `休息 ${minutes / 60} 小时`;
  return `休息 ${minutes} 分钟`;
}

function formatCompactBreak(minutes: number) {
  if (minutes === 0) return "休 0";
  if (minutes % 60 === 0) return `休 ${minutes / 60}h`;
  return `休 ${minutes}m`;
}

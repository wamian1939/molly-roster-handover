import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { boundedScheduledDateSelection, calendarMonthDates, calendarWeekNumber, filterScheduledEmployeesByJobs, filterScheduledEmployeesByName, formatScheduledHours, scheduledJobFilters, scheduledShiftOccupiedDates, scheduledWorklogTimeRange, selectedScheduledJobIds, selectedShiftSummaries } from "../../lib/scheduledShiftSummary";
import { rosterRepository } from "../../services/rosterRepository";
import type { CalendarResponse, ShiftRole } from "../../types/roster";
import type { RosterEmployee, RosterStoreJob } from "../../types/workforce";

function monthOffset(anchor: string, offset: number): string {
  const [year, month] = anchor.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00.000Z`));
}

type CalendarScheduledSidebarProps = {
  storeId: string;
  initialDate: string;
  weekStartsOn: number;
  timezone: string;
  currentEmployeeNames: ReadonlyMap<string, string>;
  employees: RosterEmployee[];
  jobs: RosterStoreJob[];
  verifiedRoles: ShiftRole[];
  refreshKey: CalendarResponse | null;
  onClose: () => void;
};

export function CalendarScheduledSidebar(props: CalendarScheduledSidebarProps) {
  return <CalendarScheduledSidebarContent key={props.storeId} {...props} />;
}

function CalendarScheduledSidebarContent({ storeId, initialDate, weekStartsOn, timezone, currentEmployeeNames, employees, jobs, verifiedRoles, refreshKey, onClose }: CalendarScheduledSidebarProps) {
  const [month, setMonth] = useState(initialDate.slice(0, 7) + "-01");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set([initialDate]));
  const [selectionWarning, setSelectionWarning] = useState("");
  const [search, setSearch] = useState("");
  const [excludedJobIds, setExcludedJobIds] = useState<Set<string>>(() => new Set());
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const dates = useMemo(() => calendarMonthDates(month, weekStartsOn), [month, weekStartsOn]);
  const [displayYear, displayMonth] = month.split("-").map(Number);
  const yearOptions = Array.from({ length: Math.max(2100, displayYear) - Math.min(2010, displayYear) + 1 },
    (_, index) => Math.min(2010, displayYear) + index);
  const from = dates[0];
  const to = dates[dates.length - 1];
  const extraMonths = [...new Set([...selectedDates]
    .filter((date) => date < from || date > to)
    .map((date) => date.slice(0, 7)))].sort().join("|");

  useEffect(() => {
    if (!from || !to) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const ranges = [[from, to], ...extraMonths.split("|").filter(Boolean).map((key) => {
          const otherDates = calendarMonthDates(`${key}-01`, weekStartsOn);
          return [otherDates[0], otherDates[otherDates.length - 1]];
        })];
        const results = await Promise.all(ranges.map(([start, end]) => rosterRepository.calendar(storeId, start, end)));
        if (!active) return;
        if (results.some((result) => result.storeId !== storeId)) throw new Error("门店数据不匹配，请重试");
        setCalendar({ storeId, from: ranges[0][0], to: ranges[0][1],
          shifts: [...new Map(results.flatMap((result) => result.shifts).map((shift) => [shift.id, shift])).values()],
          periods: [...new Map(results.flatMap((result) => result.periods).map((period) => [period.id, period])).values()],
        });
      } catch (cause) {
        if (active) {
          setCalendar(null);
          setError(cause instanceof Error ? cause.message : "班次汇总加载失败");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [storeId, from, to, extraMonths, weekStartsOn, refreshKey, retry]);

  const shiftDates = useMemo(() => scheduledShiftOccupiedDates(calendar?.shifts ?? [], dates, timezone), [calendar, dates, timezone]);
  const shiftStartDates = useMemo(() => new Set(calendar?.shifts.map((shift) => shift.date) ?? []), [calendar]);
  const continuationDates = useMemo(() => new Set([...shiftDates].filter((date) => !shiftStartDates.has(date))), [shiftDates, shiftStartDates]);
  const formalRoleNames = useMemo(() => new Map(verifiedRoles.filter((role) => role.formalJobId)
    .map((role) => [role.id, role.nameZh])), [verifiedRoles]);
  const summaries = useMemo(() => selectedShiftSummaries(
    calendar?.shifts ?? [], calendar?.periods ?? [], selectedDates, currentEmployeeNames, formalRoleNames,
  ), [calendar, selectedDates, currentEmployeeNames, formalRoleNames]);
  const availableJobs = useMemo(() => scheduledJobFilters(jobs, employees, summaries, storeId), [jobs, employees, summaries, storeId]);
  const employeeJobNames = useMemo(() => {
    const names = new Map(availableJobs.map((job) => [job.id, job.name]));
    return new Map(employees.filter((employee) => employee.isActive && employee.storeId === storeId)
      .map((employee) => [employee.id, [...new Set((employee.positions ?? [])
        .map((position) => names.get(position.id)).filter((name): name is string => Boolean(name)))]] as const));
  }, [availableJobs, employees, storeId]);
  const effectiveChosenJobs = useMemo(() => selectedScheduledJobIds(availableJobs, excludedJobIds), [availableJobs, excludedJobIds]);
  const rows = useMemo(() => filterScheduledEmployeesByName(
    filterScheduledEmployeesByJobs(summaries, employees, effectiveChosenJobs, storeId), search, currentEmployeeNames,
  ), [summaries, effectiveChosenJobs, employees, search, storeId, currentEmployeeNames]);
  const selectedCount = selectedDates.size;
  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

  return <aside id="calendar-scheduled-sidebar" className="calendar-scheduled-sidebar" aria-label="已排班次侧栏">
    <div className="calendar-scheduled-sidebar-header">
      <div><h2>已排班次</h2><p>独立选择日期，查看员工工时</p></div>
      <button type="button" className="calendar-icon-button" onClick={onClose} aria-label="关闭排班侧栏"><X className="h-4 w-4" /></button>
    </div>
    <div className="calendar-scheduled-month-nav">
      <button type="button" className="calendar-icon-button" onClick={() => setMonth(monthOffset(month, -1))} aria-label="上一个月"><ChevronLeft className="h-4 w-4" /></button>
      <div className="calendar-scheduled-month-controls">
        <select aria-label="选择月份" value={displayMonth} onChange={(event) => setMonth(`${displayYear}-${String(event.target.value).padStart(2, "0")}-01`)}>
          {Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1}月</option>)}
        </select>
        <select aria-label="选择年份" value={displayYear} onChange={(event) => setMonth(`${event.target.value}-${String(displayMonth).padStart(2, "0")}-01`)}>
          {yearOptions.map((year) => <option key={year} value={year}>{year}年</option>)}
        </select>
      </div>
      <button type="button" className="calendar-icon-button" onClick={() => setMonth(monthOffset(month, 1))} aria-label="下一个月"><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="calendar-scheduled-date-grid" aria-label="汇总日期选择">
      <span className="calendar-scheduled-weekday" aria-hidden="true">周</span>
      {Array.from({ length: 7 }, (_, index) => <span key={index} className="calendar-scheduled-weekday">{weekdayLabels[(weekStartsOn + index) % 7]}</span>)}
        {dates.map((date, index) => <Fragment key={date}>
        {index % 7 === 0 ? <span className="calendar-scheduled-week-number" aria-label={`第 ${calendarWeekNumber(date)} 周`}>{calendarWeekNumber(date)}</span> : null}
        <button type="button" aria-label={date} aria-pressed={selectedDates.has(date)}
          title={continuationDates.has(date) ? "有跨天班次延续；工时计入班次开始日期" : undefined}
          className={`calendar-scheduled-date${date.slice(0, 7) !== month.slice(0, 7) ? " calendar-scheduled-date--outside" : ""}`}
          onClick={() => {
            const next = boundedScheduledDateSelection(selectedDates, date);
            if (!next) { setSelectionWarning("最多选择连续 366 天；请缩小日期范围。"); return; }
            setSelectionWarning("");
            setSelectedDates(next);
          }}>
          {Number(date.slice(-2))}{shiftDates.has(date) ? <span className="calendar-scheduled-date-dot" aria-hidden="true" /> : null}
        </button>
      </Fragment>)}
    </div>
    {selectionWarning ? <p className="px-4 text-sm text-amber-800" role="alert">{selectionWarning}</p> : null}
    <div className="calendar-scheduled-filters">
      <p className="text-sm font-semibold text-graphite-800">员工筛选 · 已选 {selectedCount} 天</p>
      <label className="sr-only" htmlFor="scheduled-employee-search">搜索员工姓名</label>
      <input id="scheduled-employee-search" className="native-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索员工姓名" />
      {availableJobs.length ? <div className="calendar-scheduled-role-filters" aria-label="按员工正式岗位筛选">
        {availableJobs.map((job) => <label key={job.id}><input type="checkbox" checked={!excludedJobIds.has(job.id)} onChange={() => setExcludedJobIds((current) => {
          const next = new Set(current);
          if (next.has(job.id)) next.delete(job.id); else next.add(job.id);
          return next;
        })} />{job.name}</label>)}
      </div> : null}
    </div>
    <div className="calendar-scheduled-results" aria-live="polite">
      {loading ? <p className="calendar-scheduled-message">正在加载班次…</p> : error ? <div className="calendar-scheduled-message" role="alert">{error}<button type="button" className="calendar-text-button mt-2" onClick={() => setRetry((value) => value + 1)}>重试</button></div>
        : !selectedCount ? <p className="calendar-scheduled-message">选择一个或多个日期查看工时。</p>
          : !rows.length ? <p className="calendar-scheduled-message">{[...selectedDates].some((date) => continuationDates.has(date))
            ? "所选日期有跨天班次延续，可在日视图查看；此处工时按班次开始日期统计。"
            : "所选日期没有匹配的员工班次。"}</p>
            : rows.map((row) => <details key={row.employeeId} className="calendar-scheduled-employee">
              <summary>
                <span className="calendar-scheduled-employee-overview">
                  <span className="calendar-scheduled-employee-identity"><strong>{row.name}</strong><small>{row.entries.length} 个班次</small></span>
                  <span className="calendar-scheduled-employee-total"><b>{formatScheduledHours(row.totalHours)}</b><small>工作日 {formatScheduledHours(row.weekdayHours)} · 周六 {formatScheduledHours(row.saturdayHours)} · 周日 {formatScheduledHours(row.sundayHours)}</small></span>
                </span>
                {employeeJobNames.get(row.employeeId)?.length ? <span className="calendar-scheduled-employee-jobs">正式岗位：{employeeJobNames.get(row.employeeId)!.join(" · ")}</span> : null}
                <span className="calendar-scheduled-worklog-toggle">Worklog <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
              </summary>
              <div className="calendar-scheduled-worklog">{row.entries.map((entry) => <div key={`${entry.shift.id}:${row.employeeId}`}>
                <span>{dateLabel(entry.shift.date)} · {entry.roleName}</span><strong>{formatScheduledHours(entry.hours)}</strong>
                <small>{scheduledWorklogTimeRange(entry.shift.startAt, entry.shift.endAt, timezone)} · 休 {entry.shift.breakMinutes} 分钟{entry.employeeName !== row.name ? ` · 原记录名：${entry.employeeName}` : ""}</small>
              </div>)}</div>
            </details>)}
    </div>
  </aside>;
}

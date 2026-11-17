import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { addCalendarDays, DEFAULT_STORE_TIMEZONE, storeDateTime, storeParts } from "../../lib/storeTime";
import { weekRange } from "../../lib/dateTime";
import { roleColorStyle } from "../../lib/roleColor";
import {isAgentShift} from '../../lib/agentShift';
import { calendarAvailabilityByCell } from "../../lib/calendarAvailability";
import { rosterRepository } from "../../services/rosterRepository";
import type { EmployeeAvailability, RosterPeriod, Shift } from "../../types/roster";
import type { RosterEmployee } from "../../types/workforce";

type BoardEmployee = { id: string; displayName: string; current: RosterEmployee | null; needsReassignment: boolean };
export function EmployeeLaneBoard({ storeId, focusedDate, weekStartsOn, timezone = DEFAULT_STORE_TIMEZONE, employees, shifts, formalRoleNames, formalRoleColors, periods, saving, onEdit, onCreate, onSelectEmployee }: {
  storeId?: string;
  focusedDate: string;
  weekStartsOn: number;
  timezone?: string;
  employees: RosterEmployee[];
  shifts: Shift[];
  formalRoleNames?: ReadonlyMap<string, string>;
  formalRoleColors?: ReadonlyMap<string, string>;
  periods: RosterPeriod[];
  saving: boolean;
  onEdit: (shift: Shift) => void;
  onCreate?: (employeeId: string, date: string) => void;
  onSelectEmployee?: (employee: RosterEmployee) => void;
}) {
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(60);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [availabilityResult, setAvailabilityResult] = useState<{ storeId: string; firstDate: string; shifts: Shift[]; retry: number; rows: EmployeeAvailability[] | null; error: string | null } | null>(null);
  const savingRef = useRef(saving);
  const onEditRef = useRef(onEdit);
  const onCreateRef = useRef(onCreate);
  const onSelectEmployeeRef = useRef(onSelectEmployee);
  const currentEmployeesRef = useRef(new Map(employees.map((employee) => [employee.id, employee])));
  useLayoutEffect(() => {
    savingRef.current = saving;
    onEditRef.current = onEdit;
    onCreateRef.current = onCreate;
    onSelectEmployeeRef.current = onSelectEmployee;
  }, [saving, onEdit, onCreate, onSelectEmployee]);
  useLayoutEffect(() => { currentEmployeesRef.current = new Map(employees.map((employee) => [employee.id, employee])); }, [employees]);
  const firstDate = weekRange(focusedDate, weekStartsOn).startDate;
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addCalendarDays(firstDate, index)), [firstDate]);
  useEffect(() => {
    if (!storeId) return;
    let canceled = false;
    void rosterRepository.availability(storeId, addCalendarDays(firstDate, -1), dates[6]!).then(
      (rows) => { if (!canceled) setAvailabilityResult({ storeId, firstDate, shifts, retry: availabilityRetry, rows, error: null }); },
      (cause) => { if (!canceled) setAvailabilityResult({ storeId, firstDate, shifts, retry: availabilityRetry, rows: null, error: cause instanceof Error ? cause.message : "可用时间读取失败" }); },
    );
    return () => { canceled = true; };
  }, [availabilityRetry, dates, firstDate, shifts, storeId]);
  const currentAvailability = availabilityResult && availabilityResult.storeId === storeId && availabilityResult.firstDate === firstDate
    && availabilityResult.shifts === shifts && availabilityResult.retry === availabilityRetry ? availabilityResult : null;
  const availabilityByCell = useMemo(() => currentAvailability?.rows
    ? calendarAvailabilityByCell(currentAvailability.rows, dates, timezone) : new Map(), [currentAvailability, dates, timezone]);
  const boardEmployees = useMemo<BoardEmployee[]>(() => {
    const currentById = new Map(employees.map((employee) => [employee.id, employee]));
    const draftPeriodIds = new Set(periods.map((period) => period.id));
    const former = new Map<string, { id: string; displayName: string; current: null; needsReassignment: boolean }>();
    for (const shift of shifts) for (const assignment of shift.assignments) {
      if (currentById.get(assignment.employeeId)?.isActive) continue;
      const previous = former.get(assignment.employeeId);
      former.set(assignment.employeeId, {
        id: assignment.employeeId,
        displayName: assignment.employeeNameSnapshot,
        current: null,
        needsReassignment: Boolean(previous?.needsReassignment || draftPeriodIds.has(shift.rosterPeriodId)),
      });
    }
    const formerRows = [...former.values()].sort((left, right) => Number(right.needsReassignment) - Number(left.needsReassignment)
      || left.displayName.localeCompare(right.displayName, "zh-CN") || left.id.localeCompare(right.id));
    const currentRows = employees.filter((employee) => employee.isActive).map((employee) => ({ id: employee.id, displayName: employee.displayName, current: employee, needsReassignment: false }));
    return [...formerRows, ...currentRows];
  }, [employees, periods, shifts]);
  const publishedNamesByEmployee = useMemo(() => {
    const publishedIds = new Set(periods.filter((period) => period.status === "PUBLISHED").map((period) => period.id));
    const names = new Map<string, Set<string>>();
    for (const shift of shifts) {
      if (!publishedIds.has(shift.rosterPeriodId)) continue;
      for (const assignment of shift.assignments) {
        if (!assignment.employeeNameSnapshot?.trim()) continue;
        const current = names.get(assignment.employeeId) ?? new Set<string>();
        current.add(assignment.employeeNameSnapshot.toLocaleLowerCase());
        names.set(assignment.employeeId, current);
      }
    }
    return names;
  }, [periods, shifts]);
  const matchingEmployees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return boardEmployees.filter((employee) => employee.displayName.toLocaleLowerCase().includes(query)
      || [...(publishedNamesByEmployee.get(employee.id) ?? [])].some((name) => name.includes(query)));
  }, [boardEmployees, publishedNamesByEmployee, search]);
  const visibleEmployees = useMemo(() => matchingEmployees.slice(0, visibleCount), [matchingEmployees, visibleCount]);
  const shiftsByEmployeeDate = useMemo(() => {
    const byDate = new Map<string, Shift[]>();
    const visibleDates = new Set(dates);
    const nextVisibleDate = new Map(dates.map((date) => [addCalendarDays(date, -1), date]));
    const midnightByDate = new Map(dates.map((date) => [date, storeDateTime(date, "00:00", timezone).getTime()]));
    for (const shift of shifts) {
      const nextDate = nextVisibleDate.get(shift.date);
      const continuesIntoNextDate = nextDate !== undefined && new Date(shift.endAt).getTime() > midnightByDate.get(nextDate)!;
      for (const assignment of shift.assignments) {
        for (const date of [shift.date, ...(continuesIntoNextDate ? [nextDate!] : [])]) {
          if (!visibleDates.has(date)) continue;
          const key = `${assignment.employeeId}:${date}`;
          const current = byDate.get(key) ?? [];
          current.push(shift);
          byDate.set(key, current);
        }
      }
    }
    for (const rows of byDate.values()) rows.sort((left, right) => left.startAt.localeCompare(right.startAt));
    return byDate;
  }, [dates, shifts, timezone]);
  const shiftTimes = useMemo(() => {
    const visibleIds = new Set(visibleEmployees.map((employee) => employee.id));
    const times = new Map<string, { start: string; end: string; overnight: boolean }>();
    const intervalTimes = new Map<string, { start: string; end: string; overnight: boolean }>();
    for (const shift of shifts) {
      if (!shift.assignments.some((assignment) => visibleIds.has(assignment.employeeId))) continue;
      const intervalKey = `${shift.date}|${shift.startAt}|${shift.endAt}`;
      let formatted = intervalTimes.get(intervalKey);
      if (!formatted) {
        const start = storeParts(shift.startAt, timezone);
        const end = storeParts(shift.endAt, timezone);
        formatted = { start: start.time, end: end.time, overnight: end.date !== shift.date };
        intervalTimes.set(intervalKey, formatted);
      }
      times.set(shift.id, formatted);
    }
    return times;
  }, [shifts, timezone, visibleEmployees]);
  const editablePeriodIds = useMemo(() => new Set(periods.map((period) => period.id)), [periods]);
  const creatableDates = useMemo(() => new Set(dates), [dates]);
  const rowSignatures = useMemo(() => {
    const result = new Map(visibleEmployees.map((employee) => [employee.id, JSON.stringify([
      employee.id, employee.displayName, Boolean(employee.current), employee.needsReassignment, firstDate, timezone, [...creatableDates],
      dates.map((date) => (shiftsByEmployeeDate.get(`${employee.id}:${date}`) ?? []).map((shift) => [shift, editablePeriodIds.has(shift.rosterPeriodId), formalRoleNames?.get(shift.shiftRoleId), formalRoleColors?.get(shift.shiftRoleId)])),
      dates.map((date) => availabilityByCell.get(`${employee.id}:${date}`) ?? []),
    ])]));
    return result;
  }, [availabilityByCell, creatableDates, dates, editablePeriodIds, firstDate, formalRoleColors, formalRoleNames, shiftsByEmployeeDate, timezone, visibleEmployees]);
  const clickShift = useCallback((_event: ReactMouseEvent<HTMLElement>, shift: Shift) => {
    if (!savingRef.current) onEditRef.current(shift);
  }, []);
  const keyDownShift = useCallback((event: ReactKeyboardEvent<HTMLElement>, shift: Shift) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!savingRef.current) onEditRef.current(shift); }
  }, []);
  const selectEmployee = useCallback((employeeId: string) => {
    const employee = currentEmployeesRef.current.get(employeeId);
    if (!savingRef.current && employee) onSelectEmployeeRef.current?.(employee);
  }, []);
  const createForEmployee = useCallback((employeeId: string, date: string) => {
    if (!savingRef.current && currentEmployeesRef.current.get(employeeId)?.isActive) onCreateRef.current?.(employeeId, date);
  }, []);

  return <section className="mt-5 rounded-2xl border border-graphite-200 bg-white p-4 shadow-panel" aria-label="员工行排班" aria-busy={saving} inert={saving}>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-graphite-950">员工行排班</h2><p className="mt-1 text-xs text-graphite-600">点击班次查看或编辑；新增班次请点击员工日期空白处。</p></div>
      <label className="text-xs font-semibold text-graphite-700">搜索员工<input className="native-input mt-1 w-52" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(60); }} placeholder="员工姓名" /></label>
    </div>
    {storeId ? <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-graphite-600">
      <span>可用时间：绿色为已记录可用，红色为已记录不可用；无标记表示未记录。</span>
      {!currentAvailability ? <span role="status">正在读取可用时间</span> : null}
      {currentAvailability?.error ? <span role="alert">可用时间暂时无法读取：{currentAvailability.error}。班次仍可查看，保存时会重新校验。 <button type="button" className="font-semibold underline" onClick={() => setAvailabilityRetry((current) => current + 1)}>重试</button></span> : null}
    </div> : null}
    <div className="employee-lane-scroll overflow-x-auto rounded-xl border border-graphite-200">
      <div className="min-w-[980px]">
        <div className="grid grid-cols-[176px_repeat(7,minmax(112px,1fr))] bg-graphite-50 text-xs font-semibold text-graphite-700">
          <div className="sticky left-0 z-10 border-r border-graphite-200 bg-graphite-50 p-3">员工</div>
          {dates.map((date) => <div key={date} className="border-r border-graphite-200 p-3 text-center last:border-r-0">{date}</div>)}
        </div>
        {visibleEmployees.map((employee) => <EmployeeLaneRow key={employee.id} employee={employee} rowSignature={rowSignatures.get(employee.id)!} dates={dates}
          shiftsByEmployeeDate={shiftsByEmployeeDate} shiftTimes={shiftTimes} editablePeriodIds={editablePeriodIds} creatableDates={creatableDates} formalRoleNames={formalRoleNames} formalRoleColors={formalRoleColors}
          availabilityByCell={availabilityByCell}
          onSelectEmployee={selectEmployee} onCreate={createForEmployee}
          onClickShift={clickShift} onKeyDownShift={keyDownShift} />)}
      </div>
    </div>
    {matchingEmployees.length > visibleCount ? <button type="button" className="calendar-text-button mt-3" onClick={() => setVisibleCount((current) => current + 60)}>加载更多员工（{visibleCount}/{matchingEmployees.length}）</button> : null}
    {!matchingEmployees.length ? <p className="mt-3 text-sm text-graphite-600">没有匹配的员工或历史班次</p> : null}
  </section>;
}

const EmployeeLaneRow = memo(function EmployeeLaneRow({ employee, dates, shiftsByEmployeeDate, shiftTimes, editablePeriodIds, creatableDates, formalRoleNames, formalRoleColors, availabilityByCell,
  onSelectEmployee, onCreate, onClickShift, onKeyDownShift,
}: {
  employee: BoardEmployee;
  rowSignature: string;
  dates: string[];
  shiftsByEmployeeDate: Map<string, Shift[]>;
  shiftTimes: Map<string, { start: string; end: string; overnight: boolean }>;
  editablePeriodIds: Set<string>;
  creatableDates: Set<string>;
  formalRoleNames?: ReadonlyMap<string, string>;
  formalRoleColors?: ReadonlyMap<string, string>;
  availabilityByCell: Map<string, { status: "AVAILABLE" | "UNAVAILABLE"; label: string }[]>;
  onSelectEmployee?: (employeeId: string) => void;
  onCreate: (employeeId: string, date: string) => void;
  onClickShift: (event: ReactMouseEvent<HTMLElement>, shift: Shift) => void;
  onKeyDownShift: (event: ReactKeyboardEvent<HTMLElement>, shift: Shift) => void;
}) {
  return <div className="grid min-h-20 grid-cols-[176px_repeat(7,minmax(112px,1fr))] border-t border-graphite-200">
    <div className="sticky left-0 z-10 border-r border-graphite-200 bg-white p-3 text-sm font-semibold text-graphite-950">
      {employee.current ? <button type="button" className="inline-flex min-h-11 min-w-11 max-w-full items-center text-left hover:underline focus-visible:outline-2 focus-visible:outline-brand-600" onClick={() => onSelectEmployee?.(employee.id)} aria-label={`在时间轴查看 ${employee.displayName}`}>{employee.displayName}</button> : <span>{employee.displayName}</span>}
      {!employee.current ? <span className="mt-1 block text-xs font-medium text-amber-800">{employee.needsReassignment ? "不在当前在职名单 · 需重新分配" : "不在当前在职名单 · 历史快照"}</span> : null}
    </div>
    {dates.map((date) => {
      const key = `${employee.id}:${date}`;
      const canCreate = Boolean(employee.current && creatableDates.has(date));
      const availability = availabilityByCell.get(key) ?? [];
      return <div key={date} data-drop-target={employee.current ? key : undefined}
        onClick={(event) => { if (canCreate && (event.target === event.currentTarget
          || (event.target instanceof Element && event.target.closest("[data-availability-summary]")))) onCreate(employee.id, date); }}
        className="min-h-20 border-r border-graphite-200 bg-white p-1.5 last:border-r-0">
        {(shiftsByEmployeeDate.get(key) ?? []).map((shift) => {
          const continuation = shift.date !== date;
          const time = shiftTimes.get(shift.id)!;
          const isDraft = editablePeriodIds.has(shift.rosterPeriodId);
          const roleName = isDraft && formalRoleNames ? formalRoleNames.get(shift.shiftRoleId) ?? `旧岗位：${shift.roleNameSnapshot}` : shift.roleNameSnapshot;
          const recordedName = isDraft ? employee.displayName : shift.assignments.find((assignment) => assignment.employeeId === employee.id)?.employeeNameSnapshot || employee.displayName;
          const showRecordedName = !isDraft && recordedName !== employee.displayName;
          return <div key={shift.id} role="button" tabIndex={0}
            aria-label={`${recordedName} ${continuation ? `${shift.date} 跨天延续至 ${date}` : date} ${roleName} ${continuation ? "00:00" : time.start}–${time.end}`}
            title={shift.agentPreview?"智能体候选 · 尚未保存":continuation ? "跨天班次延续，点击查看原班次" : "点击查看或编辑班次"}
            onClick={(event) => onClickShift(event, shift)} onKeyDown={(event) => onKeyDownShift(event, shift)}
            className="mb-1.5 cursor-pointer select-none rounded-lg border border-graphite-200 bg-white px-2 py-1.5 text-xs text-graphite-950 shadow-sm focus-visible:outline-2 focus-visible:outline-brand-600"
            style={roleColorStyle({ id: shift.shiftRole.id, code: shift.shiftRole.code, colorToken: isDraft ? formalRoleColors?.get(shift.shiftRoleId) ?? shift.roleColorSnapshot ?? shift.shiftRole.colorToken : shift.roleColorSnapshot })}>
            <strong className="block truncate">{roleName}</strong>{isAgentShift(shift)&&<small className="block text-[11px]" title={shift.agentPreview?'尚未保存':undefined}>智能体排班</small>}{showRecordedName ? <span className="block truncate text-[10px]">发布时：{recordedName}</span> : null}<span className="tabular-nums">{continuation ? `跨天延续 · ${shift.date} · 00:00–${time.end}` : `${time.start}–${time.end}${time.overnight ? " 次日" : ""}`}</span>
          </div>;
        })}
        {availability.length ? <div data-availability-summary className="mb-1.5 flex flex-wrap gap-1" aria-label={`${employee.displayName} ${date} 可用时间`} title={availability.map((window) => `${window.status === "AVAILABLE" ? "可用" : "不可用"} ${window.label}`).join("；")}>
          {availability.slice(0, 2).map((window, index) => <span key={`${window.status}-${window.label}-${index}`} data-availability={window.status}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${window.status === "AVAILABLE" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
            {window.status === "AVAILABLE" ? "可用" : "不可用"} {window.label}
          </span>)}
          {availability.length > 2 ? <span className="text-[10px] text-graphite-600">+{availability.length - 2}</span> : null}
        </div> : null}
        {canCreate ? <button type="button" onClick={() => onCreate(employee.id, date)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-sm font-semibold text-graphite-400 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-600"
          aria-label={`为 ${employee.displayName} 在 ${date} 新建班次`}>+</button> : null}
      </div>;
    })}
  </div>;
}, (previous, next) => previous.rowSignature === next.rowSignature
  && previous.onSelectEmployee === next.onSelectEmployee
  && previous.onCreate === next.onCreate
  && previous.onClickShift === next.onClickShift
  && previous.onKeyDownShift === next.onKeyDownShift);

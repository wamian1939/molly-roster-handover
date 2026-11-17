import FullCalendar from "@fullcalendar/react";
import type { DateSelectArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxon3Plugin from "@fullcalendar/luxon3";
import timeGridPlugin from "@fullcalendar/timegrid";
import { Bot, CalendarPlus, CheckSquare2, ChevronLeft, ChevronRight, CircleAlert, Ellipsis, RefreshCw, Trash2 } from "lucide-react";
import { DateTime } from 'luxon';
import { CalendarAgentPanel } from '../components/calendar/CalendarAgentPanel';
import {isAgentShift} from '../lib/agentShift';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { CalendarEventContent } from "../components/calendar/CalendarEventContent";
import { CalendarDraftBar } from "../components/calendar/CalendarDraftBar";
import { EmployeeLaneBoard } from "../components/calendar/EmployeeLaneBoard";
import { CalendarViewSwitch } from "../components/calendar/CalendarViewSwitch";
import { CalendarScheduledSidebar } from "../components/calendar/CalendarScheduledSidebar";
import { GroupedShiftDialog } from "../components/calendar/GroupedShiftDialog";
import { RepeatShiftDialog } from "../components/calendar/RepeatShiftDialog";
import { ShiftDialog, type ShiftDraft } from "../components/calendar/ShiftDialog";
import { AppSelect } from "../components/ui/AppSelect";
import { Dialog } from "../components/ui/Dialog";
import { useToast } from "../components/ui/ToastProvider";
import { groupShiftsForCalendar, isCalendarShiftGroup, mergedShiftForCalendarGroup, type CalendarShiftGroup } from "../lib/calendarGrouping";
import { discardExistingChange, discardNewShift, emptyCalendarDraftQueue, stageDeleteShift, stageExistingShift, stageMergedShiftDelete, stageMergedShiftUpdate, stageNewShift, type CalendarDraftQueue, type DraftChange } from "../lib/calendarDraftQueue";
import { calendarClickDurationMinutes, calendarClickEnd, calendarRangeWithinStoreHours, canCreateFromCalendarSelection } from "../lib/calendarSelection";
import { calendarDateFromQuery, calendarQueryWithContext, calendarViewFromQuery } from "../lib/calendarLocation";
import { exactCyclePeriod } from "../lib/calendarPeriod";
import { confirmedBatchDeleteMatches } from "../lib/confirmedBatchDelete";
import { assertCopyDayResponse } from "../lib/copyDayResponse";
import { findRemainingShiftAfterUncertainDelete } from "../lib/uncertainDelete";
import { draftChangeReadbackState } from "../lib/draftCommitReconciliation";
import { calendarEmployeePageSize, peakConcurrentShifts, shouldPageCalendarEmployees, shiftsForEmployees, shiftsOverlappingCalendarDates, weekEmployeeOptions } from "../lib/calendarEmployeeWindow";
import { loadCalendarSnapshot, scopedCalendarResponse, usableCalendarTemplates } from "../lib/calendarLoad";
import { layoutCalendarShiftGroups, layoutCalendarShiftGroupsByVisibleDay } from "../lib/calendarOverlap";
import { positionCalendarEvent, positionVisibleCalendarEvents } from "../lib/calendarDomPlacement";
import { ApiRequestError } from "../lib/apiClient";
import { findMatchingShift } from "../lib/mutationReconciliation";
import { formatTime, rosterCycleRange } from "../lib/dateTime";
import { addCalendarDays, DEFAULT_STORE_TIMEZONE, isStoreClockChangeDate, storeDateTime, storeParts } from "../lib/storeTime";
import { createCalendarPointerOwner, timeGridPointerRange, timeGridPointerSlot, upwardTimeGridSelectionEnd, type TimeGridPointerSlot } from "../lib/timeGridPointer";
import { schedulingFeedback } from "../lib/schedulingFeedback";
import { rosterRepository, type CopyDayPreview, type CopyPeriodPreview, type RepeatPreview } from "../services/rosterRepository";
import { workforceRepository } from "../services/workforceRepository";
import { useStoreSelection } from "../store/StoreContext";
import type { CalendarResponse, CalendarView, EmployeeAvailability, PeriodSummary, RosterPeriod, RosterStoreSettings, Shift, ShiftRole, ShiftTemplate } from "../types/roster";
import type { RosterEmployee, RosterStore, RosterStoreJob } from "../types/workforce";

const NO_SHIFTS: Shift[] = [];
// The Day date is already in the toolbar. Without a duplicate grid header,
// 48 half-hour slots fill the measured BHS-sized time area at desktop height.
const TIMEGRID_VIEWPORT_OFFSET_PX = 214;

export function CalendarPage() {
  const { user } = useAuth();
  const { selectedStoreId, initializeStoreId } = useStoreSelection();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStoreId = useRef(searchParams.get("store"));
  const storeRestorePending = useRef(true);
  const [view, setView] = useState<CalendarView>(() => calendarViewFromQuery(searchParams.get("view"), "timeGridDay"));
  const [calendarDate, setCalendarDate] = useState<string | undefined>(() => calendarDateFromQuery(searchParams.get("date")));
  const rememberContext = useCallback((storeId: string, nextView: CalendarView, date?: string) => {
    setSearchParams((current) => calendarQueryWithContext(current, { storeId, view: nextView, date }), { replace: true });
  }, [setSearchParams]);
  const restoreStore = useCallback((availableStoreIds: string[]) => {
    if (!storeRestorePending.current) {
      initializeStoreId(availableStoreIds);
      return;
    }
    storeRestorePending.current = false;
    const requested = requestedStoreId.current;
    initializeStoreId(availableStoreIds, requested && availableStoreIds.includes(requested) ? requested : undefined);
  }, [initializeStoreId]);
  return <StoreCalendarPage key={`${user?.accountId ?? "anonymous"}:${selectedStoreId}`} view={view} setView={setView}
    calendarDate={calendarDate} setCalendarDate={setCalendarDate} restoreStore={restoreStore} rememberContext={rememberContext} />;
}

function StoreCalendarPage({ view, setView, calendarDate, setCalendarDate, restoreStore, rememberContext }: {
  view: CalendarView;
  setView: (view: CalendarView) => void;
  calendarDate: string | undefined;
  setCalendarDate: (date: string) => void;
  restoreStore: (availableStoreIds: string[]) => void;
  rememberContext: (storeId: string, view: CalendarView, date?: string) => void;
}) {
  const [agentOpen,setAgentOpen]=useState(true);
  const { user } = useAuth();
  const { showToast } = useToast();
  const { selectedStoreId, setSelectedStoreId } = useStoreSelection();
  const calendarPageRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<FullCalendar>(null);
  const moreActionsRef = useRef<HTMLDetailsElement>(null);
  const canceledCalendarGesture = useRef(false);
  const calendarPointerOwner = useRef(createCalendarPointerOwner());
  const eventPointerGesture = useRef<{ pointerId: number; x: number; y: number; moved: boolean; first: TimeGridPointerSlot | null; previewedKey: string | null } | null>(null);
  const gridPointerStart = useRef<TimeGridPointerSlot | null>(null);
  const gridPointerCurrent = useRef<TimeGridPointerSlot | null>(null);
  const coveredEventSelect = useRef<(first: TimeGridPointerSlot, last: TimeGridPointerSlot, final: boolean) => void>(() => {});
  const previewingCoveredSelection = useRef(false);
  const ignoreEventClickUntil = useRef(0);
  const employeeFilterRef = useRef<HTMLDivElement>(null);
  const loadRequestSequence = useRef(0);
  const storeLoadSequence = useRef(0);
  const templateRequestSequence = useRef(0);
  const dialogRequestSequence = useRef(0);
  const pendingCreateRequest = useRef<{ signature: string; shiftId: string } | null>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !moreActionsRef.current?.contains(event.target)) {
        moreActionsRef.current?.removeAttribute("open");
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") moreActionsRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  const closeMoreActions = () => moreActionsRef.current?.removeAttribute("open");
  useEffect(() => {
    const beginGesture = (event: PointerEvent) => {
      if (!calendarPointerOwner.current.begin(event.pointerId)) return;
      canceledCalendarGesture.current = false;
      ignoreEventClickUntil.current = 0;
      const eventTarget = event.target instanceof Element && event.target.closest(".fc-timegrid-event:not(.fc-event-mirror)");
      gridPointerStart.current = event.target instanceof Element && (eventTarget || !event.target.closest(".fc-event"))
        ? timeGridPointerSlot(event) : null;
      gridPointerCurrent.current = gridPointerStart.current;
      eventPointerGesture.current = eventTarget
        ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, first: gridPointerStart.current, previewedKey: null } : null;
    };
    const moveGesture = (event: PointerEvent) => {
      if (!calendarPointerOwner.current.owns(event.pointerId)) return;
      if (gridPointerStart.current) gridPointerCurrent.current = timeGridPointerSlot(event) ?? gridPointerCurrent.current;
      const gesture = eventPointerGesture.current;
      if (gesture?.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 6) gesture.moved = true;
      const last = gridPointerCurrent.current;
      if (gesture.moved && gesture.first && last) {
        const key = `${last.date}:${last.time}`;
        if (gesture.previewedKey !== key) {
          gesture.previewedKey = key;
          coveredEventSelect.current(gesture.first, last, false);
        }
      }
    };
    const endGesture = (event: PointerEvent) => {
      if (!calendarPointerOwner.current.end(event.pointerId)) return;
      const gesture = eventPointerGesture.current;
      if (gesture?.pointerId === event.pointerId) {
        if (gesture.moved) {
          ignoreEventClickUntil.current = performance.now() + 750;
          const last = timeGridPointerSlot(event) ?? gridPointerCurrent.current;
          if (gesture.first && last) coveredEventSelect.current(gesture.first, last, true);
        }
        eventPointerGesture.current = null;
      }
    };
    const cancelGesture = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      canceledCalendarGesture.current = true;
      calendarPointerOwner.current.cancel();
      gridPointerStart.current = null;
      gridPointerCurrent.current = null;
      calendarRef.current?.getApi().unselect();
    };
    const cancelPointer = (event: PointerEvent) => {
      if (!calendarPointerOwner.current.end(event.pointerId)) return;
      canceledCalendarGesture.current = true;
      eventPointerGesture.current = null;
      gridPointerStart.current = null;
      gridPointerCurrent.current = null;
    };
    window.addEventListener("pointerdown", beginGesture, true);
    window.addEventListener("pointermove", moveGesture, true);
    window.addEventListener("pointerup", endGesture, true);
    window.addEventListener("keydown", cancelGesture, true);
    window.addEventListener("pointercancel", cancelPointer, true);
    return () => {
      window.removeEventListener("pointerdown", beginGesture, true);
      window.removeEventListener("pointermove", moveGesture, true);
      window.removeEventListener("pointerup", endGesture, true);
      window.removeEventListener("keydown", cancelGesture, true);
      window.removeEventListener("pointercancel", cancelPointer, true);
    };
  }, []);
  const [stores, setStores] = useState<RosterStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const storeId = selectedStoreId || null;
  const [title, setTitle] = useState("");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [loadedData, setData] = useState<CalendarResponse | null>(null);
  const [roles, setRoles] = useState<ShiftRole[]>([]);
  const [jobs, setJobs] = useState<RosterStoreJob[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [templateError, setTemplateError] = useState("");
  const [loadedSummary, setSummary] = useState<PeriodSummary | null>(null);
  const [loadedPeriodShifts, setPeriodShifts] = useState<Shift[]>([]);
  const [settings, setSettings] = useState<RosterStoreSettings | null>(null);
  const [editContextReady, setEditContextReady] = useState(false);
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);
  const [dialogAvailability, setDialogAvailability] = useState<{ storeId: string; date: string; rows: EmployeeAvailability[] } | null>(null);
  const [dialogAvailabilityError, setDialogAvailabilityError] = useState("");
  const [copyTargetCalendar, setCopyTargetCalendar] = useState<CalendarResponse | null>(null);
  const [copyTargetCalendarError, setCopyTargetCalendarError] = useState("");
  const [workforceGeneratedAt, setWorkforceGeneratedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShiftDraft | null>(null);
  const [draftSession, setDraftSession] = useState<{ period: RosterPeriod; queue: CalendarDraftQueue } | null>(null);
  const [draftSubmitUncertain, setDraftSubmitUncertain] = useState(false);
  useEffect(() => {
    if (!draftSession?.queue.changes.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draftSession]);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editingGroup, setEditingGroup] = useState<CalendarShiftGroup | null>(null);
  const [selectingGroup, setSelectingGroup] = useState<CalendarShiftGroup | null>(null);
  const [selectingGroupAction, setSelectingGroupAction] = useState<"edit" | "repeat">("edit");
  const [copyingShift, setCopyingShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const mutationInFlight = useRef(false);
  const [staleShift, setStaleShift] = useState(false);
  const [error, setError] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [employeeLanesPreference, setEmployeeLanesPreference] = useState<{ storeId: string; visible: boolean } | null>(null);
  const [weekEmployeeSearch, setWeekEmployeeSearch] = useState("");
  const [focusedEmployeeId, setFocusedEmployeeId] = useState<string | null>(null);
  const [weekEmployeePage, setWeekEmployeePage] = useState(0);
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [batchRoleId, setBatchRoleId] = useState("");
  const currentBatchRoleId = roles.some((role) => role.id === batchRoleId) ? batchRoleId : "";
  const [confirmingBatchDelete, setConfirmingBatchDelete] = useState<string[] | null>(null);
  const [copyPreview, setCopyPreview] = useState<CopyPeriodPreview | null>(null);
  const [copySourcePeriodId, setCopySourcePeriodId] = useState<string | null>(null);
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [scheduledSidebarOpen, setScheduledSidebarOpen] = useState(false);
  const [copyDaySource, setCopyDaySource] = useState("");
  const [copyDayTarget, setCopyDayTarget] = useState("");
  const [copyDayPreview, setCopyDayPreview] = useState<CopyDayPreview | null>(null);
  const [copyDayPreviewStoreId, setCopyDayPreviewStoreId] = useState<string | null>(null);
  const [copyDayChecking, setCopyDayChecking] = useState(false);
  const [copyDayPreviewError, setCopyDayPreviewError] = useState("");
  const copyDayPreviewSequence = useRef(0);
  const copyDayDatesRef = useRef({ source: "", target: "" });
  const [repeatSourceShift, setRepeatSourceShift] = useState<Shift | null>(null);
  const data = scopedCalendarResponse(loadedData, storeId, range);
  const scopedCopyDayPreview = copyDayPreviewStoreId === storeId ? copyDayPreview : null;
  const summary = data && loadedSummary && calendarDate && loadedSummary.period.startDate <= calendarDate && loadedSummary.period.endDate >= calendarDate ? loadedSummary : null;
  const periodShifts = summary ? loadedPeriodShifts : NO_SHIFTS;
  // A store without confirmed settings has no authoritative local clock.
  // UTC is only a display fallback while the calendar is read-only.
  const timezone = settings?.timezone ?? "UTC";
  useEffect(() => {
    if (!copyDayOpen || !storeId || !copyDaySource || !copyDayTarget) return;
    const sequence = ++copyDayPreviewSequence.current;
    const timer = window.setTimeout(() => {
      void rosterRepository.previewCopyDay({ storeId, sourceDate: copyDaySource, targetDate: copyDayTarget })
        .then((preview) => {
          if (sequence !== copyDayPreviewSequence.current) return;
          setCopyDayPreview(preview);
          setCopyDayPreviewStoreId(storeId);
          setCopyDayPreviewError("");
          setCopyDayChecking(false);
        })
        .catch((cause) => {
          if (sequence !== copyDayPreviewSequence.current) return;
          setCopyDayPreviewError(calendarError(cause, timezone));
          setCopyDayChecking(false);
        });
    }, 250);
    return () => { window.clearTimeout(timer); copyDayPreviewSequence.current += 1; };
  }, [copyDayOpen, copyDaySource, copyDayTarget, storeId, timezone]);
  const dialogAvailabilityReady = Boolean(draft && dialogAvailability?.storeId === storeId && dialogAvailability.date === draft.date);
  const dialogAvailabilityRows = dialogAvailabilityReady ? dialogAvailability!.rows : [];
  const copyTargetCalendarReady = Boolean(draft && copyingShift && copyTargetCalendar?.storeId === storeId &&
    copyTargetCalendar.from <= draft.date && copyTargetCalendar.to >= draft.date);
  const dialogAvailabilityMessage = dialogAvailabilityError
    ? `班次日期的员工与可用时间无法确认：${dialogAvailabilityError.replace(/[。.!！]+$/, "")}。请重试加载。`
    : "正在确认班次日期的员工与可用时间，请稍候。";

  function beginMutation() { if (!data || !editContextReady || loading || mutationInFlight.current) return false; mutationInFlight.current = true; setSaving(true); return true; }
  function finishMutation() { mutationInFlight.current = false; setSaving(false); }

  function startDraftSession() {
    if (!storeId || !data || !editContextReady) return;
    const focusedDate = calendarDate ?? storeParts(calendarRef.current?.getApi().getDate() ?? new Date(), timezone).date;
    const period = findPeriod(data.periods, focusedDate);
    if (!period) {
      showToast({ tone: "info", title: "请先创建排班周期", description: "统一暂存需要当前已存在的排班周期。" });
      return;
    }
    setDraftSession({ period, queue: emptyCalendarDraftQueue(storeId) });
    setDraftSubmitUncertain(false);
  }

  function removeDraftChange(change: DraftChange) {
    setDraftSession((current) => current ? { ...current, queue: change.kind === "create"
      ? discardNewShift(current.queue, change.clientShiftId) : discardExistingChange(current.queue, change.shiftId) } : null);
  }

  async function submitDraftSession() {
    if (!draftSession || !storeId || draftSubmitUncertain || !draftSession.queue.changes.length || !beginMutation()) return;
    try {
      await rosterRepository.commitDraftPeriod(draftSession.period.id, draftSession.queue);
      setDraftSession(null);
      setDraftSubmitUncertain(false);
      showToast({ tone: "success", title: "排班已统一提交", description: `${draftSession.queue.changes.length} 项修改已写入当前周期。` });
      await load();
    } catch (cause) {
      if (isUncertainMutation(cause)) {
        setDraftSubmitUncertain(true);
        showToast({ tone: "info", title: "提交结果尚未确认", description: "暂存内容已保留，请先点击“核对提交结果”，不要重复提交。" });
      } else await reportMutationFailure(cause, "统一提交失败");
    } finally { finishMutation(); }
  }

  async function reconcileDraftSession() {
    if (!draftSession || !storeId || !beginMutation()) return;
    try {
      const states = await Promise.all(draftSession.queue.changes.map(async (change) => {
        const id = change.kind === "create" ? change.clientShiftId : change.shiftId;
        try {
          const current = await rosterRepository.shift(storeId, id);
          return draftChangeReadbackState(change, current, storeId, draftSession.period.id);
        } catch (cause) {
          if (cause instanceof ApiRequestError && cause.status === 404) {
            return draftChangeReadbackState(change, null, storeId, draftSession.period.id);
          }
          throw cause;
        }
      }));
      await load();
      if (states.every((state) => state === "committed")) {
        setDraftSession(null); setDraftSubmitUncertain(false);
        showToast({ tone: "success", title: "已确认提交成功", description: "服务器上的班次与待提交内容一致。" });
      } else if (states.every((state) => state === "unchanged")) {
        setDraftSubmitUncertain(false);
        showToast({ tone: "info", title: "未发现本次提交结果", description: "暂存内容仍保留；请核对日历后决定是否重新提交。" });
      } else showToast({ tone: "error", title: "无法自动确认", description: "服务器状态与暂存内容不完全一致；请保留此页面并人工核对。" });
    } catch (cause) {
      showToast({ tone: "error", title: "核对失败", description: calendarError(cause, timezone) });
    } finally { finishMutation(); }
  }

  const loadStores = useCallback(async () => {
    const requestSequence = ++storeLoadSequence.current;
    setStoresLoading(true);
    setError("");
    try {
      const result = await workforceRepository.stores();
      if (requestSequence !== storeLoadSequence.current) return;
      setStores(result.stores);
      const availableStoreIds = result.stores.map((store) => store.id);
      restoreStore(availableStoreIds);
    } catch (cause) {
      if (requestSequence === storeLoadSequence.current) setError(cause instanceof Error ? cause.message : "门店数据加载失败");
    } finally {
      if (requestSequence === storeLoadSequence.current) setStoresLoading(false);
    }
  }, [restoreStore]);

  // Store discovery is the external synchronization owned by this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadStores(); return () => { storeLoadSequence.current += 1; }; }, [loadStores]);

  const load = useCallback(async () => {
    if (!storeId || !range) return;
    const requestSequence = ++loadRequestSequence.current;
    setLoading(true); setError("");
    try {
      const snapshot = await loadCalendarSnapshot(storeId, range, () => requestSequence === loadRequestSequence.current, calendarDate);
      if (!snapshot) return;
      setData(snapshot.calendar); setRoles(snapshot.roles); setJobs(snapshot.jobs);
      const editablePeriodIds = new Set(snapshot.calendar.periods.map((period) => period.id));
      const editableShiftIds = new Set(snapshot.calendar.shifts.filter((shift) => editablePeriodIds.has(shift.rosterPeriodId)).map((shift) => shift.id));
      setSelectedShiftIds((current) => current.filter((id) => editableShiftIds.has(id)));
      setConfirmingBatchDelete(null);
      setEmployees(snapshot.workforce.employees); setWorkforceGeneratedAt(snapshot.workforce.generatedAt);
      setSettings(snapshot.settings);
      setEditContextReady(Boolean(snapshot.settings) && !snapshot.editContextError);
      setSummary(snapshot.summary); setPeriodShifts(snapshot.periodShifts);
      if (snapshot.editContextError) {
        const detail = snapshot.editContextError instanceof Error ? snapshot.editContextError.message : "请重试加载";
        setError(`员工或岗位校验数据暂不可用，日历班次仍可查看；新增、编辑和批量操作已暂停。${detail}`);
      } else if (snapshot.periodContextError) {
        const detail = snapshot.periodContextError instanceof Error ? snapshot.periodContextError.message : "请重试加载";
        setError(`周期数据暂不可用，周期检查已暂停；日历班次仍可查看。${detail}`);
      }
    } catch (cause) {
      if (requestSequence === loadRequestSequence.current) {
        setData(null);
        setEditContextReady(false);
        setJobs([]);
        setSummary(null);
        setPeriodShifts(NO_SHIFTS);
        setSelectedShiftIds([]);
        setConfirmingBatchDelete(null);
        setCopyPreview(null);
        setCopyDayPreview(null);
        setCopyDayPreviewStoreId(null);
        setEditingGroup(null);
        setSelectingGroup(null);


        setError(cause instanceof Error ? cause.message : "排班数据加载失败");
      }
    }
    finally { if (requestSequence === loadRequestSequence.current) setLoading(false); }
  }, [range, storeId, calendarDate, setSelectedShiftIds, setConfirmingBatchDelete, setCopyDayPreview, setCopyPreview, setEditingGroup, setSelectingGroup]);

  // Data fetching is the external synchronization owned by this effect.
  useEffect(() => { void load(); }, [load]);

  const loadTemplates = useCallback(async () => {
    if (!storeId) return;
    const requestSequence = ++templateRequestSequence.current;
    setTemplateError("");
    try {
      const rows = await rosterRepository.templates(storeId);
      if (requestSequence === templateRequestSequence.current) setTemplates(rows);
    } catch (cause) {
      if (requestSequence === templateRequestSequence.current) {
        setTemplates([]);
        setTemplateError(cause instanceof Error ? cause.message : "模板列表加载失败");
      }
    }
  }, [storeId]);

  // Template fetching is the external synchronization owned by this effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTemplates();
    return () => { templateRequestSequence.current += 1; };
  }, [loadTemplates]);

  async function reportMutationFailure(cause: unknown, title: string) {
    if (isUncertainMutation(cause) || (cause instanceof ApiRequestError && cause.validation?.code === "ARCHIVED_EMPLOYEE")) await load();
    showToast({ tone: isUncertainMutation(cause) ? "info" : "error", title: isUncertainMutation(cause) ? "结果尚未确认" : title, description: calendarError(cause, timezone) });
  }

  const editablePeriodIds = useMemo(() => new Set(data?.periods.map((period) => period.id) ?? []), [data]);
  const workingCalendarShifts=data?.shifts??NO_SHIFTS;
  async function refreshAgentCalendar(){
    setWeekEmployeeSearch('');setFocusedEmployeeId(null);setWeekEmployeePage(0);
    await load();
  }
  function showAgentWeek(date:string){
    if(!storeId)return;
    setView('timeGridWeek');setCalendarDate(date);rememberContext(storeId,'timeGridWeek',date);setAgentOpen(true);
    setWeekEmployeeSearch('');setFocusedEmployeeId(null);setWeekEmployeePage(0);
    calendarRef.current?.getApi().changeView('timeGridWeek',date);
    requestAnimationFrame(()=>calendarPageRef.current?.querySelector('.calendar-surface')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  const currentEmployeeNames = useMemo(() => new Map(employees.filter((employee) => employee.isActive).map((employee) => [employee.id, employee.displayName])), [employees]);
  const resolveDraftEmployeeName = useCallback((shift: Shift, assignment: Shift["assignments"][number]) => editablePeriodIds.has(shift.rosterPeriodId) ? currentEmployeeNames.get(assignment.employeeId) : undefined, [editablePeriodIds, currentEmployeeNames]);
  const availableWeekEmployees = useMemo(() => weekEmployeeOptions(employees, workingCalendarShifts), [workingCalendarShifts, employees]);
  const filteredWeekEmployees = useMemo(() => availableWeekEmployees.filter((employee) => focusedEmployeeId
    ? employee.id === focusedEmployeeId
    : employee.name.toLocaleLowerCase().includes(weekEmployeeSearch.trim().toLocaleLowerCase())), [availableWeekEmployees, weekEmployeeSearch, focusedEmployeeId]);
  const peakConcurrency = useMemo(() => peakConcurrentShifts(workingCalendarShifts), [workingCalendarShifts]);
  const employeePageSize = view==='timeGridWeek'&&workingCalendarShifts.some(isAgentShift)?100:calendarEmployeePageSize(view, peakConcurrency);
  const limitWeekEvents = editContextReady && shouldPageCalendarEmployees(view, availableWeekEmployees.length, employeePageSize,
    weekEmployeeSearch.length > 0 || focusedEmployeeId !== null);
  const showEmployeeLanes = view === "timeGridWeek" && (employeeLanesPreference?.storeId === storeId ? employeeLanesPreference.visible : false);
  const weekPageCount = Math.max(1, Math.ceil(filteredWeekEmployees.length / employeePageSize));
  const currentWeekPage = Math.min(weekEmployeePage, weekPageCount - 1);
  const visibleWeekEmployees = useMemo(() => filteredWeekEmployees.slice(currentWeekPage * employeePageSize, (currentWeekPage + 1) * employeePageSize), [filteredWeekEmployees, currentWeekPage, employeePageSize]);
  const visibleWeekEmployeeIds = useMemo(() => new Set(visibleWeekEmployees.map((employee) => employee.id)), [visibleWeekEmployees]);
  const calendarShifts = useMemo(() => limitWeekEvents
    ? shiftsForEmployees(workingCalendarShifts, visibleWeekEmployeeIds)
    : workingCalendarShifts, [workingCalendarShifts, limitWeekEvents, visibleWeekEmployeeIds]);
  const visibleRangeShiftCount = useMemo(() => range
    ? shiftsOverlappingCalendarDates(workingCalendarShifts, range.from, range.to, timezone).length
    : 0, [workingCalendarShifts, range, timezone]);
  const visiblePageShiftCount = useMemo(() => range
    ? shiftsOverlappingCalendarDates(calendarShifts, range.from, range.to, timezone).length
    : 0, [calendarShifts, range, timezone]);
  const carryoverShifts = useMemo(() => calendarShifts.filter((shift) => range && shift.date < range.from), [calendarShifts, range]);
  const formalRoleNames = useMemo(() => new Map(roles.map((role) => [role.id, role.nameZh])), [roles]);
  const formalRoleColors = useMemo(() => new Map(roles.map((role) => [role.id, role.colorToken])), [roles]);
  const usableTemplates = useMemo(() => usableCalendarTemplates(templates, roles), [templates, roles]);
  const displayGroups = useMemo(() => groupShiftsForCalendar(calendarShifts, resolveDraftEmployeeName, formalRoleNames, undefined, formalRoleColors), [calendarShifts, resolveDraftEmployeeName, formalRoleNames, formalRoleColors]);
  const displayLayouts = useMemo(() => layoutCalendarShiftGroups(displayGroups), [displayGroups]);
  const visibleDayLayouts = useMemo(() => range && view !== "dayGridMonth"
    ? layoutCalendarShiftGroupsByVisibleDay(displayGroups, range.from, range.to, timezone)
    : new Map(), [displayGroups, range, timezone, view]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (calendarPageRef.current) positionVisibleCalendarEvents(calendarPageRef.current, visibleDayLayouts);
    });
    return () => cancelAnimationFrame(frame);
  }, [visibleDayLayouts]);
  const events = useMemo(() => displayLayouts.map(({ group, clusterId, columnIndex, columnCount, columnSpan }) => {
    const groupShiftIds = group.shiftIds;
    const selectedCount = groupShiftIds.filter((id) => selectedShiftIds.includes(id)).length;
    return {
      id: group.id,
      start: group.startAt,
      end: group.endAt,
      title: `${group.role.name} ${group.assignments.map((item) => item.employeeName).join(" ")}`,
      backgroundColor: "transparent",
      borderColor: "transparent",
      textColor: "#1d2430",
      editable: false,
      classNames: [
        "roster-layout-managed",
        group.sourceShifts.length > 1 ? "roster-event-grouped" : "",
        columnCount > 1 ? "roster-event-overlap" : "",
        columnCount > 1 ? `roster-event-columns-${Math.min(columnCount, 4)}` : "",
        selectedCount === groupShiftIds.length && selectedCount ? "roster-event-selected" : "",
        selectedCount > 0 && selectedCount < groupShiftIds.length ? "roster-event-partial" : "",
      ].filter(Boolean),
      extendedProps: {
        shiftGroup: group,
        layoutOrder: columnIndex,
        overlapLayout: { clusterId, columnIndex, columnCount, columnSpan },
      },
    };
  }), [displayLayouts, selectedShiftIds]);

  function navigate(action: "prev" | "next" | "today") { if (!saving) { setSelectingGroup(null);   calendarRef.current?.getApi()[action](); } }
  function changeView(next: CalendarView, date?: Date) {
    if (saving) return;
    setSelectingGroup(null);


    const nextPageSize = calendarEmployeePageSize(next, peakConcurrency);
    flushSync(() => {
      setWeekEmployeePage(Math.floor(currentWeekPage * employeePageSize / nextPageSize));
      setView(next);
    });
    calendarRef.current?.getApi().changeView(next, date);
  }
  function openDraft(next: ShiftDraft, includeCopyTarget = false) {
    if (!settings) {
      showToast({ tone: "error", title: "请先设置门店时区", description: "在设置中确认门店时区和营业时间后，才能创建班次。" });
      return;
    }
    if (!editContextReady) {
      showToast({ tone: "info", title: "排班暂时只读", description: "员工与岗位校验数据尚未加载，请刷新后再编辑。" });
      return;
    }
    if (draftSession && (draftSubmitUncertain || next.date < draftSession.period.startDate || next.date > draftSession.period.endDate)) {
      showToast({ tone: "info", title: "当前暂存模式只处理同一排班周期", description: "请先提交或放弃暂存，再切换到其他周期。" });
      return;
    }
    const employeeId = view !== "dayGridMonth" && visibleWeekEmployees.length === 1 && employees.some((employee) => employee.id === visibleWeekEmployees[0].id && employee.isActive)
      ? visibleWeekEmployees[0].id : undefined;
    pendingCreateRequest.current = null;
    setEditingShift(null);
    setEditingGroup(null);
    setStaleShift(false);
    setCopyingShift(null);
    setDraft(next.employeeId ? next : employeeId ? { ...next, employeeId } : next);
    loadDialogContext(next.date, includeCopyTarget);
  }

  function editShift(shift: Shift) {
    setEditingGroup(null);
    if (!editContextReady) {
      showToast({ tone: "info", title: "排班暂时只读", description: "员工与岗位校验数据尚未加载，请刷新后再编辑。" });
      return;
    }
    if (draftSession) {
      if (draftSubmitUncertain || shift.rosterPeriodId !== draftSession.period.id) {
        showToast({ tone: "info", title: "不能编辑此班次", description: "请先核对提交结果，或在当前排班周期内选择班次。" });
        return;
      }
      const pending = draftSession.queue.changes.find((change) => change.kind !== "create" && change.shiftId === shift.id);
      if (pending?.kind === "delete") {
        showToast({ tone: "info", title: "班次已暂存删除", description: "如需编辑，请先从待提交清单移除删除操作。" });
        return;
      }
      if (pending?.kind === "update") {
        const role = roles.find((item) => item.id === pending.value.shiftRoleId) ?? shift.shiftRole;
        shift = { ...shift, ...pending.value, shiftRole: role,
          assignments: pending.value.employeeIds.map((employeeId) => shift.assignments.find((item) => item.employeeId === employeeId) ?? {
            id: `pending-${employeeId}`, employeeId, employeeNameSnapshot: employees.find((employee) => employee.id === employeeId)?.displayName ?? employeeId,
            employeeTypeSnapshot: employees.find((employee) => employee.id === employeeId)?.employeeType ?? "REGULAR", officialScoreSnapshot: null, tierSnapshot: null,
          }) };
      }
    }
    pendingCreateRequest.current = null;
    setEditingShift(shift);
    setStaleShift(false);
    setCopyingShift(null);
    setDraft({ date: shift.date, start: new Date(shift.startAt), end: new Date(shift.endAt) });
    loadDialogContext(shift.date);
  }

  function createDateShift(date: string, employeeId?: string) {
    if (!data || !settings || !editContextReady || loading || saving) return;
    try {
      const start = storeDateTime(date, settings?.openingTime ?? "09:00", timezone);
      const durationMinutes = Math.max(60, calendarClickDurationMinutes(settings?.slotIntervalMinutes ?? 30, settings?.minimumShiftMinutes ?? 0));
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      if (settings && !calendarRangeWithinStoreHours(start, end, timezone, settings.openingTime, settings.closingTime)) {
        showToast({ tone: "error", title: "无法预填班次时间", description: "门店营业时段不足以容纳最短班次，请检查门店设置。" });
        return;
      }
      openDraft({ date, start, end, employeeId });
    } catch {
      showToast({ tone: "error", title: "无法预填班次时间", description: "该日期的门店开始时间无效，请改用日视图选择有效时间。" });
    }
  }
  function createLaneShift(employeeId: string, date: string) { createDateShift(date, employeeId); }

  function copyShift(shift: Shift) {
    if (!editContextReady) {
      showToast({ tone: "info", title: "排班暂时只读", description: "员工与岗位校验数据尚未加载，请刷新后再复制。" });
      return;
    }
    const targetDate = addCalendarDays(shift.date, 1);
    pendingCreateRequest.current = null;


    setEditingShift(null);
    setEditingGroup(null);
    setStaleShift(false);
    setCopyingShift(shift);
    setDraft({ date: targetDate, start: new Date(shift.startAt), end: new Date(shift.endAt) });
    loadDialogContext(targetDate, true);
  }

  function openRepeatShift(shift: Shift) {
    setDraft(null);
    setEditingShift(null);
    setEditingGroup(null);
    setCopyingShift(null);
    setSelectingGroup(null);
    setRepeatSourceShift(shift);
  }

  function chooseRepeatSource(group: CalendarShiftGroup) {
    setDraft(null);
    setEditingShift(null);
    setEditingGroup(null);
    setCopyingShift(null);
    setSelectingGroupAction("repeat");
    setSelectingGroup(group);
  }

  async function previewRepeatShift(targetDates: string[]) {
    if (!storeId || !repeatSourceShift) throw new Error("来源班次未选定");
    return rosterRepository.previewRepeatShift({ storeId, sourceShiftId: repeatSourceShift.id, targetDates });
  }

  async function confirmRepeatShift(preview: RepeatPreview) {
    if (!storeId || !repeatSourceShift || !preview.canCopy || !beginMutation()) return false;
    try {
      const result = await rosterRepository.repeatShift({ storeId, sourceShiftId: repeatSourceShift.id, targetDates: preview.targetDates,
        expectedSourcePeriodVersion: preview.sourcePeriodVersion, expectedTargetPeriodVersions: preview.targetPeriodVersions });
      setRepeatSourceShift(null);
      showToast({ tone: "success", title: "重复班次已生成", description: `${result.created} 个班次已加入日历` });
      await load();
      return true;
    } catch (cause) {
      if (isUncertainMutation(cause)) {
        setRepeatSourceShift(null);
        calendarRef.current?.getApi().gotoDate(preview.targetDates[0]);
      }
      await reportMutationFailure(cause, "重复班次未完成");
      return false;
    }
    finally { finishMutation(); }
  }

  function loadDialogContext(date: string, includeCopyTarget = false) {
    if (!storeId) return;
    setDialogAvailability(null); setDialogAvailabilityError("");
    if (includeCopyTarget) { setCopyTargetCalendar(null); setCopyTargetCalendarError(""); }
    const requestSequence = ++dialogRequestSequence.current;
    void Promise.all([workforceRepository.employees(storeId), rosterRepository.availability(storeId, addCalendarDays(date, -1), addCalendarDays(date, 1)),
      includeCopyTarget ? rosterRepository.calendar(storeId, date, date) : Promise.resolve(null)]).then(([result, rows, targetCalendar]) => {
      if (requestSequence !== dialogRequestSequence.current) return;
      setEmployees(result.employees);
      setWorkforceGeneratedAt(result.generatedAt);
      setDialogAvailability({ storeId, date, rows });
      if (includeCopyTarget) setCopyTargetCalendar(targetCalendar);
    }).catch((cause) => {
      if (requestSequence !== dialogRequestSequence.current) return;
      const description = cause instanceof ApiRequestError ? schedulingFeedback(cause.validation, cause.message, timezone) : cause instanceof Error ? cause.message : "请稍后重试";
      setDialogAvailabilityError(description);
      if (includeCopyTarget) setCopyTargetCalendarError(description);
      showToast({ tone: "error", title: includeCopyTarget ? "复制目标检查失败" : "员工或可用时间加载失败", description });
    });
  }

  function changeCopyDate(date: string) {
    if (!draft || !copyingShift || !storeId || date === draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setDraft({ ...draft, date });
    loadDialogContext(date, true);
  }

  function openGroup(group: CalendarShiftGroup) {
    if (group.sourceShifts.length === 1) { editShift(group.sourceShifts[0]); return; }
    const periodIds = new Set(group.sourceShifts.map((shift) => shift.rosterPeriodId));
    if (periodIds.size !== 1 || group.mixedBreakMinutes || group.mixedRoleSnapshots) {
      setSelectingGroupAction("edit");
      setSelectingGroup(group);
      return;
    }
    if (draftSession && (draftSubmitUncertain || group.sourceShifts[0].rosterPeriodId !== draftSession.period.id
      || group.sourceShifts.some((shift) => draftSession.queue.changes.some((change) => change.kind !== "create" && change.shiftId === shift.id)))) {
      showToast({ tone: "info", title: "先处理已暂存的修改", description: "此合并班次已有待提交操作，提交或移除后可整体编辑。" });
      return;
    }
    const merged = mergedShiftForCalendarGroup(group);
    pendingCreateRequest.current = null;


    setEditingGroup(group);
    setEditingShift(merged);
    setStaleShift(false);
    setCopyingShift(null);
    setDraft({ date: merged.date, start: new Date(merged.startAt), end: new Date(merged.endAt) });
    loadDialogContext(merged.date);
  }

  function currentClockChangeSelection() {
    const first = gridPointerStart.current;
    const last = gridPointerCurrent.current;
    if (!first || !last || !isStoreClockChangeDate(first.date, timezone)) return null;
    try { return timeGridPointerRange(first, last, settings?.slotIntervalMinutes ?? 30, timezone); }
    catch { return null; }
  }

  function select(selection: DateSelectArg) {
    if (previewingCoveredSelection.current) return;
    if (canceledCalendarGesture.current) {
      calendarRef.current?.getApi().unselect();
      return;
    }
    if (!storeId || !data || !settings || !editContextReady || loading || saving) return;
    const firstPointerSlot = gridPointerStart.current;
    const lastPointerSlot = selection.jsEvent instanceof TouchEvent ? gridPointerCurrent.current
      : selection.jsEvent ? timeGridPointerSlot(selection.jsEvent) ?? gridPointerCurrent.current : gridPointerCurrent.current;
    if (view === "timeGridWeek" && firstPointerSlot && lastPointerSlot && firstPointerSlot.date !== lastPointerSlot.date) {
      calendarRef.current?.getApi().unselect();
      showToast({ tone: "info", title: "请在同一天选择时间", description: "跨日班次可在新增班次表单中设置次日结束。" });
      return;
    }
    let selectedDate = storeParts(selection.start, timezone).date;
    let start = selection.start;
    let end = selection.end;
    if (isStoreClockChangeDate(gridPointerStart.current?.date ?? selectedDate, timezone)) {
      calendarRef.current?.getApi().unselect();
      const first = gridPointerStart.current;
      const last = lastPointerSlot;
      if (!first || !last) {
        showToast({ tone: "error", title: "无法确认所选时间", description: "请重试拖选，或使用“新增班次”表单。" });
        return;
      }
      try {
        const range = timeGridPointerRange(first, last, settings?.slotIntervalMinutes ?? 30, timezone);
        if (!range) {
          showToast({ tone: "error", title: "请在同一天选择时间", description: "跨日期拖选请分别创建班次。" });
          return;
        }
        selectedDate = range.date;
        start = range.start;
        end = range.end;
      } catch (cause) {
        showToast({ tone: "error", title: "该时间不能用于排班", description: cause instanceof Error ? cause.message : "请选择存在的门店当地时间。" });
        return;
      }
    } else {
      end = upwardTimeGridSelectionEnd(gridPointerStart.current, start, end, settings?.slotIntervalMinutes ?? 30, timezone) ?? end;
    }
    if (!canCreateFromCalendarSelection(start, end, timezone, settings?.minimumShiftMinutes ?? 0)) {
      calendarRef.current?.getApi().unselect();
      return;
    }
    if (settings && !calendarRangeWithinStoreHours(start, end, timezone, settings.openingTime, settings.closingTime)) {
      calendarRef.current?.getApi().unselect();
      showToast({ tone: "error", title: "无法在此时间创建班次", description: "所选时间范围不符合门店营业时间，请选择其他时间。" });
      return;
    }
    openDraft({ date: selectedDate, start, end });
    calendarRef.current?.getApi().unselect();
  }

  useEffect(() => {
    coveredEventSelect.current = (first, last, final) => {
      const calendar = calendarRef.current?.getApi();
      if (!calendar || !data || !settings || !editContextReady || loading || saving || view === "dayGridMonth") return;
      if (first.date !== last.date) {
        calendar.unselect();
        if (final) showToast({ tone: "info", title: "请在同一天选择时间", description: "跨日期班次可在新增班次表单中设置次日结束。" });
        return;
      }
      try {
        const range = timeGridPointerRange(first, last, settings.slotIntervalMinutes, timezone);
        if (!range) return;
        previewingCoveredSelection.current = !final;
        try { calendar.select({ start: range.start, end: range.end }); }
        finally { previewingCoveredSelection.current = false; }
      } catch (cause) {
        calendar.unselect();
        if (final) showToast({ tone: "error", title: "该时间不能用于排班", description: cause instanceof Error ? cause.message : "请选择存在的门店当地时间。" });
      }
    };
    return () => { coveredEventSelect.current = () => {}; };
  }, [data, settings, editContextReady, loading, saving, view, timezone, showToast]);

  async function saveShift(input: { date: string; startAt: string; endAt: string; breakMinutes: number; shiftRoleId: string; employeeIds: string[]; publicNote: string; internalNote: string }) {
    if (!storeId) return;
    if (input.publicNote.length > 500 || input.internalNote.length > 1000) {
      showToast({ tone: "error", title: "备注过长", description: "合并后的公开备注最多 500 字，内部备注最多 1000 字；请在编辑框中精简后保存。" });
      return;
    }
    if (draftSession) {
      if (draftSubmitUncertain) return;
      if (input.date < draftSession.period.startDate || input.date > draftSession.period.endDate ||
        (editingShift && editingShift.rosterPeriodId !== draftSession.period.id)) {
        showToast({ tone: "error", title: "不能暂存到其他周期", description: "当前暂存模式只处理同一个排班周期。" });
        return;
      }
      try {
        const queue = editingGroup ? stageMergedShiftUpdate(draftSession.queue, editingGroup.sourceShifts, input)
          : editingShift ? stageExistingShift(draftSession.queue, editingShift, input)
          : stageNewShift(draftSession.queue, crypto.randomUUID(), input);
        setDraftSession({ ...draftSession, queue });
        setDraft(null); setEditingShift(null); setEditingGroup(null); setCopyingShift(null); setStaleShift(false);
        showToast({ tone: "success", title: "班次已暂存", description: "尚未写入排班；请检查待提交清单后统一提交。" });
      } catch (cause) {
        showToast({ tone: "error", title: "暂存失败", description: calendarError(cause, timezone) });
      }
      return;
    }
    if (!beginMutation()) return;
    const wasCopy = Boolean(copyingShift);
    let clientShiftId: string | undefined;
    let mutationAttempted = false;
    try {
      if (editingGroup) {
        const period = findPeriod(data?.periods ?? [], input.date);
        if (!period || editingGroup.sourceShifts.some((shift) => shift.rosterPeriodId !== period.id)) throw new Error("编辑班次的排班周期已变化，请刷新后重试");
        const queue = stageMergedShiftUpdate(emptyCalendarDraftQueue(storeId), editingGroup.sourceShifts, input);
        mutationAttempted = true;
        await rosterRepository.commitDraftPeriod(period.id, queue);
      } else if (editingShift) {
        const period = findPeriod(data?.periods ?? [], input.date);
        if (!period) throw new Error("编辑班次的排班周期已变化，请刷新后重试");
        mutationAttempted = true;
        await rosterRepository.updateShift(editingShift.id, { storeId, rosterPeriodId: period.id, ...input, version: editingShift.version });
      } else {
        const signature = JSON.stringify([storeId, input]);
        if (pendingCreateRequest.current?.signature !== signature) pendingCreateRequest.current = { signature, shiftId: crypto.randomUUID() };
        clientShiftId = pendingCreateRequest.current.shiftId;
        const dates = rosterCycleRange(input.date, settings);
        mutationAttempted = true;
        await rosterRepository.createShiftWithPeriod({ storeId, targetStartDate: dates.startDate, targetEndDate: dates.endDate, ...input, clientShiftId });
      }
      pendingCreateRequest.current = null;
      setDraft(null);
      setEditingShift(null);
      setEditingGroup(null);
      setCopyingShift(null);
      setStaleShift(false);
      showToast({ tone: "success", title: editingShift ? "班次已更新" : "班次已创建", description: `${input.date} ${formatTime(input.startAt, timezone)} - ${formatTime(input.endAt, timezone)}` });
      if (wasCopy) calendarRef.current?.getApi().gotoDate(input.date);
      await load();
    } catch (cause) {
      if (!mutationAttempted) {
        showToast({ tone: "error", title: "保存前检查失败", description: calendarError(cause, timezone) });
        return;
      }
      if (editingShift && cause instanceof ApiRequestError && (cause.status === 404 || cause.validation?.code === "STALE_VERSION")) {
        setStaleShift(true);
        await load();
      }
      if (cause instanceof ApiRequestError && cause.validation?.code === "ARCHIVED_EMPLOYEE") {
        loadDialogContext(input.date, Boolean(copyingShift));
      }
      if (isUncertainMutation(cause)) {
        try {
          const currentShifts = clientShiftId ? [await rosterRepository.shift(storeId, clientShiftId)]
            : (await rosterRepository.calendar(storeId, input.date, addCalendarDays(input.date, 1))).shifts;
          const matching = findMatchingShift(currentShifts, input, clientShiftId ?? editingShift?.id, undefined, editingShift?.version);
          if (matching && (!editingGroup || !(await findRemainingShiftAfterUncertainDelete(
            storeId, editingGroup.sourceShifts.slice(1).map((shift) => shift.id), rosterRepository.shift)))) {
            pendingCreateRequest.current = null;
            setDraft(null); setEditingShift(null); setEditingGroup(null); setCopyingShift(null); setStaleShift(false);
            showToast({ tone: "info", title: "日历中已找到匹配班次", description: "服务器已返回相同的班次记录，请核对后继续排班。" });
            if (wasCopy) calendarRef.current?.getApi().gotoDate(input.date);
            await load();
            return;
          }
        } catch { /* Keep the draft when the server still cannot be reached. */ }
      }
      await reportMutationFailure(cause, "保存失败");
      if (isUncertainMutation(cause) && copyingShift) loadDialogContext(input.date, true);
    } finally { finishMutation(); }
  }

  async function deleteShift() {
    if (!storeId || !editingShift) return;
    if (draftSession) {
      if (draftSubmitUncertain) return;
      if (editingShift.rosterPeriodId !== draftSession.period.id) {
        showToast({ tone: "error", title: "不能删除其他周期的班次", description: "请退出当前暂存模式后再操作。" });
        return;
      }
      try {
        setDraftSession({ ...draftSession, queue: editingGroup ? stageMergedShiftDelete(draftSession.queue, editingGroup.sourceShifts) : stageDeleteShift(draftSession.queue, editingShift) });
        setDraft(null); setEditingShift(null); setEditingGroup(null);
        showToast({ tone: "success", title: "删除已暂存", description: "统一提交前，服务器上的班次不会被删除。" });
      } catch (cause) {
        showToast({ tone: "error", title: "暂存失败", description: calendarError(cause, timezone) });
      }
      return;
    }
    if (!beginMutation()) return;
    try {
      if (editingGroup) {
        const queue = stageMergedShiftDelete(emptyCalendarDraftQueue(storeId), editingGroup.sourceShifts);
        await rosterRepository.commitDraftPeriod(editingShift.rosterPeriodId, queue);
      } else await rosterRepository.deleteShift(editingShift.id, storeId, editingShift.version);
      setDraft(null); setEditingShift(null); setEditingGroup(null);
      showToast({ tone: "success", title: "班次已删除" });
      await load();
    } catch (cause) {
      if (isUncertainMutation(cause)) {
        try {
          const remaining = await findRemainingShiftAfterUncertainDelete(storeId,
            editingGroup?.shiftIds ?? [editingShift.id], rosterRepository.shift);
          if (remaining) {
            setStaleShift(true);
            await load();
            showToast({ tone: "info", title: "班次仍存在", description: `该班次当前位于 ${remaining.date}。请关闭编辑窗口，从刷新后的日历核对再操作。` });
          } else {
            setDraft(null); setEditingShift(null); setEditingGroup(null);
            showToast({ tone: "info", title: "班次已不存在", description: "服务器已确认所选班次的记录均不存在；请核对刷新后的排班。" });
            await load();
          }
          return;
        } catch { /* Keep the editor when any Shift readback is unconfirmed. */ }
      }
      if (cause instanceof ApiRequestError && (cause.status === 404 || cause.validation?.code === "STALE_VERSION")) {
        setStaleShift(true);
        await load();
      }
      await reportMutationFailure(cause, "删除失败");
    } finally { finishMutation(); }
  }

  async function copyPreviousWeek() {
    if (!storeId || !beginMutation()) return;
    try {
      const focusedDate = storeParts(calendarRef.current?.getApi().getDate() ?? new Date(), timezone).date;
      const target = rosterCycleRange(focusedDate, settings);
      const previousStart = addCalendarDays(target.startDate, target.cycleType === "FORTNIGHT" ? -14 : -7);
      const previousEnd = addCalendarDays(target.startDate, -1);
      const sourceCalendar = await rosterRepository.calendar(storeId, previousStart, previousEnd);
      const sourcePeriod = exactCyclePeriod(sourceCalendar.periods, previousStart, previousEnd, target.cycleType);
      if (!sourcePeriod) throw new Error(target.cycleType === "FORTNIGHT" ? "\u4e0a\u4e00\u53cc\u5468\u6ca1\u6709\u53ef\u590d\u5236\u7684\u6392\u73ed\u5468\u671f" : "\u4e0a\u4e00\u5468\u6ca1\u6709\u53ef\u590d\u5236\u7684\u6392\u73ed\u5468\u671f");
      const preview = await rosterRepository.previewCopyPeriod({ storeId, sourcePeriodId: sourcePeriod.id, targetStartDate: target.startDate });
      setCopySourcePeriodId(sourcePeriod.id);
      setCopyPreview(preview);
    } catch (cause) {
      showToast({ tone: "error", title: "复制上一周预览失败", description: calendarError(cause, timezone) });
    } finally { finishMutation(); }
  }

  function openCopyDay() {
    const focusedDate = storeParts(calendarRef.current?.getApi().getDate() ?? new Date(), timezone).date;
    const targetDate = addCalendarDays(focusedDate, 1);
    copyDayPreviewSequence.current += 1;
    copyDayDatesRef.current = { source: focusedDate, target: targetDate };
    setCopyDaySource(focusedDate);
    setCopyDayTarget(targetDate);
    setCopyDayPreview(null);
    setCopyDayPreviewStoreId(null);
    setCopyDayChecking(true);
    setCopyDayPreviewError("");
    setCopyDayOpen(true);
  }

  function changeCopyDaySource(date: string) {
    if (date === copyDayDatesRef.current.source) return;
    copyDayDatesRef.current.source = date;
    copyDayPreviewSequence.current += 1;
    setCopyDaySource(date);
    setCopyDayPreview(null);
    setCopyDayPreviewStoreId(null);
    setCopyDayChecking(Boolean(date && copyDayDatesRef.current.target));
    setCopyDayPreviewError("");
  }

  function changeCopyDayTarget(date: string) {
    if (date === copyDayDatesRef.current.target) return;
    copyDayDatesRef.current.target = date;
    copyDayPreviewSequence.current += 1;
    setCopyDayTarget(date);
    setCopyDayPreview(null);
    setCopyDayPreviewStoreId(null);
    setCopyDayChecking(Boolean(date && copyDayDatesRef.current.source));
    setCopyDayPreviewError("");
  }

  async function previewDayCopy() {
    if (!storeId || !copyDaySource || !copyDayTarget || copyDayChecking || !beginMutation()) return;
    const requestSequence = ++copyDayPreviewSequence.current;
    const sourceDate = copyDaySource;
    const targetDate = copyDayTarget;
    setCopyDayPreview(null);
    setCopyDayPreviewStoreId(null);
    setCopyDayChecking(true);
    setCopyDayPreviewError("");
    try {
      const preview = await rosterRepository.previewCopyDay({ storeId, sourceDate, targetDate });
      if (requestSequence === copyDayPreviewSequence.current) { setCopyDayPreview(preview); setCopyDayPreviewStoreId(storeId); setCopyDayPreviewError(""); }
    } catch (cause) {
      if (requestSequence === copyDayPreviewSequence.current) setCopyDayPreviewError(calendarError(cause, timezone));
    }
    finally { if (requestSequence === copyDayPreviewSequence.current) setCopyDayChecking(false); finishMutation(); }
  }

  async function confirmDayCopy() {
    if (!storeId || copyDayChecking || !scopedCopyDayPreview?.canCopy || scopedCopyDayPreview.sourceDate !== copyDaySource || scopedCopyDayPreview.targetDate !== copyDayTarget || !beginMutation()) return;
    try {
      const response = await rosterRepository.copyDay({ storeId, sourceDate: copyDaySource, targetDate: copyDayTarget, expectedSourcePeriodVersion: scopedCopyDayPreview.sourcePeriodVersion, expectedTargetPeriodVersion: scopedCopyDayPreview.targetPeriodVersion });
      const result = assertCopyDayResponse(response, storeId, scopedCopyDayPreview);
      setCopyDayOpen(false);
      setCopyDayPreview(null);
      setCopyDayPreviewStoreId(null);
      showToast({ tone: "success", title: "已复制一天", description: `${result.created} 个班次已复制到 ${copyDayTarget} 日历` });
      calendarRef.current?.getApi().gotoDate(copyDayTarget);
      await load();
    } catch (cause) {
      setCopyDayPreview(null);
      setCopyDayPreviewStoreId(null);
      setCopyDayPreviewError("请重新检查来源和目标日期，再尝试复制。");
      if (isUncertainMutation(cause)) {
        setCopyDayOpen(false);
        calendarRef.current?.getApi().gotoDate(copyDayTarget);
      }
      await reportMutationFailure(cause, "复制一天未完成");
    }
    finally { finishMutation(); }
  }

  async function confirmCopyPeriod() {
    if (!storeId || !copySourcePeriodId || !copyPreview?.canCopy) return;
    if (!beginMutation()) return;
    try {
      const target = rosterCycleRange(copyPreview.targetStartDate, settings);
      const copied = await rosterRepository.copyPeriod({ storeId, sourcePeriodId: copySourcePeriodId, targetStartDate: copyPreview.targetStartDate, expectedSourcePeriodVersion: copyPreview.sourcePeriodVersion },
        { endDate: target.endDate, cycleType: target.cycleType, preview: copyPreview });
      setCopyPreview(null);
      setCopySourcePeriodId(null);
      showToast({ tone: "success", title: "排班已复制", description: `${copied.startDate} 至 ${copied.endDate}` });
      calendarRef.current?.getApi().gotoDate(copied.startDate);
      await load();
    } catch (cause) {
      setCopyPreview(null);
      setCopySourcePeriodId(null);
      if (isUncertainMutation(cause)) {
        calendarRef.current?.getApi().gotoDate(copyPreview.targetStartDate);
      }
      await reportMutationFailure(cause, "复制失败");
    }
    finally { finishMutation(); }
  }

  function toggleBatchGroup(group: CalendarShiftGroup) {
    if (!editContextReady) return;
    const ids = group.sourceShifts.filter((shift) => editablePeriodIds.has(shift.rosterPeriodId)).map((shift) => shift.id);
    if (!ids.length) {
      showToast({ tone: "info", title: "当前班次暂不可批量修改", description: "请刷新日历后重新选择当前周期的班次。" });
      return;
    }
    setSelectedShiftIds((current) => ids.every((id) => current.includes(id))
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]);
    setConfirmingBatchDelete(null);
  }
  function currentBatchItems() {
    const selected = new Set(selectedShiftIds);
    const shifts = (data?.shifts ?? []).filter((shift) => selected.has(shift.id));
    if (!selected.size || shifts.length !== selected.size || shifts.some((shift) => !editablePeriodIds.has(shift.rosterPeriodId))) {
      setSelectedShiftIds([]);
      setConfirmingBatchDelete(null);
      showToast({ tone: "info", title: "批量选择已变化", description: "请刷新后重新选择当前班次。" });
      return null;
    }
    return shifts.map((shift) => ({ id: shift.id, version: shift.version }));
  }
  async function batchUpdateRole() {
    if (!storeId || !currentBatchRoleId) return;
    const items = currentBatchItems();
    if (!items) return;
    if (!beginMutation()) return; try { const result = await rosterRepository.batchUpdateRole(storeId, items, currentBatchRoleId); showToast({ tone: "success", title: `已更新 ${result.updated} 个班次` }); setSelectedShiftIds([]); await load(); } catch (cause) {
      const staleSelection = cause instanceof ApiRequestError && (cause.status === 404 || cause.status === 409);
      if (staleSelection || isUncertainMutation(cause)) setSelectedShiftIds([]);
      if (staleSelection || (cause instanceof ApiRequestError && cause.status === 422)) await load();
      await reportMutationFailure(cause, "批量更新失败");
    } finally { finishMutation(); }
  }
  async function batchDelete() {
    if (!storeId) return;
    const items = currentBatchItems();
    if (!items) return;
    if (!confirmedBatchDeleteMatches(confirmingBatchDelete, items.map((item) => item.id))) {
      setConfirmingBatchDelete(null);
      showToast({ tone: "info", title: "批量选择已变化", description: "请核对班次后重新确认删除。" });
      return;
    }
    if (!beginMutation()) return; try { const result = await rosterRepository.batchDelete(storeId, items); showToast({ tone: "success", title: `已删除 ${result.deleted} 个班次` }); setSelectedShiftIds([]); setConfirmingBatchDelete(null); await load(); } catch (cause) {
      const staleSelection = cause instanceof ApiRequestError && (cause.status === 404 || cause.status === 409);
      if (staleSelection || isUncertainMutation(cause)) { setSelectedShiftIds([]); setConfirmingBatchDelete(null); }
      if (staleSelection) await load();
      await reportMutationFailure(cause, "批量删除失败");
    } finally { finishMutation(); }
  }

  if (!storeId) return <AdminStoreRequired loading={storesLoading} error={error} onRetry={loadStores} />;

  const selectedStoreName = stores.find((store) => store.id === storeId)?.name ?? user?.stores.find((store) => store.id === storeId)?.name ?? "当前门店";
  const toolbarDate = calendarToolbarDate(view, range, title);
  const slotFraction = (settings?.slotIntervalMinutes ?? 30) / 1440;
  const minimumSlotHeight = Math.max(12, (settings?.slotIntervalMinutes ?? 30) * 0.8);
  const slotHeight = `max(${minimumSlotHeight}px, calc(${(slotFraction * 100).toFixed(5)}dvh - ${(slotFraction * TIMEGRID_VIEWPORT_OFFSET_PX).toFixed(3)}px))`;

  return (
    <div ref={calendarPageRef} className="calendar-page">
      <header className="calendar-toolbar">
        <div className="calendar-toolbar-store">
          {stores.length > 1 ? <AppSelect ariaLabel="门店" value={selectedStoreId} onValueChange={(value) => { setCopyDayOpen(false); setCopyDayPreview(null); setCopyDayPreviewStoreId(null); setSelectedStoreId(value); rememberContext(value, view, calendarDate); }} options={stores.map((store) => ({ value: store.id, label: store.name }))} disabled={saving || Boolean(draftSession)} />
            : <span title={selectedStoreName}>{selectedStoreName}</span>}
        </div>
        <h1 className="calendar-toolbar-date">{toolbarDate}</h1>
        <div className="calendar-toolbar-actions flex flex-wrap items-center gap-2">
          <div className="calendar-date-navigation" role="group" aria-label="日期导航">
            <button type="button" className="calendar-icon-button" onClick={() => navigate("prev")} disabled={saving} aria-label="上一页"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="calendar-text-button" onClick={() => navigate("today")} disabled={saving}>今天</button>
            <button type="button" className="calendar-icon-button" onClick={() => navigate("next")} disabled={saving} aria-label="下一页"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <CalendarViewSwitch value={view} onChange={changeView} disabled={saving} />
          <button type="button" className="calendar-text-button" onClick={()=>setAgentOpen(v=>!v)} aria-expanded={agentOpen}><Bot className="h-4 w-4"/>智能体排班</button>
        </div>
      </header>
      <CalendarAgentPanel key={`${user?.accountId}:${storeId}:${DateTime.fromISO(calendarDate??range?.from??storeParts(new Date(),timezone).date).startOf('week').toISODate()}`} storeId={storeId} weekStart={DateTime.fromISO(calendarDate??range?.from??storeParts(new Date(),timezone).date).startOf('week').toISODate()!} visible={agentOpen} disabled={saving||loading||!editContextReady||Boolean(draftSession)} onApplied={refreshAgentCalendar} onShowWeek={showAgentWeek}/>


      {draftSession ? <CalendarDraftBar queue={draftSession.queue} savedShifts={[...periodShifts, ...(data?.shifts ?? []).filter((shift) => !periodShifts.some((item) => item.id === shift.id))]} roles={roles} employees={employees} timezone={timezone} busy={saving || loading || !editContextReady} uncertain={draftSubmitUncertain}
        onRemove={removeDraftChange} onDiscard={() => {
          if (draftSession.queue.changes.length && !window.confirm("放弃所有未提交的排班修改？此操作不会改变服务器数据。")) return;
          setDraftSession(null); setDraftSubmitUncertain(false);
        }} onSubmit={() => void submitDraftSession()} onReconcile={() => void reconcileDraftSession()} /> : null}

      {error ? <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert"><span className="flex items-center gap-2"><CircleAlert className="h-4 w-4" />{error}</span><button type="button" onClick={() => void load()} className="font-semibold underline">重试</button></div> : null}
      {data && !loading && !settings ? <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert"><span className="flex items-center gap-2"><CircleAlert className="h-4 w-4" />当前门店未确认时区，日历暂时只读；请先保存门店设置。</span><a href="/settings" className="shrink-0 font-semibold underline">前往设置</a></div> : null}
      {templateError ? <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status"><span className="flex items-center gap-2"><CircleAlert className="h-4 w-4" />模板暂不可用：{templateError}。仍可查看日历并手动创建班次。</span><button type="button" onClick={() => void loadTemplates()} className="shrink-0 font-semibold underline">重试模板</button></div> : null}
      {carryoverShifts.length ? <section className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4" aria-label="跨日延续班次">
        <h2 className="text-sm font-semibold text-amber-950">前一日延续的班次</h2>
        <div className="mt-2 flex flex-wrap gap-2">{carryoverShifts.map((shift) => <button key={shift.id} type="button" className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs text-graphite-950 hover:border-amber-600 focus-visible:outline-2 focus-visible:outline-brand-600" disabled={loading || saving} onClick={() => editShift(shift)}>
          <strong className="block">{formalRoleNames.get(shift.shiftRoleId) ?? `旧岗位：${shift.roleNameSnapshot}`} · {shift.assignments.map((assignment) => resolveDraftEmployeeName(shift, assignment) ?? assignment.employeeNameSnapshot).join("、")}</strong>
          <span className="tabular-nums">{shift.date} {storeParts(shift.startAt, timezone).time}–{storeParts(shift.endAt, timezone).date} {storeParts(shift.endAt, timezone).time}</span>
        </button>)}</div>
      </section> : null}
      {showEmployeeLanes && data && editContextReady ? <EmployeeLaneBoard storeId={storeId ?? undefined} focusedDate={range?.from ?? storeParts(new Date(), timezone).date} weekStartsOn={settings?.weekStartsOn ?? 1} timezone={timezone} employees={employees} shifts={workingCalendarShifts} formalRoleNames={formalRoleNames} formalRoleColors={formalRoleColors} periods={data.periods} saving={saving || loading || Boolean(draftSession)} onEdit={editShift} onCreate={createLaneShift} onSelectEmployee={(employee) => { setWeekEmployeeSearch(employee.displayName); setFocusedEmployeeId(employee.id); setWeekEmployeePage(0); requestAnimationFrame(() => employeeFilterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); }} /> : null}
      {limitWeekEvents ? <div ref={employeeFilterRef} className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-graphite-200 bg-white p-4 text-sm text-graphite-700" aria-label="日历员工筛选">
        <label className="min-w-52 flex-1 font-semibold">搜索员工<input className="native-input mt-1" value={weekEmployeeSearch} onChange={(event) => { setWeekEmployeeSearch(event.target.value); setFocusedEmployeeId(null); setWeekEmployeePage(0); }} placeholder="输入员工姓名" /></label>
        <span className="self-center" role="status">{view === "timeGridWeek" ? "周视图" : view === "timeGridDay" ? "日视图" : "月视图"}显示 {filteredWeekEmployees.length ? currentWeekPage * employeePageSize + 1 : 0}–{Math.min((currentWeekPage + 1) * employeePageSize, filteredWeekEmployees.length)} / {filteredWeekEmployees.length} 名匹配员工，本页 {visiblePageShiftCount} / 当前视图 {visibleRangeShiftCount} 个班次。其他员工班次可通过搜索或翻页查看。</span>
        {(weekEmployeeSearch || focusedEmployeeId) ? <button type="button" className="calendar-text-button" onClick={() => { setWeekEmployeeSearch(""); setFocusedEmployeeId(null); setWeekEmployeePage(0); }}>清除筛选</button> : null}
        <button type="button" className="calendar-text-button" disabled={currentWeekPage === 0} onClick={() => setWeekEmployeePage((page) => page - 1)}>上一组</button>
        <button type="button" className="calendar-text-button" disabled={currentWeekPage >= weekPageCount - 1} onClick={() => setWeekEmployeePage((page) => page + 1)}>下一组</button>
      </div> : null}
      {batchMode && editContextReady ? <div className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4"><p className="mr-auto self-center text-sm font-semibold text-brand-900">点击班次进行多选 · 已选 {selectedShiftIds.length} 个</p><div className="min-w-44"><AppSelect label="统一改为岗位" value={currentBatchRoleId} onValueChange={setBatchRoleId} options={roles.map((role) => ({ value: role.id, label: role.nameZh }))} disabled={loading || saving} /></div><button type="button" className="calendar-primary-button" disabled={loading || saving || !selectedShiftIds.length || !currentBatchRoleId} onClick={() => void batchUpdateRole()}>批量改岗</button>{confirmingBatchDelete ? <><button type="button" className="calendar-text-button border-red-700 bg-red-700 text-white hover:bg-red-800" disabled={saving} onClick={() => void batchDelete()}><Trash2 className="h-4 w-4" />确认删除 {confirmingBatchDelete.length} 个</button><button type="button" className="calendar-text-button" disabled={saving} onClick={() => setConfirmingBatchDelete(null)}>返回</button></> : <button type="button" className="calendar-text-button text-red-700" disabled={loading || saving || !selectedShiftIds.length} onClick={() => setConfirmingBatchDelete([...selectedShiftIds])}><Trash2 className="h-4 w-4" />批量删除</button>}</div> : null}
      <div className={`calendar-board${scheduledSidebarOpen && editContextReady ? " calendar-board--sidebar-open" : ""}`}>
      <section className="calendar-surface" style={{ "--calendar-slot-height": slotHeight } as CSSProperties} aria-busy={loading} onClickCapture={(event) => {
        if (view !== "dayGridMonth" || !data || loading || saving) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest(".fc-event, .fc-daygrid-more-link")) return;
        const day = target.closest<HTMLElement>(".fc-daygrid-day[data-date]");
        const date = day?.dataset.date;
        if (!date) return;
        if (target.closest(".fc-daygrid-day-number")) {
          changeView("timeGridDay", storeDateTime(date, "12:00", timezone));
          return;
        }
        createDateShift(date);
      }}>
        {loading && data ? <div className="calendar-updating">正在更新</div> : null}
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxon3Plugin]}
          timeZone={timezone}
          initialView={view}
          initialDate={calendarDate}
          headerToolbar={false}
          locale="zh-cn"
          firstDay={settings?.weekStartsOn ?? 1}
          allDaySlot={false}
          slotMinTime="00:00"
          slotMaxTime="24:00"
          slotDuration={calendarDuration(settings?.slotIntervalMinutes ?? 30)}
          slotLabelInterval="01:00"
          snapDuration={calendarDuration(settings?.slotIntervalMinutes ?? 30)}
          slotLabelContent={(slot) => {
            const minutes = Math.round(slot.time.milliseconds / 60_000);
            const hour = Math.floor(minutes / 60) % 24;
            return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
          }}
          selectable={Boolean(data && settings && editContextReady) && !loading && !saving && view !== "dayGridMonth"}
          editable={false}
          eventStartEditable={false}
          eventDurationEditable={false}
          eventResizableFromStart={false}
          selectMirror
          selectMinDistance={6}
          selectAllow={(selection) => {
            const first = gridPointerStart.current;
            const current = gridPointerCurrent.current;
            if (view === "timeGridWeek" && first && current && first.date !== current.date) return false;
            return isStoreClockChangeDate(first?.date ?? storeParts(selection.start, timezone).date, timezone)
              || canCreateFromCalendarSelection(selection.start,
                upwardTimeGridSelectionEnd(first, selection.start, selection.end, settings?.slotIntervalMinutes ?? 30, timezone) ?? selection.end,
                timezone, settings?.minimumShiftMinutes ?? 0);
          }}
          eventClassNames={(info) => {
            if (!info.isMirror || !info.event.start || !info.event.end) return [];
            const first = gridPointerStart.current;
            const last = gridPointerCurrent.current;
            const upwardClockChange = first && last && first.date === last.date && last.time < first.time && currentClockChangeSelection();
            return upwardClockChange || upwardTimeGridSelectionEnd(first, info.event.start, info.event.end, settings?.slotIntervalMinutes ?? 30, timezone)
              ? ["upward-selection-mirror"] : [];
          }}
          nowIndicator
          slotEventOverlap={false}
          eventOrder="start,-duration,layoutOrder,title"
          eventOrderStrict
          eventDidMount={(info) => {
            if (info.isMirror) return;
            info.el.dataset.rosterEventId = info.event.id;
            requestAnimationFrame(() => {
              if (!info.el.isConnected) return;
              positionCalendarEvent(info.el, visibleDayLayouts);
            });
          }}
          fixedWeekCount={false}
          expandRows={view === "dayGridMonth"}
          dayHeaders={view !== "timeGridDay"}
          dayMaxEvents
          events={events}
          height={view === "dayGridMonth" ? "max(540px, calc(100dvh - 214px))" : "auto"}
          datesSet={(info) => {
            const nextDate = storeParts(info.view.calendar.getDate(), timezone).date;
            setTitle(info.view.title);
            setRange({ from: storeParts(info.start, timezone).date, to: addCalendarDays(storeParts(info.end, timezone).date, -1) });
            setCalendarDate(nextDate);
            rememberContext(storeId, calendarViewFromQuery(info.view.type, view), nextDate);
          }}
          select={select}
          eventClick={(click) => {
            if (!data || loading || saving) return;
            if (click.jsEvent instanceof MouseEvent && click.jsEvent.detail > 0 && performance.now() < ignoreEventClickUntil.current) { click.jsEvent.preventDefault(); return; }
            const group = click.event.extendedProps.shiftGroup;
            if (!isCalendarShiftGroup(group)) {
              showToast({ tone: "error", title: "班次数据暂不可用", description: "请刷新日历后重试。" });
              return;
            }
            if (batchMode) toggleBatchGroup(group);
            else openGroup(group);
          }}
          eventDrop={(change) => change.revert()}
          eventResize={(change) => change.revert()}
          dateClick={(info) => {
            if (canceledCalendarGesture.current) return;
            if (!data || !settings || loading || saving) return;
            if (info.view.type === "dayGridMonth") return;
            if (isStoreClockChangeDate(info.dayEl.getAttribute("data-date") ?? storeParts(info.date, timezone).date, timezone)) {
              const slot = timeGridPointerSlot(info.jsEvent);
              if (!slot || slot.date !== info.dayEl.getAttribute("data-date")) {
                showToast({ tone: "error", title: "无法确认点击时间", description: "请重试点击，或使用“新增班次”表单。" });
                return;
              }
              try {
                const start = storeDateTime(slot.date, slot.time, timezone);
                const end = calendarClickEnd(start, calendarClickDurationMinutes(settings?.slotIntervalMinutes ?? 30, settings?.minimumShiftMinutes ?? 0), timezone);
                if (settings && !calendarRangeWithinStoreHours(start, end, timezone, settings.openingTime, settings.closingTime)) {
                  showToast({ tone: "error", title: "无法在此时间创建班次", description: "所选时间范围不符合门店营业时间，请选择其他时间。" });
                  return;
                }
                openDraft({ date: slot.date, start, end });
              } catch (cause) {
                showToast({ tone: "error", title: "该时间不能用于排班", description: cause instanceof Error ? cause.message : "请选择存在的门店当地时间。" });
              }
              return;
            }
            const start = info.date;
            const end = new Date(start.getTime() + calendarClickDurationMinutes(settings?.slotIntervalMinutes ?? 30, settings?.minimumShiftMinutes ?? 0) * 60_000);
            if (settings && !calendarRangeWithinStoreHours(start, end, timezone, settings.openingTime, settings.closingTime)) {
              showToast({ tone: "error", title: "无法在此时间创建班次", description: "所选时间范围不符合门店营业时间，请选择其他时间。" });
              return;
            }
            openDraft({ date: storeParts(start, timezone).date, start, end });
          }}
          eventContent={(info) => {
            const group = info.event.extendedProps.shiftGroup;
            const unverifiedDraftRole = isCalendarShiftGroup(group)
              && group.sourceShifts.some((shift) => editablePeriodIds.has(shift.rosterPeriodId))
              && !roles.some((role) => role.id === group.role.id);
            const clockChangeRange = info.isMirror ? currentClockChangeSelection() : null;
            const upwardEnd = info.isMirror && info.event.start && info.event.end
              ? upwardTimeGridSelectionEnd(gridPointerStart.current, info.event.start, info.event.end, settings?.slotIntervalMinutes ?? 30, timezone) : null;
            const mirrorStart = clockChangeRange?.start ?? info.event.start;
            const mirrorEnd = clockChangeRange?.end ?? upwardEnd ?? info.event.end;
            const mirrorTimeText = (clockChangeRange || upwardEnd) && mirrorStart && mirrorEnd
              ? `${formatTime(mirrorStart, timezone)} - ${formatTime(mirrorEnd, timezone)}` : info.timeText;
            return <CalendarEventContent isMirror={info.isMirror} timeText={mirrorTimeText} viewType={info.view.type} shiftGroup={group} timezone={timezone} startAt={mirrorStart} endAt={mirrorEnd} unverifiedRole={unverifiedDraftRole} />;
          }}
        />
        {!loading && data && !data.shifts.length ? <div className="calendar-empty"><CalendarPlus className="h-5 w-5" /><span>{view === "dayGridMonth" ? "点击日期空白处创建第一个班次" : "拖选时间创建第一个班次"}</span></div> : null}
      </section>
      {scheduledSidebarOpen && editContextReady ? <CalendarScheduledSidebar storeId={storeId} initialDate={calendarDate ?? storeParts(new Date(), timezone).date}
        weekStartsOn={settings?.weekStartsOn ?? 1} timezone={timezone} currentEmployeeNames={currentEmployeeNames}
        employees={employees} jobs={jobs} verifiedRoles={roles}
        refreshKey={data} onClose={() => setScheduledSidebarOpen(false)} /> : null}
      </div>
      <div className="calendar-footer-actions">
        <details ref={moreActionsRef} className="calendar-more-actions calendar-more-actions--footer">
          <summary className="calendar-text-button" role="button" aria-label="排班操作" title="排班操作"><Ellipsis className="h-4 w-4" />排班操作</summary>
          <div className="calendar-more-actions-panel" aria-label="更多日历操作">
            <button type="button" disabled={!data || !editContextReady || loading || saving} onClick={() => {
              closeMoreActions();
              const focusedDate = storeParts(calendarRef.current?.getApi().getDate() ?? new Date(), timezone).date;
              createDateShift(focusedDate);
            }}><CalendarPlus className="h-4 w-4" />新增班次</button>
            <button type="button" disabled={loading || saving} onClick={() => { closeMoreActions(); void load(); void loadTemplates(); }}><RefreshCw className="h-4 w-4" />刷新排班</button>
            {view === "timeGridWeek" ? <button type="button" disabled={saving || !editContextReady} onClick={() => { closeMoreActions(); setEmployeeLanesPreference({ storeId, visible: !showEmployeeLanes }); }}>员工行{showEmployeeLanes ? " · 已开启" : ""}</button> : null}
            {!draftSession ? <button type="button" disabled={!data || !editContextReady || loading || saving || batchMode} onClick={() => { closeMoreActions(); startDraftSession(); }}>暂存模式</button> : null}
            <button type="button" disabled={!editContextReady || loading || saving || Boolean(draftSession)} onClick={() => { closeMoreActions(); setBatchMode((value) => !value); setSelectedShiftIds([]); setConfirmingBatchDelete(null); }}><CheckSquare2 className="h-4 w-4" />{batchMode ? "退出批量" : "批量操作"}</button>
            <div className="calendar-more-actions-divider" />
            <button type="button" disabled={!data || !editContextReady || loading || saving || Boolean(draftSession)} onClick={() => { closeMoreActions(); openCopyDay(); }}>复制一天</button>
            <button type="button" disabled={!data || !editContextReady || loading || saving || Boolean(draftSession)} onClick={() => { closeMoreActions(); void copyPreviousWeek(); }}>{settings?.cycleType === "FORTNIGHT" ? "复制上一双周" : "复制上一周"}</button>
          </div>
        </details>
        <button type="button" className="calendar-text-button" disabled={!editContextReady} aria-expanded={scheduledSidebarOpen && editContextReady}
          aria-controls={scheduledSidebarOpen && editContextReady ? "calendar-scheduled-sidebar" : undefined}
          onClick={() => {
            const opening = !scheduledSidebarOpen;
            setScheduledSidebarOpen(opening);
            if (opening) requestAnimationFrame(() => {
              const target = window.matchMedia("(max-width: 1199px)").matches
                ? calendarPageRef.current?.querySelector("#calendar-scheduled-sidebar")
                : calendarPageRef.current;
              target?.scrollIntoView({ block: "start", behavior: "auto" });
            });
          }}>{scheduledSidebarOpen ? "关闭工时侧栏" : "查看工时侧栏"}</button>
      </div>
      {summary ? <RosterSummary summary={summary} /> : null}
      {copyDayOpen ? <Dialog titleId="copy-day-title" onClose={() => { if (!saving) setCopyDayOpen(false); }} closeDisabled={saving} className="w-full max-w-lg rounded-[20px] bg-white p-6 shadow-lift">
        <h2 id="copy-day-title" className="text-xl font-semibold text-graphite-950">复制一天</h2>
        <p className="mt-2 text-sm text-graphite-600">选择来源和目标日期，系统会自动检查冲突；确认后复制班次。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-graphite-700">来源日期<input className="native-input mt-1.5" type="date" value={copyDaySource} onInput={(event) => changeCopyDaySource(event.currentTarget.value)} onChange={(event) => changeCopyDaySource(event.target.value)} /></label>
          <label className="text-sm font-semibold text-graphite-700">目标日期<input className="native-input mt-1.5" type="date" value={copyDayTarget} onInput={(event) => changeCopyDayTarget(event.currentTarget.value)} onChange={(event) => changeCopyDayTarget(event.target.value)} /></label>
        </div>
        {copyDayChecking ? <p className="mt-4 text-sm text-graphite-600" role="status">正在检查可复制班次…</p> : null}
        {copyDayPreviewError ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{copyDayPreviewError}</p> : null}
        {scopedCopyDayPreview ? <div className="mt-4">
          <p className="text-sm font-semibold text-graphite-800">可复制 {scopedCopyDayPreview.readyShifts}/{scopedCopyDayPreview.shiftCount} 个班次</p>
          {scopedCopyDayPreview.issues.length ? <CopyIssueList issues={scopedCopyDayPreview.issues} /> : <p className="mt-2 text-sm text-emerald-700">无冲突，可以复制。</p>}
        </div> : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" className="calendar-text-button" disabled={saving} onClick={() => setCopyDayOpen(false)}>取消</button><button type="button" className="calendar-text-button" disabled={saving || copyDayChecking || !copyDaySource || !copyDayTarget} onClick={() => void previewDayCopy()}>检查冲突</button><button type="button" className="calendar-primary-button" disabled={saving || copyDayChecking || !scopedCopyDayPreview?.canCopy || scopedCopyDayPreview.sourceDate !== copyDaySource || scopedCopyDayPreview.targetDate !== copyDayTarget} onClick={() => void confirmDayCopy()}>{saving ? "复制中…" : "复制班次"}</button></div>
      </Dialog> : null}
      {copyPreview ? <Dialog titleId="copy-preview-title" onClose={() => { if (!saving) setCopyPreview(null); }} closeDisabled={saving} className="w-full max-w-lg rounded-[20px] bg-white p-6 shadow-lift"><h2 id="copy-preview-title" className="text-xl font-semibold text-graphite-950">复制上一周期</h2><p className="mt-2 text-sm text-graphite-600">目标日期：{copyPreview.targetStartDate} · 可复制 {copyPreview.readyShifts}/{copyPreview.shiftCount} 个班次。复制后可继续编辑。</p>{copyPreview.issues.length ? <CopyIssueList issues={copyPreview.issues} /> : <p className="mt-4 text-sm text-emerald-700">无冲突，可以复制。</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" className="calendar-text-button" disabled={saving} onClick={() => setCopyPreview(null)}>取消</button><button type="button" className="calendar-primary-button" disabled={!copyPreview.canCopy || saving} onClick={() => void confirmCopyPeriod()}>{saving ? "复制中…" : "复制班次"}</button></div></Dialog> : null}
      {repeatSourceShift ? <RepeatShiftDialog source={repeatSourceShift} saving={saving} onClose={() => setRepeatSourceShift(null)} onPreview={previewRepeatShift} onConfirm={confirmRepeatShift} /> : null}
      {selectingGroup ? <GroupedShiftDialog group={selectingGroup} timezone={timezone} resolveAssignmentName={resolveDraftEmployeeName}
        actionLabel={selectingGroupAction === "repeat" ? "重复" : undefined}
        onClose={() => setSelectingGroup(null)} onChoose={(shift) => { setSelectingGroup(null); if (selectingGroupAction === "repeat") openRepeatShift(shift); else editShift(shift); }} /> : null}
      {draft ? <ShiftDialog key={editingShift?.id ?? (copyingShift ? `copy-${copyingShift.id}` : `${draft.date}-${draft.start.toISOString()}`)}
        draft={draft} existingShift={editingShift} copySourceShift={copyingShift} relatedShiftIds={editingGroup?.shiftIds} roles={roles} templates={usableTemplates}
        employees={employees} availability={dialogAvailabilityRows} existingShifts={copyingShift ? (copyTargetCalendarReady ? copyTargetCalendar!.shifts : []) : data?.shifts ?? []} workforceGeneratedAt={workforceGeneratedAt}
        saving={saving} saveLabel={draftSession ? "暂存班次" : "保存班次"} staleVersion={staleShift} snapshotUnavailable={!data || !editContextReady || loading || !dialogAvailabilityReady || draftSubmitUncertain || Boolean(copyingShift && !copyTargetCalendarReady)}
        snapshotUnavailableReason={!editContextReady ? "员工与岗位校验数据尚未加载，当前排班只读。" : draftSubmitUncertain ? "请先核对上一次统一提交的结果。" : copyingShift && !copyTargetCalendarReady
          ? copyTargetCalendarError ? `目标日期的班次无法确认：${copyTargetCalendarError}。请重试加载。` : "正在确认目标日期的班次数据，请稍候。"
          : data && !loading && !dialogAvailabilityReady ? dialogAvailabilityMessage : undefined}
        onRetryContext={dialogAvailabilityError || copyTargetCalendarError ? () => loadDialogContext(draft.date, Boolean(copyingShift)) : undefined}
        defaultBreakMinutes={settings?.defaultBreakMinutes ?? 0} minimumShiftMinutes={settings?.minimumShiftMinutes ?? 0}
        slotIntervalMinutes={settings?.slotIntervalMinutes ?? 30} timezone={timezone}
        onClose={() => { ++dialogRequestSequence.current; pendingCreateRequest.current = null; setDraft(null); setEditingShift(null); setEditingGroup(null); setCopyingShift(null); }}
        onSave={saveShift} onDelete={editingShift && data && editContextReady && !loading && !draftSubmitUncertain ? deleteShift : undefined}
        onCopy={editingShift && data && editContextReady && !loading && !draftSession ? () => copyShift(editingShift) : undefined}
        onRepeat={editingShift && data && editContextReady && !loading && !draftSession
          ? () => editingGroup ? chooseRepeatSource(editingGroup) : openRepeatShift(editingShift) : undefined}
        onCopyDateChange={changeCopyDate} /> : null}
    </div>
  );
}

function findPeriod(periods: RosterPeriod[], date: string) { return periods.find((period) => period.startDate <= date && period.endDate >= date); }
function calendarToolbarDate(view: CalendarView, range: { from: string; to: string } | null, fallback: string) {
  if (!range || view === "dayGridMonth") return fallback;
  const weekday = (date: string) => new Intl.DateTimeFormat("zh-CN", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const parts = (date: string) => date.split("-").map(Number);
  const [startYear, startMonth, startDay] = parts(range.from);
  if (view === "timeGridDay") return `${startYear}年${startMonth}月${startDay}日 · ${weekday(range.from)}`;
  const [endYear, endMonth, endDay] = parts(range.to);
  const endLabel = endYear === startYear ? `${endMonth}/${endDay}` : `${endYear}/${endMonth}/${endDay}`;
  return `${startYear}/${startMonth}/${startDay} ${weekday(range.from).replace("星期", "周")} – ${endLabel} ${weekday(range.to).replace("星期", "周")}`;
}
function calendarDuration(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`; }
function calendarError(cause: unknown, timezone = DEFAULT_STORE_TIMEZONE) {
  if (cause instanceof ApiRequestError && cause.status >= 500 && !cause.validation) return "服务器出现错误，保存结果尚未确认；请查看刷新后的日历再重试。";
  return cause instanceof ApiRequestError ? schedulingFeedback(cause.validation, cause.message, timezone) : cause instanceof Error ? cause.message : "请重试";
}
function isUncertainMutation(cause: unknown) { return cause instanceof ApiRequestError && (cause.status === 0 || cause.status >= 500); }
function AdminStoreRequired({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => Promise<void> }) { return <div className="mx-auto max-w-2xl rounded-2xl border border-brand-200 bg-white p-8 text-center shadow-panel"><CircleAlert className="mx-auto h-8 w-8 text-brand-700" /><h1 className="mt-4 text-xl font-semibold text-graphite-950">{loading ? "正在加载门店" : error ? "门店数据暂时无法加载" : "暂无可用门店"}</h1><p className="mt-2 text-sm leading-6 text-graphite-600">{loading ? "正在确认当前账号可访问的门店范围。" : error || "当前账号没有可排班的门店，请联系管理员确认门店权限。"}</p>{!loading && error ? <button type="button" className="calendar-primary-button mx-auto mt-5" onClick={() => void onRetry()}>重试加载门店</button> : null}</div>; }
function RosterSummary({ summary }: { summary: PeriodSummary }) {
  return <aside className="mt-5 rounded-2xl border border-graphite-200 bg-white p-5 shadow-panel">
    <p className="mb-3 text-xs font-semibold text-graphite-600">当前班表 · 可点击班次修改或删除 · 数据版本 {summary.period.version}</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="班次数" value={String(summary.shiftCount)} />
      <Metric label="员工班次" value={String(summary.assignmentCount)} />
      <Metric label="总净工时" value={`${summary.totalHours.toFixed(1)}h`} />
    </div>
  </aside>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-semibold text-graphite-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-graphite-950">{value}</p></div>; }
function CopyIssueList({ issues }: { issues: CopyPeriodPreview["issues"] }) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const issue of issues) {
    const label = `${issue.shiftDate} ${issue.employeeName === "—" ? "" : `${issue.employeeName}：`}${issue.reason}`;
    const item = counts.get(label);
    if (item) item.count += 1;
    else counts.set(label, { label, count: 1 });
  }
  return <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
    {[...counts.values()].map(({ label, count }) => <p key={label}>{label}{count > 1 ? `（${count} 项相同问题）` : ""}</p>)}
  </div>;
}

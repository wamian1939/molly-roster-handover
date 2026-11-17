from __future__ import annotations

import os
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from adapters.real import (SourceAccessError, SourceAuthError, SourceReadError,
                           _employees, _evaluate, _session_cookie, accessible_stores, load_snapshot,
                           read_roster_rule_hints)
from adapters.manual_breaks import (FixedBreakInputError, apply_fixed_break_intervals,
                                    unresolved_fixed_breaks)
from adapters.manual_leave import apply_reviewed_leave
from adapters.reference import (comparison_snapshot, observed_published_shifts,
                                published_shift_source_alignment)
from engine.clock import ClockError, timezone_for
from engine.config import compile_rules
from engine.models import FixedBreakInterval, PublishedShiftReference, RuleSet, SolveMode, TimeWindow
from engine.solver import ENGINE_VERSION, solve
from engine.v2 import V2Policy, _fully_exact_days, compile_coverage, solve_v2
from fixtures.demo import current_demo_rules, demo_snapshot
from .storage import RuleVersionConflict, get_run, latest_rules, recent_runs, rules_at_version, save_rules, save_run
from . import storage


app = FastAPI(title="Molly Scheduling Engine Lab", version="0.1.0")
UI_DIST = Path(__file__).resolve().parents[1] / "lab-ui" / "dist"


def _offset_change_dates(start: date, end: date, zone: ZoneInfo) -> set[date]:
    """Include both local dates around each timezone offset change in a rule's horizon."""
    changed: set[date] = set()
    previous_offset = None
    previous_day: date | None = None
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        current_offset = datetime.combine(day, time(12), tzinfo=zone).utcoffset()
        if previous_day is not None and current_offset != previous_offset:
            changed.update((previous_day, day))
        previous_offset = current_offset
        previous_day = day
    return changed


def source_http_error(error: SourceReadError) -> HTTPException:
    if isinstance(error, SourceAuthError):
        return HTTPException(401, str(error))
    if isinstance(error, SourceAccessError):
        return HTTPException(403, str(error))
    return HTTPException(503, str(error))


def require_store(store_id: str, cookie: str | None) -> None:
    if store_id != "hurstville" and os.getenv("SCHEDULING_LAB_TEST_MOCK") != "1":
        raise HTTPException(404, "Only the Hurstville test is available")
    if store_id.startswith("mock-"):
        return
    try:
        _session_cookie(cookie)
    except SourceReadError as error:
        raise source_http_error(error) from error
    try:
        permitted_stores = accessible_stores(cookie)
    except SourceReadError as error:
        raise source_http_error(error) from error
    if store_id not in {store["id"] for store in permitted_stores}:
        raise HTTPException(403, "Store is outside the signed-in account's access")


class SolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    store_id: str
    start_date: date
    end_date: date
    expected_rule_version: str | None = None
    expected_source_version: str | None = None
    mode: SolveMode = SolveMode.STRICT
    source: str = "REAL"
    run_purpose: Literal["REVIEWED", "EXPLORATORY"] = "REVIEWED"
    leave_data_complete: bool = False
    approved_leave: list[TimeWindow] = Field(default_factory=list)
    fixed_break_intervals: list[FixedBreakInterval] = Field(default_factory=list)
    replace_target_published_for_comparison: bool = False


def require_date_range(start_date: date, end_date: date) -> None:
    if (end_date - start_date).days not in range(14):
        raise HTTPException(422, "Date range must contain 1 to 14 days")


def source_store_timezone(rule_hints: dict, rules: RuleSet | None = None) -> str:
    settings = rule_hints.get("settings")
    name = settings.get("timezone") if isinstance(settings, dict) else None
    if not isinstance(name, str) or not name.strip():
        if settings is not None:
            raise SourceReadError("Roster store timezone setting is invalid; review it before reading real dates")
        if rules is None or rules.timezone_source != "LAB_CONFIRMED":
            raise SourceReadError("Roster store timezone is missing; 请在 Lab 中明确确认门店时区并保存规则，或先核对正式 Roster 设置")
        try:
            timezone_for(rules.timezone)
        except ClockError as error:
            raise SourceReadError(str(error)) from error
        return rules.timezone
    try:
        timezone_for(name)
    except ClockError as error:
        raise SourceReadError(str(error)) from error
    if rules is not None and rules.timezone_source != "ROSTER":
        raise SourceReadError("Roster now has a store timezone; review and save a ROSTER-sourced Lab rule before reading real dates")
    return name


@app.get("/api/health")
def health():
    return {"ok": True, "service": "scheduling-engine-lab", "engine_version": ENGINE_VERSION,
            "formal_roster_write": False}


@app.get("/api/stores")
def stores(cookie: str | None = Header(default=None)):
    try:
        _session_cookie(cookie)
    except SourceReadError as error:
        raise source_http_error(error) from error
    try:
        available = accessible_stores(cookie)
        return {"stores": available if os.getenv("SCHEDULING_LAB_TEST_MOCK") == "1" else
                [store for store in available if store["id"] == "hurstville"]}
    except SourceReadError as error:
        raise source_http_error(error) from error


@app.get("/api/rules/{store_id}")
def rules(store_id: str, cookie: str | None = Header(default=None)):
    require_store(store_id, cookie)
    current = latest_rules(store_id)
    if current is None:
        current = current_demo_rules(store_id)
        if not store_id.startswith("mock-"):
            current.version = "UNSAVED_EXAMPLE_REPLACE_RULES"
    if current.pattern_only:
        return current.current_payload()
    # Old saved versions remain available through the history endpoints. The
    # current editor must never receive their obsolete staffing or work limits.
    names = [pattern.name for pattern in current.base_day.patterns]
    draft = current.model_dump(mode="json")
    draft = {key: draft[key] for key in (
        "store_id", "timezone", "timezone_source", "version", "copied_from",
        "global_base_version", "slot_minutes",
        "employee_preferences", "weights", "solve_seconds", "random_seed")}
    draft["weights"].pop("excess_coverage", None)
    draft["base_day"] = {"patterns": [
        {**pattern.model_dump(mode="json"), "break_rule": {
            "count": pattern.break_rule.count,
            "duration_minutes": pattern.break_rule.duration_minutes,
            "paid": pattern.break_rule.paid,
        }} for pattern in current.base_day.patterns]}
    draft["weekly"] = {weekday: {"pattern_minimums": {
        name: (current.weekly.get(weekday).pattern_minimums or {}).get(name, 0)
        if current.weekly.get(weekday) else 0 for name in names}}
        for weekday in range(7)}
    draft["pattern_only"] = True
    draft["requires_save"] = True
    draft["migration_warnings"] = (["Old date-specific overrides are omitted; review all seven weekdays"]
        if current.dates else []) + (["Old weekday-specific pattern definitions are omitted; review pattern definitions"]
        if any(override.patterns is not None for override in current.weekly.values()) else [])
    return draft


@app.get("/api/rules/{store_id}/versions/{version}")
def historical_rules(store_id: str, version: int, cookie: str | None = Header(default=None)):
    require_store(store_id, cookie)
    if version < 1:
        raise HTTPException(422, "Rule version must be positive")
    historical = rules_at_version(store_id, version)
    if historical is None:
        raise HTTPException(404, "Rule version not found for this store")
    return historical.current_payload()


@app.post("/api/rules/{store_id}")
async def write_rules(store_id: str, payload: RuleSet, request: Request,
                cookie: str | None = Header(default=None),
                expected_rule_version: str | None = Header(default=None, alias="X-Expected-Rule-Version")):
    require_store(store_id, cookie)
    if payload.store_id != store_id:
        raise HTTPException(400, "Store mismatch")
    if any(weekday not in range(7) for weekday in payload.weekly):
        raise HTTPException(422, "Weekly override keys must be Monday=0 through Sunday=6")
    if not payload.pattern_only or payload.enforce_work_rest_limits:
        raise HTTPException(422, "Use weekday pattern rules; legacy numeric work/rest limits are not enabled")
    raw = await request.json()
    if any(key in raw for key in ("dates", "compliance", "employee_limits", "enforce_work_rest_limits",
                                   "valid_from", "valid_through")):
        raise HTTPException(422, "Date-specific staffing and work/rest rules are not part of the current scheduling contract")
    if "excess_coverage" in raw.get("weights", {}):
        raise HTTPException(422, "Legacy excess_coverage weight is unavailable; configure coverage bands in two-layer mode")
    if payload.dates or payload.employee_limits or payload.base_day.pattern_minimums or payload.base_day.demand or payload.base_day.opening_minimum or payload.base_day.opening_qualified_minimum:
        raise HTTPException(422, "Configure staffing only through the seven weekday shift-pattern counts"
                            if payload.requirement_mode == "PHASE_HEADCOUNT"
                            else "Configure staffing only through the seven weekday exact counts"
                            if payload.requirement_mode == "EXACT_SCHEDULED"
                            else "Configure pattern counts through the seven weekday rules")
    allowed_break_fields = ({"count", "duration_minutes", "paid", "granularity_minutes"}
                            if payload.requirement_mode in {"PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"}
                            else {"count", "duration_minutes", "paid"})
    if payload.base_day.model_fields_set != {"patterns"} or any(
        pattern.break_rule.model_fields_set - allowed_break_fields
        for pattern in payload.base_day.patterns
    ):
        raise HTTPException(422, "Only shift patterns and untimed break durations belong in the current daily rule")
    pattern_names = {pattern.name for pattern in payload.base_day.patterns}
    if payload.requirement_mode == "EXACT_SCHEDULED":
        if payload.weekly:
            raise HTTPException(422, "Exact scheduled staffing has one source: weekly_exact_staffing")
    elif set(payload.weekly) != set(range(7)) or any(
        override.model_fields_set != {"pattern_minimums"}
        or override.pattern_minimums is None
        or set(override.pattern_minimums) != pattern_names
        for override in payload.weekly.values()
    ):
        raise HTTPException(422, "Set every shift-pattern count explicitly for each weekday, Monday through Sunday")
    try:
        zone = timezone_for(payload.timezone)
        today = datetime.now(zone).date()
    except ClockError as error:
        raise HTTPException(422, str(error)) from error
    transition_start = today
    transition_end = today + timedelta(days=400)
    transition_dates = _offset_change_dates(transition_start, transition_end, zone)
    sample_dates = ({today + timedelta(days=offset) for offset in range(7)}
                     | set(payload.dates)
                     | {day - timedelta(days=1) for day in payload.dates}
                     | transition_dates)
    errors = [error for sample in sorted(sample_dates)
              for error in compile_rules(payload, sample, sample + timedelta(days=1))[1]]
    if errors:
        raise HTTPException(422, [error.model_dump(mode="json") for error in errors])
    if payload.requirement_mode in {"PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"}:
        staffing = (payload.weekly_exact_staffing if payload.requirement_mode == "EXACT_SCHEDULED"
                    else payload.weekly_coverage)
        if set(staffing) != set(range(7)):
            raise HTTPException(422, "Configure time-indexed coverage for all seven weekdays")
        coverage_errors = [error for sample in sorted(sample_dates)
            for error in compile_coverage(payload, sample, sample, V2Policy())[2]]
        if coverage_errors:
            raise HTTPException(422, [error.model_dump(mode="json") for error in coverage_errors])
    if not store_id.startswith("mock-"):
        try:
            store_timezone = source_store_timezone(read_roster_rule_hints(store_id), payload)
        except SourceReadError as error:
            raise source_http_error(error) from error
        if payload.timezone != store_timezone:
            raise HTTPException(422, f"Rule timezone {payload.timezone} differs from Roster store timezone {store_timezone}")
        try:
            jobs = _evaluate(f"/store-jobs?storeId={store_id}", _session_cookie(cookie))
        except SourceReadError as error:
            raise source_http_error(error) from error
        active = {job["id"] for job in jobs if job["isActive"]}
        referenced_roles: set[str] = set()
        for sample in sorted(sample_dates):
            day = payload.for_date(sample)
            referenced_roles.update(pattern.role_code for pattern in day.patterns)
        bad_roles = referenced_roles - active
        if bad_roles:
            raise HTTPException(422, f"Shift patterns use unknown formal job IDs: {sorted(bad_roles)}")
    try:
        return save_rules(payload, expected_rule_version).current_payload()
    except RuleVersionConflict as error:
        raise HTTPException(409, str(error)) from error


@app.get("/api/store-jobs/{store_id}")
def store_jobs(store_id: str, cookie: str | None = Header(default=None)):
    require_store(store_id, cookie)
    if store_id.startswith("mock-"):
        return [{"id": "service", "name": "服务", "code": "service", "colorToken": "rose", "isActive": True}]
    try:
        return _evaluate(f"/store-jobs?storeId={store_id}", _session_cookie(cookie))
    except SourceReadError as error:
        raise source_http_error(error) from error


@app.get("/api/employee-rule-targets/{store_id}")
def employee_rule_targets(store_id: str, cookie: str | None = Header(default=None)):
    require_store(store_id, cookie)
    if store_id.startswith("mock-"):
        employees = demo_snapshot(date.today(), store_id).employees
    else:
        try:
            employees, _revision = _employees(store_id, _session_cookie(cookie))
        except SourceReadError as error:
            raise source_http_error(error) from error
    return [{"id": person.id, "name": person.name, "employment_type": person.employment_type}
            for person in employees]


@app.get("/api/source-preview/{store_id}")
def source_preview(store_id: str, start_date: date, end_date: date,
                   cookie: str | None = Header(default=None)):
    if store_id.startswith("mock-"):
        raise HTTPException(422, "A mock store cannot be used as a real data source")
    require_store(store_id, cookie)
    require_date_range(start_date, end_date)
    try:
        rule_hints = read_roster_rule_hints(store_id)
        # A source preview after rules are saved must read the same surrounding
        # shifts as solve, including any longer personal rest requirement.
        saved_rules = latest_rules(store_id) if storage.DATA_FILE.is_file() else None
        store_timezone = source_store_timezone(rule_hints, saved_rules)
        if saved_rules is not None and saved_rules.timezone != store_timezone:
            raise SourceReadError("Saved Lab rule timezone differs from the Roster store timezone; review the rule")
        snapshot_args = (store_id, start_date, end_date, cookie, store_timezone, 0)
        snapshot = (load_snapshot(*snapshot_args, timezone_source="LAB_CONFIRMED")
                    if saved_rules is not None and saved_rules.timezone_source == "LAB_CONFIRMED"
                    else load_snapshot(*snapshot_args))
    except SourceReadError as error:
        raise source_http_error(error) from error
    return {"store_id": store_id, "timezone": store_timezone,
            "timezone_source": saved_rules.timezone_source if saved_rules else "ROSTER",
            "snapshot_version": snapshot.version,
            "employees": len(snapshot.employees), "availability_windows": len(snapshot.availability),
            "existing_shift_assignments": len(snapshot.existing_shifts),
            "observed_published_shifts": observed_published_shifts(snapshot, start_date, end_date),
            "published_shift_source_alignment": published_shift_source_alignment(snapshot, start_date, end_date),
            "unresolved_fixed_breaks": unresolved_fixed_breaks(snapshot, start_date, end_date),
            "rule_hints": rule_hints,
            "approved_leave_source_available": False, "formal_roster_write": False}


@app.post("/api/solve")
def run(payload: SolveRequest, cookie: str | None = Header(default=None)):
    if payload.source == "MOCK" and os.getenv("SCHEDULING_LAB_TEST_MOCK") != "1":
        raise HTTPException(422, "Only the Hurstville real-data test is available")
    if payload.run_purpose == "EXPLORATORY" and payload.source != "REAL":
        raise HTTPException(422, "Exploratory scheduling requires a real read-only source")
    if payload.run_purpose == "EXPLORATORY" and not payload.replace_target_published_for_comparison:
        raise HTTPException(422, "Exploratory scheduling must exclude target-date published shifts in a Lab-only comparison copy")
    if payload.run_purpose == "EXPLORATORY" and payload.approved_leave and not payload.leave_data_complete:
        raise HTTPException(422, "Unreviewed leave intervals cannot be labelled as a complete approved-leave review")
    if payload.source == "REAL" and payload.store_id.startswith("mock-"):
        raise HTTPException(422, "A mock store cannot be used as a real data source")
    if payload.replace_target_published_for_comparison and payload.source != "REAL":
        raise HTTPException(422, "Published-shift comparison requires a real source")
    if payload.replace_target_published_for_comparison and payload.fixed_break_intervals:
        raise HTTPException(422, "Reviewed fixed breaks cannot target shifts excluded from comparison")
    require_store(payload.store_id, cookie)
    require_date_range(payload.start_date, payload.end_date)
    rules = latest_rules(payload.store_id)
    if rules is None:
        raise HTTPException(400, "Save a store rule version before solving")
    if not rules.pattern_only or rules.enforce_work_rest_limits:
        raise HTTPException(422, "Save a seven-day shift-pattern count rule before solving")
    if payload.expected_rule_version is not None and rules.version != payload.expected_rule_version:
        raise HTTPException(409, f"Rule version changed: expected {payload.expected_rule_version}, current {rules.version}; reload rules before solving")
    days = {payload.start_date + timedelta(days=offset)
            for offset in range((payload.end_date - payload.start_date).days + 1)}
    if ((rules.requirement_mode == "EXACT_SCHEDULED"
         or rules.requirement_mode == "PATTERN_AND_COVERAGE"
         and days <= _fully_exact_days(rules, days))
        and payload.run_purpose != "EXPLORATORY"):
        raise HTTPException(422, "Exact Staffing requires the read-only V2 comparison solver; reviewed solving is not supported")
    published_reference: list[PublishedShiftReference] = []
    comparison_removed = 0
    if payload.source == "REAL":
        if payload.run_purpose == "REVIEWED" and not payload.leave_data_complete:
            raise HTTPException(422, "Reviewed real scheduling requires confirmed approved leave")
        if not payload.expected_rule_version:
            raise HTTPException(422, "Real scheduling requires the reviewed rule version")
        if not payload.expected_source_version:
            raise HTTPException(422, "Preview the current real source before scheduling")
        try:
            store_timezone = source_store_timezone(read_roster_rule_hints(payload.store_id), rules)
            if rules.timezone != store_timezone:
                raise HTTPException(422, f"Saved rule timezone {rules.timezone} differs from Roster store timezone {store_timezone}")
            snapshot_args = (payload.store_id, payload.start_date, payload.end_date, cookie,
                             rules.timezone, 0)
            snapshot = (load_snapshot(*snapshot_args, timezone_source="LAB_CONFIRMED")
                        if rules.timezone_source == "LAB_CONFIRMED" else load_snapshot(*snapshot_args))
        except SourceReadError as error:
            raise source_http_error(error) from error
        if snapshot.version != payload.expected_source_version:
            raise HTTPException(409, "Real source changed since preview; review the current source before scheduling")
        employee_ids = {employee.id for employee in snapshot.employees}
        unknown_leave_employees = {leave.employee_id for leave in payload.approved_leave
                                   if leave.employee_id not in employee_ids}
        if unknown_leave_employees:
            raise HTTPException(422, f"Approved leave refers to employees outside this store snapshot: {sorted(unknown_leave_employees)}")
        published_reference = [PublishedShiftReference.model_validate(item)
                               for item in observed_published_shifts(snapshot, payload.start_date, payload.end_date)]
        if payload.replace_target_published_for_comparison:
            snapshot, comparison_removed = comparison_snapshot(snapshot, payload.start_date, payload.end_date)
        else:
            try:
                snapshot = apply_fixed_break_intervals(snapshot, payload.fixed_break_intervals,
                                                       payload.start_date, payload.end_date)
            except FixedBreakInputError as error:
                raise HTTPException(422, str(error)) from error
        snapshot = snapshot.model_copy(update={
            "run_purpose": payload.run_purpose,
            "leave_data_complete": payload.leave_data_complete,
        })
        if payload.leave_data_complete:
            snapshot = apply_reviewed_leave(snapshot, payload.approved_leave)
    elif payload.source == "MOCK":
        if payload.fixed_break_intervals:
            raise HTTPException(422, "Reviewed fixed break intervals apply only to real source shifts")
        span = (payload.end_date - payload.start_date).days + 1
        snapshot = demo_snapshot(payload.start_date, payload.store_id, rules.timezone,
                                 count=16 if span > 1 else 11, days=span)
    else:
        raise HTTPException(400, "source must be MOCK or REAL")
    if payload.source == "REAL" and payload.run_purpose == "EXPLORATORY":
        # Lab-only comparison: preserve the saved seven-day rule and source
        # snapshot, but let complete legal shifts compete on time coverage.
        result = solve_v2(snapshot, rules, payload.start_date, payload.end_date,
            payload.mode, V2Policy(
                official_score_weight=rules.weights.skill,
                fairness_weight=rules.weights.fairness,
                labor_cost_weight=rules.weights.labor_cost,
                net_work_slot_weight=rules.weights.unnecessary_work,
                solve_seconds=rules.solve_seconds,
            ))
        result.parameters["approved_leave_review"] = (
            "MANUAL_CONFIRMED" if snapshot.leave_data_complete else "UNKNOWN")
    else:
        result = solve(snapshot, rules, payload.start_date, payload.end_date, payload.mode)
    result.published_reference = published_reference
    result.parameters["reviewed_fixed_breaks"] = len(payload.fixed_break_intervals)
    result.parameters["comparison_mode"] = "REPLACE_TARGET_PUBLISHED" if payload.replace_target_published_for_comparison else "PRESERVE_PUBLISHED"
    result.parameters["comparison_removed_assignments"] = comparison_removed
    if payload.replace_target_published_for_comparison:
        # The result omits published target shifts only in a detached Lab copy.
        # Its reviewed inputs do not make it safe to apply to the live roster.
        result.parameters["acceptance_gate"] = "NOT_ELIGIBLE"
    result.parameters["run_purpose"] = payload.run_purpose
    if payload.source == "REAL":
        result.parameters["timezone_source"] = rules.timezone_source
        result.parameters["approved_leave_intervals"] = len(payload.approved_leave)
    save_run(result)
    return result


@app.get("/api/runs/{store_id}")
def runs(store_id: str, cookie: str | None = Header(default=None)):
    require_store(store_id, cookie)
    return {"runs": recent_runs(store_id)}


@app.get("/api/run/{run_id}")
def run_detail(run_id: str, cookie: str | None = Header(default=None)):
    result = get_run(run_id)
    if result is None:
        raise HTTPException(404, "Run not found")
    require_store(result.store_id, cookie)
    return result


@app.get("/api/run/{run_id}/rules")
def run_rules(run_id: str, cookie: str | None = Header(default=None)):
    result = get_run(run_id)
    if result is None:
        raise HTTPException(404, "Run not found")
    require_store(result.store_id, cookie)
    prefix = f"{result.store_id}:v"
    suffix = result.rule_version[len(prefix):] if result.rule_version.startswith(prefix) else ""
    if not suffix.isdecimal() or int(suffix) < 1:
        raise HTTPException(404, "Run has no saved rule version")
    historical = rules_at_version(result.store_id, int(suffix))
    if historical is None or historical.version != result.rule_version:
        raise HTTPException(404, "Saved rule version for this run was not found")
    return historical.current_payload()


if UI_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=UI_DIST / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(UI_DIST / "index.html")

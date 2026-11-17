from __future__ import annotations

from datetime import date as CalendarDate, datetime, timezone
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RuleInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SolveMode(StrEnum):
    STRICT = "STRICT"
    BEST_EFFORT = "BEST_EFFORT"


class SolveStatus(StrEnum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE = "FEASIBLE"
    INFEASIBLE = "INFEASIBLE"
    UNKNOWN = "UNKNOWN"
    CONFIG_ERROR = "CONFIG_ERROR"
    DATA_ERROR = "DATA_ERROR"


class StaffMember(BaseModel):
    id: str
    name: str
    store_id: str
    employment_type: str | None = None
    qualified_roles: set[str] = Field(default_factory=set)
    skill_codes: set[str] = Field(default_factory=set)
    opening_qualified: bool = False
    score: float | None = Field(default=None, ge=0, le=100)
    desired_minutes: int | None = Field(default=None, ge=0)
    hourly_cost_cents: int | None = Field(default=None, ge=0)


class TimeWindow(BaseModel):
    employee_id: str
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def check(self) -> "TimeWindow":
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("time windows require aware datetimes with end after start")
        self.start = self.start.astimezone(timezone.utc)
        self.end = self.end.astimezone(timezone.utc)
        if self.end <= self.start:
            raise ValueError("time windows require aware datetimes with end after start")
        return self


class ExistingShift(TimeWindow):
    source_shift_id: str | None = None
    store_id: str
    role_code: str | None = None
    status: Literal["DRAFT", "PUBLISHED", "LOCKED"] = "DRAFT"
    break_start: datetime | None = None
    break_end: datetime | None = None
    break_minutes_unknown: int = Field(default=0, ge=0)
    paid_break: bool = False

    @model_validator(mode="after")
    def normalize_recorded_break(self) -> "ExistingShift":
        for field in ("break_start", "break_end"):
            value = getattr(self, field)
            if value is not None:
                if value.tzinfo is None:
                    raise ValueError("recorded breaks require aware datetimes")
                setattr(self, field, value.astimezone(timezone.utc))
        return self


class FixedBreakInterval(BaseModel):
    source_shift_id: str = Field(min_length=1)
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def check(self) -> "FixedBreakInterval":
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError("fixed breaks require aware datetimes with end after start")
        self.start = self.start.astimezone(timezone.utc)
        self.end = self.end.astimezone(timezone.utc)
        if self.end <= self.start:
            raise ValueError("fixed breaks require aware datetimes with end after start")
        return self


class Snapshot(BaseModel):
    store_id: str
    timezone: str
    generated_at: datetime
    version: str
    comparison_mode: Literal["PRESERVE_PUBLISHED", "REPLACE_TARGET_PUBLISHED"] = "PRESERVE_PUBLISHED"
    employees: list[StaffMember]
    # Current Roster shift-role skill requirements, keyed by Evaluate formal job ID.
    role_required_skills: dict[str, set[str]] = Field(default_factory=dict)
    availability: list[TimeWindow]
    approved_leave: list[TimeWindow] = Field(default_factory=list)
    existing_shifts: list[ExistingShift] = Field(default_factory=list)
    source: Literal["MOCK", "REAL"]
    run_purpose: Literal["REVIEWED", "EXPLORATORY"] = "REVIEWED"
    leave_data_complete: bool = False
    compliance_policy_confirmed: bool = False
    staffing_rules_confirmed: bool = False


class DemandSegment(RuleInput):
    start: str
    start_next_day: bool = False
    end: str
    end_next_day: bool = False
    minimum: int = Field(ge=0)
    role_minimums: dict[str, int] = Field(default_factory=dict)


class PatternBound(RuleInput):
    # None inherits the saved weekday pattern_minimums count.
    minimum: int | None = Field(default=None, ge=0)
    maximum: int | None = Field(default=None, ge=0)
    exact: int | None = Field(default=None, ge=0)
    allow_extra: bool = True

    @model_validator(mode="after")
    def consistent(self) -> "PatternBound":
        if self.exact is not None and ((self.minimum is not None and self.minimum > self.exact)
                                       or (self.maximum is not None and self.maximum < self.exact)):
            raise ValueError("Exact pattern count conflicts with its bounds")
        if self.minimum is not None and self.maximum is not None and self.minimum > self.maximum:
            raise ValueError("Pattern minimum exceeds maximum")
        return self


class StaffingBand(RuleInput):
    start: str
    end: str
    min_staff: int = Field(ge=0)
    target_staff: int = Field(ge=0)
    max_staff: int | None = Field(default=None, ge=0)
    role_minimums: dict[str, int] = Field(default_factory=dict)

    @model_validator(mode="after")
    def consistent(self) -> "StaffingBand":
        if self.target_staff < self.min_staff:
            raise ValueError("Coverage target cannot be below minimum")
        if self.max_staff is not None and self.max_staff < self.min_staff:
            raise ValueError("Coverage maximum cannot be below minimum")
        if self.max_staff is not None and self.target_staff > self.max_staff:
            raise ValueError("Coverage target cannot exceed hard maximum")
        if any(value < 0 for value in self.role_minimums.values()):
            raise ValueError("Role minimum cannot be negative")
        if sum(self.role_minimums.values()) > self.min_staff:
            raise ValueError("Role minimums cannot exceed total minimum")
        return self


class ExactStaffingBand(RuleInput):
    start: str
    end: str
    staff: int = Field(ge=0)


class BreakRule(RuleInput):
    count: int = Field(default=0, ge=0, le=2)
    duration_minutes: int = Field(default=30, ge=5, le=120)
    # A short paid rest break may need a finer grid than staffing demand.
    granularity_minutes: int | None = Field(default=None, ge=5, le=60)
    earliest: str = "11:00"
    latest_end: str = "19:00"
    earliest_next_day: bool = False
    latest_end_next_day: bool = False
    # One slot reproduces historical Lab rules saved before these were explicit.
    minimum_work_before_break_slots: int = Field(default=1, ge=0)
    minimum_work_after_break_slots: int = Field(default=1, ge=0)
    minimum_work_between_breaks_slots: int = Field(default=1, ge=0)
    paid: bool = False


class ShiftPattern(RuleInput):
    name: str
    role_code: str
    starts: list[str] = Field(min_length=1)
    ends: list[str] = Field(min_length=1)
    end_next_day: bool = False
    preferred: bool = False
    allow_early_late_start: bool = False
    break_rule: BreakRule = Field(default_factory=BreakRule)


class DayRules(RuleInput):
    # Legacy fields remain readable for historical rule versions. Current
    # pattern-only versions supply only the shared pattern definitions here.
    prep_start: str = "00:00"
    opening_time: str = "00:00"
    closing_time: str = "00:00"
    closing_next_day: bool = False
    work_end: str = "00:00"
    work_end_next_day: bool = False
    opening_minimum: int = Field(default=0, ge=0)
    opening_qualified_minimum: int = Field(default=0, ge=0)
    pattern_minimums: dict[str, int] = Field(default_factory=dict)
    demand: list[DemandSegment] = Field(default_factory=list)
    patterns: list[ShiftPattern]


class DayOverride(RuleInput):
    prep_start: str | None = None
    opening_time: str | None = None
    closing_time: str | None = None
    closing_next_day: bool | None = None
    work_end: str | None = None
    work_end_next_day: bool | None = None
    opening_minimum: int | None = Field(default=None, ge=0)
    opening_qualified_minimum: int | None = Field(default=None, ge=0)
    pattern_minimums: dict[str, int] | None = None
    demand: list[DemandSegment] | None = None
    patterns: list[ShiftPattern] | None = None


class ComplianceRules(RuleInput):
    minimum_shift_minutes: int = Field(default=180, ge=15)
    maximum_shift_minutes: int = Field(default=720, ge=15)
    maximum_daily_work_minutes: int = Field(default=720, ge=15)
    maximum_weekly_work_minutes: int = Field(default=2280, ge=15)
    minimum_rest_minutes: int = Field(default=600, ge=0)
    maximum_shifts_per_day: int = Field(default=1, ge=1, le=2)
    required_break_after_minutes: int = Field(default=300, ge=0)


class EmployeeLimits(RuleInput):
    maximum_daily_work_minutes: int | None = Field(default=None, ge=15)
    maximum_weekly_work_minutes: int | None = Field(default=None, ge=15)
    minimum_rest_minutes: int | None = Field(default=None, ge=0)
    maximum_shifts_per_day: int | None = Field(default=None, ge=1, le=2)


class EmployeePreferences(RuleInput):
    desired_weekly_minutes: int | None = Field(default=None, ge=0)
    hourly_cost_cents: int | None = Field(default=None, ge=0)


class OptimizationWeights(RuleInput):
    skill: int = Field(default=2, ge=0, le=1000)
    fairness: int = Field(default=1, ge=0, le=1000)
    excess_coverage: int = Field(default=8, ge=0, le=1000)
    regular_pattern: int = Field(default=15, ge=0, le=1000)
    early_late_start: int = Field(default=20, ge=0, le=1000)
    stability: int = Field(default=20, ge=0, le=1000)
    labor_cost: int = Field(default=0, ge=0, le=1000)
    unnecessary_work: int = Field(default=10, ge=0, le=1000)


class RuleSet(RuleInput):
    store_id: str
    timezone: str
    timezone_source: Literal["ROSTER", "LAB_CONFIRMED"] = "ROSTER"
    version: str = "unsaved"
    copied_from: str | None = None
    global_base_version: str | None = None
    valid_from: CalendarDate | None = None
    valid_through: CalendarDate | None = None
    slot_minutes: Literal[15, 30, 60] = 30
    base_day: DayRules
    weekly: dict[int, DayOverride] = Field(default_factory=dict)
    dates: dict[CalendarDate, DayOverride] = Field(default_factory=dict)
    # Current Lab rules only target the number of each complete pattern per
    # weekday. Legacy versions retain opening and slot-demand semantics.
    pattern_only: bool = False
    # Opt-in two-layer contract. Older saved rules retain their original
    # phase-headcount interpretation without migration or database writes.
    requirement_mode: Literal["PHASE_HEADCOUNT", "PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"] = "PHASE_HEADCOUNT"
    minimum_complete_shift_minutes: int | None = Field(default=None, ge=15)
    weekly_coverage: dict[int, list[StaffingBand]] = Field(default_factory=dict)
    weekly_exact_staffing: dict[int, list[ExactStaffingBand]] = Field(default_factory=dict)
    weekly_pattern_bounds: dict[int, dict[str, PatternBound]] = Field(default_factory=dict)
    # Legacy numeric work/rest caps remain readable for historical runs. New
    # Lab form saves turn them off while keeping shift overlap and availability
    # checks as structural scheduling constraints.
    enforce_work_rest_limits: bool = True
    compliance: ComplianceRules = Field(default_factory=ComplianceRules)
    employee_limits: dict[str, EmployeeLimits] = Field(default_factory=dict)
    employee_preferences: dict[str, EmployeePreferences] = Field(default_factory=dict)
    weights: OptimizationWeights = Field(default_factory=OptimizationWeights)
    # Zero explicitly disables the CP-SAT wall-clock limit for this rule version.
    solve_seconds: int = Field(default=15, ge=0, le=120)
    random_seed: int = 17

    @model_validator(mode="before")
    @classmethod
    def pattern_only_defaults(cls, value):
        if isinstance(value, dict) and value.get("pattern_only") and "enforce_work_rest_limits" not in value:
            return {**value, "enforce_work_rest_limits": False}
        return value

    @model_validator(mode="after")
    def employee_limits_only_tighten(self) -> "RuleSet":
        if any(weekday not in range(7) for weekday in (*self.weekly_coverage,
                                                      *self.weekly_exact_staffing,
                                                      *self.weekly_pattern_bounds)):
            raise ValueError("Coverage and pattern bounds use Monday=0 through Sunday=6")
        if self.requirement_mode == "PHASE_HEADCOUNT" and (self.weekly_coverage or self.weekly_pattern_bounds or self.weekly_exact_staffing):
            raise ValueError("Two-layer requirements need PATTERN_AND_COVERAGE mode")
        if self.requirement_mode == "PHASE_HEADCOUNT" and self.minimum_complete_shift_minutes is not None:
            raise ValueError("Minimum complete shift duration needs PATTERN_AND_COVERAGE mode")
        if self.requirement_mode in {"PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"} and not self.pattern_only:
            raise ValueError("Two-layer requirements need pattern_only shift definitions")
        if self.requirement_mode == "EXACT_SCHEDULED" and (self.weekly or self.weekly_coverage or self.weekly_pattern_bounds):
            raise ValueError("Exact scheduled staffing uses only weekly_exact_staffing")
        if self.requirement_mode != "EXACT_SCHEDULED" and self.weekly_exact_staffing:
            raise ValueError("weekly_exact_staffing needs EXACT_SCHEDULED mode")
        if self.pattern_only and (self.enforce_work_rest_limits or self.employee_limits or self.dates):
            raise ValueError("Pattern-only rules cannot include numeric work/rest limits or date overrides")
        for employee_id, limits in self.employee_limits.items():
            if not employee_id.strip():
                raise ValueError("Employee limit keys require a nonempty employee ID")
            if not self.enforce_work_rest_limits:
                continue
            if (limits.maximum_daily_work_minutes is not None and
                limits.maximum_daily_work_minutes > self.compliance.maximum_daily_work_minutes):
                raise ValueError("Employee daily work limit cannot exceed the store limit")
            if (limits.maximum_weekly_work_minutes is not None and
                limits.maximum_weekly_work_minutes > self.compliance.maximum_weekly_work_minutes):
                raise ValueError("Employee weekly work limit cannot exceed the store limit")
            if (limits.minimum_rest_minutes is not None and
                limits.minimum_rest_minutes < self.compliance.minimum_rest_minutes):
                raise ValueError("Employee minimum rest cannot be shorter than the store minimum")
            if (limits.maximum_shifts_per_day is not None and
                limits.maximum_shifts_per_day > self.compliance.maximum_shifts_per_day):
                raise ValueError("Employee daily shift count cannot exceed the store maximum")
        if any(not employee_id.strip() for employee_id in self.employee_preferences):
            raise ValueError("Employee preference keys require a nonempty employee ID")
        return self

    def compliance_for(self, employee_id: str) -> ComplianceRules:
        limits = self.employee_limits.get(employee_id)
        if limits is None:
            return self.compliance
        values = {key: value for key, value in limits.model_dump().items() if value is not None}
        return self.compliance.model_copy(update=values)

    def for_date(self, day: CalendarDate) -> DayRules:
        value = self.base_day.model_dump()
        for layer in (self.weekly.get(day.weekday()), self.dates.get(day)):
            if layer:
                value.update(layer.model_dump(exclude_none=True))
        return DayRules.model_validate(value)

    def current_payload(self) -> dict:
        """Current Lab contract omits obsolete staffing and work/rest inputs."""
        value = self.model_dump(mode="json")
        if not self.pattern_only:
            return value
        for key in ("dates", "compliance", "employee_limits", "enforce_work_rest_limits",
                    "valid_from", "valid_through"):
            value.pop(key, None)
        value["base_day"] = {"patterns": value["base_day"]["patterns"]}
        value["weekly"] = {weekday: {"pattern_minimums": override.pattern_minimums}
                           for weekday, override in self.weekly.items()}
        value["weights"].pop("excess_coverage", None)
        if self.requirement_mode == "PHASE_HEADCOUNT":
            for key in ("requirement_mode", "weekly_coverage", "weekly_pattern_bounds",
                        "weekly_exact_staffing", "minimum_complete_shift_minutes"):
                value.pop(key, None)
        elif self.requirement_mode == "EXACT_SCHEDULED":
            value.pop("weekly", None)
            value.pop("weekly_coverage", None)
            value.pop("weekly_pattern_bounds", None)
        for pattern in value["base_day"]["patterns"]:
            pattern["break_rule"] = {key: pattern["break_rule"][key]
                                     for key in ("count", "duration_minutes", "paid", "granularity_minutes")
                                     if key != "granularity_minutes"
                                     or pattern["break_rule"][key] is not None}
        return value


class Candidate(BaseModel):
    id: str
    employee_id: str
    date: CalendarDate
    pattern_name: str
    role_code: str
    start: datetime
    end: datetime
    preferred: bool
    early_late_start: bool
    break_options: list[list[tuple[datetime, datetime]]]
    paid_break: bool = False
    matched_existing: bool = False
    stable_break_options: list[int] = Field(default_factory=list)


class AssignedShift(BaseModel):
    employee_id: str
    employee_name: str
    store_id: str
    date: CalendarDate
    pattern_name: str
    role_code: str
    start: datetime
    end: datetime
    breaks: list[tuple[datetime, datetime]] = Field(default_factory=list)
    paid_break: bool = False
    net_work_minutes: int
    fixed: bool = False
    break_time_inferred: bool | None = None
    reasons: list[str] = Field(default_factory=list)


class CoverageSlot(BaseModel):
    date: CalendarDate | None = None
    start: datetime
    end: datetime
    required: int
    scheduled: int
    on_break: int
    effective: int
    excess: int
    gap: int
    effective_gap: int = 0
    target_staff: int | None = None
    max_staff: int | None = None
    target_shortfall: int = 0
    target_excess: int = 0
    role_required: dict[str, int] = Field(default_factory=dict)
    role_effective: dict[str, int] = Field(default_factory=dict)


class PublishedShiftReference(BaseModel):
    date: CalendarDate
    start: str
    end: str
    start_instant: datetime
    end_instant: datetime
    end_next_day: bool
    role_code: str | None
    break_minutes: int = Field(ge=0)
    assigned_people: int = Field(ge=1)


class Diagnostic(BaseModel):
    code: str
    message: str
    certainty: Literal["PROVEN", "LIKELY", "CONFIG"]
    date: CalendarDate | None = None
    start: datetime | None = None
    end: datetime | None = None


class ScoreAllocation(BaseModel):
    employee_id: str
    employee_name: str
    official_score: float | None = None
    candidate_shifts: int = Field(default=0, ge=0)
    credited_demand_minutes: int | None = Field(default=None, ge=0)
    credited_quality_points: int | None = Field(default=None, ge=0)


class RunResult(BaseModel):
    run_id: str
    engine_version: str
    store_id: str
    timezone: str
    start_date: CalendarDate
    end_date: CalendarDate
    source: Literal["MOCK", "REAL"]
    run_purpose: Literal["REVIEWED", "EXPLORATORY"] = "REVIEWED"
    snapshot_version: str
    rule_version: str
    mode: SolveMode
    status: SolveStatus
    elapsed_ms: int
    objective_score: int | None = None
    optimality_gap: float | None = None
    assignments: list[AssignedShift] = Field(default_factory=list)
    score_allocation: list[ScoreAllocation] = Field(default_factory=list)
    coverage: list[CoverageSlot] = Field(default_factory=list)
    published_reference: list[PublishedShiftReference] = Field(default_factory=list)
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    validation_errors: list[str] = Field(default_factory=list)
    parameters: dict[str, int | str] = Field(default_factory=dict)

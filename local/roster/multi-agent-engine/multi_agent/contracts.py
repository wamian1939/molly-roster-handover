from __future__ import annotations

from datetime import date as CalendarDate, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class RatingTargetBand(Contract):
    minimum_score: float = Field(ge=0,le=100)
    fraction: float = Field(ge=0,le=1)


class RatingHoursPolicy(Contract):
    highest_score_fraction: float = Field(default=0.8,ge=0,le=1)
    bands: list[RatingTargetBand] = Field(min_length=1)
    target_weight: float = Field(default=1,ge=0,le=100)

    @model_validator(mode='after')
    def coherent_bands(self):
        scores=[b.minimum_score for b in self.bands]
        if len(set(scores))!=len(scores) or scores!=sorted(scores,reverse=True) or scores[-1]!=0:
            raise ValueError('Rating bands must have unique descending minimum scores and end at 0')
        fractions=[b.fraction for b in self.bands]
        if fractions!=sorted(fractions,reverse=True) or max(fractions)>self.highest_score_fraction:
            raise ValueError('Fractions must decrease with score and never exceed the highest-score fraction')
        return self


class MandatoryEmployeeCoverage(Contract):
    employee_id: str = Field(min_length=1)
    weekdays: list[int] = Field(min_length=1)
    start: str
    end: str
    label: str

    @model_validator(mode='after')
    def valid_intervals(self):
        from datetime import time
        if any(d not in range(7) for d in self.weekdays) or len(set(self.weekdays))!=len(self.weekdays):
            raise ValueError('Mandatory weekdays must be unique Monday=0 through Sunday=6')
        left,right=time.fromisoformat(self.start),time.fromisoformat(self.end)
        if right<=left or any(t.tzinfo or t.minute%30 or t.second or t.microsecond for t in (left,right)):
            raise ValueError('Mandatory coverage requires aligned same-day half-hour clock intervals')
        return self


class BusinessRuleSet(Contract):
    version: str = Field(min_length=1)
    store_id: str = Field(min_length=1)
    base_rule_version: str = Field(min_length=1)
    rating_hours: RatingHoursPolicy | None = None
    mandatory_coverage: list[MandatoryEmployeeCoverage] = Field(default_factory=list)


class Policy(Contract):
    max_repairs: int = Field(default=5, ge=0, le=10)
    rating_weight: float = Field(default=2, ge=0, le=100)
    fairness_weight: float = Field(default=1, ge=0, le=100)
    preference_weight: float = Field(default=1, ge=0, le=100)
    low_minutes: int = Field(default=600, ge=0)
    # Optional reviewed nominal caps, separate from the untouched legacy RuleSet.
    weekly_cap_minutes: int | None = Field(default=None, ge=1)
    daily_cap_minutes: int | None = Field(default=None, ge=1)
    continue_on_day_failure: bool = False
    incremental_daily_selection: bool = False
    best_effort: bool = False
    business_rules: BusinessRuleSet | None = None


class Band(Contract):
    start: str
    end: str
    staff: int = Field(ge=0)


class DayContext(Contract):
    date: CalendarDate
    coverage: list[Band]
    opening_start: str
    opening_count: int = Field(ge=0)
    patterns: list[str]


class RequirementUnderstanding(Contract):
    source_hash: str
    rule_version: str
    snapshot_version: str
    days: list[DayContext]
    employee_ids: list[str]
    opening_is_included: Literal[True]
    full_counts_once: Literal[True]
    availability_is_hard: Literal[True]
    rating_is_soft: Literal[True]
    priorities: list[str]
    business_rule_version: str | None = None


class SchedulingContext(RequirementUnderstanding):
    # Deterministic source enrichment after the LLM's manifest passes consistency checks.
    employees: list[dict] = Field(default_factory=list)
    availability: list[dict] = Field(default_factory=list)
    approved_leave: list[dict] = Field(default_factory=list)
    existing_shifts: list[dict] = Field(default_factory=list)
    pattern_definitions: list[dict] = Field(default_factory=list)
    rule_hour_limits: dict = Field(default_factory=dict)
    business_rules: dict | None = None
    rating_hour_targets: list[dict] = Field(default_factory=list)


class Choice(Contract):
    candidate_id: str
    reason: str = Field(min_length=1, max_length=1500)


class DailyScheduleProposal(Contract):
    date: CalendarDate
    ledger_version: int = Field(ge=0)
    choices: list[Choice]
    explanation: str


class DailySelection(Contract):
    candidate_id: str
    reason: str = Field(min_length=1,max_length=1000)


class Replacement(Contract):
    shift_id: str
    employee_id: str
    reason: str = Field(min_length=1, max_length=1500)


class UnassignedStaffReview(Contract):
    unassigned_employee_ids: list[str]
    low_hours_employee_ids: list[str]
    analysis: str
    replacements: list[Replacement]
    retain_reasons: list[str]


class AuditAction(Contract):
    target: Literal["REQUIREMENT", "DAILY", "REVIEW", "RULES"]
    date: CalendarDate | None
    reason: str


class FinalAudit(Contract):
    approved_replacement_indices: list[int]
    actions: list[AuditAction]
    analysis: str


class ScheduledShift(Contract):
    id: str
    employee_id: str
    store_id: str
    date: CalendarDate
    pattern_name: str
    role_code: str
    start: datetime
    end: datetime
    fixed: bool = False
    source_shift_id: str | None = None
    reason: str = ""


class EmployeeHours(Contract):
    employee_id: str
    rating: float | None
    assigned_dates: list[CalendarDate]
    assigned_shifts: list[str]
    total_scheduled_minutes: int
    total_paid_minutes: int | None
    shift_count: int
    existing_committed_minutes: int
    existing_committed_hours: float
    availability: list[dict]
    remaining_hours_capacity: float | None
    available_minutes: int | None = None
    target_fraction: float | None = None
    target_scheduled_minutes: int | None = None
    target_assigned_minutes: int | None = None
    target_remaining_minutes: int | None = None
    target_excess_minutes: int | None = None


class EmployeeHoursLedger(Contract):
    version: int
    employees: list[EmployeeHours]


class ValidationError(Contract):
    code: str
    message: str
    date: CalendarDate | None = None
    shift_id: str | None = None


class CoverageSlot(Contract):
    date: CalendarDate
    start: datetime
    end: datetime
    required: int
    scheduled: int
    difference: int
    employee_ids: list[str]


class ValidationReport(Contract):
    valid: bool
    errors: list[ValidationError]
    coverage: list[CoverageSlot]


class FinalSchedule(Contract):
    run_id: str
    status: Literal["DRAFT_VALIDATED", "FAILED"]
    source: Literal["REAL", "MOCK"]
    provider: str
    rule_version: str
    snapshot_version: str
    state_version: int
    policy: Policy = Field(default_factory=Policy)
    failed_days: list[dict] = Field(default_factory=list)
    incomplete_dates: list[CalendarDate] = Field(default_factory=list)
    business_rule_report: dict | None = None
    context: SchedulingContext | None
    assignments: list[ScheduledShift]
    ledger: EmployeeHoursLedger
    review: UnassignedStaffReview | None
    validation: ValidationReport
    calendar: dict | None
    publishable: Literal[False] = False
    break_planning: Literal["NOT_IMPLEMENTED"] = "NOT_IMPLEMENTED"
    paid_minutes_status: Literal["UNKNOWN"] = "UNKNOWN"


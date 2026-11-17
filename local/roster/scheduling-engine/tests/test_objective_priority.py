from datetime import date, datetime, timezone

import pytest
from ortools.sat.python import cp_model

from engine import solver as solver_module
from engine.clock import local_instant, timezone_for
from engine.models import (BreakRule, ComplianceRules, DayRules, DemandSegment,
                           OptimizationWeights, RuleSet, Snapshot, SolveMode,
                           SolveStatus, StaffMember, ShiftPattern, TimeWindow)
from engine.solver import solve


DAY = date(2026, 10, 26)
ZONE = timezone_for("Australia/Sydney")


def one_person_needed(scores: list[float | None], *, skill_weight: int = 1000):
    day = DayRules(prep_start="10:00", opening_time="10:00", closing_time="14:00",
        work_end="14:00", opening_minimum=1, opening_qualified_minimum=0,
        demand=[DemandSegment(start="10:00", end="14:00", minimum=1)],
        patterns=[ShiftPattern(name="Early", role_code="service", starts=["10:00"],
            ends=["14:00"], break_rule=BreakRule(count=0))])
    rules = RuleSet(store_id="store", timezone=ZONE.key, base_day=day,
        compliance=ComplianceRules(minimum_shift_minutes=180, maximum_shift_minutes=720,
            maximum_daily_work_minutes=720, maximum_weekly_work_minutes=2280,
            minimum_rest_minutes=600, required_break_after_minutes=360),
        weights=OptimizationWeights(skill=skill_weight, fairness=0, excess_coverage=8,
            regular_pattern=0, early_late_start=0, stability=0,
            labor_cost=0, unnecessary_work=10), solve_seconds=5)
    employees = [StaffMember(id=f"e{index}", name=f"E{index}", store_id="store",
        qualified_roles={"service"}, score=score) for index, score in enumerate(scores)]
    start = local_instant(DAY, "10:00", ZONE)
    end = local_instant(DAY, "14:00", ZONE)
    snapshot = Snapshot(store_id="store", timezone=ZONE.key,
        generated_at=datetime.now(timezone.utc), version="test",
        employees=employees,
        availability=[TimeWindow(employee_id=person.id, start=start, end=end)
                      for person in employees], source="MOCK")
    return snapshot, rules


@pytest.mark.parametrize("mode", [SolveMode.STRICT, SolveMode.BEST_EFFORT])
def test_large_skill_weight_cannot_buy_unnecessary_extra_shift(mode):
    snapshot, rules = one_person_needed([100, 100])
    result = solve(snapshot, rules, DAY, DAY, mode)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert len(result.assignments) == 1
    assert all(slot.gap == 0 for slot in result.coverage)


def test_zero_score_is_not_treated_as_missing_score():
    snapshot, rules = one_person_needed([0, None], skill_weight=100)
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert [shift.employee_id for shift in result.assignments] == ["e1"]


def test_disabling_efficiency_weights_still_solves_preferences():
    snapshot, rules = one_person_needed([100, 100])
    rules.weights.excess_coverage = 0
    rules.weights.unnecessary_work = 0
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert result.parameters["objective_stage"] == "preferences"


def test_labor_cost_weight_requires_complete_candidate_cost_data():
    snapshot, rules = one_person_needed([100, 100])
    rules.weights.labor_cost = 10
    payload = rules.model_dump()
    payload["employee_preferences"] = {"e0": {"hourly_cost_cents": 3000}}
    rules = RuleSet.model_validate(payload)

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "MISSING_LABOR_COST"


def test_configured_hourly_cost_chooses_cheaper_qualified_employee():
    snapshot, rules = one_person_needed([100, 100])
    rules.weights.labor_cost = 10
    payload = rules.model_dump()
    payload["employee_preferences"] = {"e0": {"hourly_cost_cents": 3000},
                                       "e1": {"hourly_cost_cents": 2000}}
    rules = RuleSet.model_validate(payload)

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert [shift.employee_id for shift in result.assignments] == ["e1"]


def test_weekly_desired_minutes_are_prorated_for_a_one_day_run():
    snapshot, rules = one_person_needed([100, 100], skill_weight=0)
    rules.weights.fairness = 10
    payload = rules.model_dump()
    payload["employee_preferences"] = {"e0": {"desired_weekly_minutes": 0},
                                       "e1": {"desired_weekly_minutes": 1680}}
    rules = RuleSet.model_validate(payload)

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert [shift.employee_id for shift in result.assignments] == ["e1"]


def test_unknown_employee_preference_is_a_configuration_error():
    snapshot, rules = one_person_needed([100])
    payload = rules.model_dump()
    payload["employee_preferences"] = {"missing": {"hourly_cost_cents": 2000}}
    rules = RuleSet.model_validate(payload)

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "UNKNOWN_EMPLOYEE_PREFERENCE"


def test_time_limit_without_an_incumbent_is_unknown_not_infeasible(monkeypatch):
    snapshot, rules = one_person_needed([100, 100])

    class NoResult:
        def solve(self, _model):
            return cp_model.UNKNOWN

    monkeypatch.setattr(solver_module, "_solver", lambda _rules, _seconds: NoResult())
    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.UNKNOWN
    assert not result.assignments
    assert result.objective_score is None
    assert [(item.code, item.certainty) for item in result.diagnostics] == [
        ("TIME_LIMIT", "PROVEN")]
    assert "not proof of infeasibility" in result.diagnostics[0].message


def test_time_limit_after_feasible_tier_keeps_incumbent_without_claiming_optimum(monkeypatch):
    snapshot, rules = one_person_needed([100, 100])
    real_solver = solver_module._solver
    calls = 0

    class NoResult:
        def solve(self, _model):
            return cp_model.UNKNOWN

    def first_tier_only(current_rules, seconds):
        nonlocal calls
        calls += 1
        return real_solver(current_rules, seconds) if calls == 1 else NoResult()

    monkeypatch.setattr(solver_module, "_solver", first_tier_only)
    result = solve(snapshot, rules, DAY, DAY)

    assert calls == 2
    assert result.status == SolveStatus.FEASIBLE
    assert result.parameters["objective_stage"] == "coverage_efficiency"
    assert result.parameters["priority_proven"] == 0
    assert result.assignments and not result.validation_errors
    assert all(slot.gap == 0 for slot in result.coverage)

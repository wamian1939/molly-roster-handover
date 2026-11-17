from datetime import date, datetime, timezone

from engine.candidates import generate_candidates
from engine.clock import local_instant, timezone_for
from engine.config import compile_rules
from engine.models import (BreakRule, ComplianceRules, DayRules, DemandSegment,
                           ExistingShift, OptimizationWeights, RuleSet, ShiftPattern,
                           Snapshot, StaffMember, TimeWindow)
from engine.solver import solve
from fixtures.demo import demo_rules, demo_snapshot


DAY = date(2026, 10, 26)
ZONE = timezone_for("Australia/Sydney")


def test_draft_with_different_break_duration_has_no_stability_reward():
    rules = demo_rules()
    snapshot = demo_snapshot(DAY)
    employee_id = snapshot.employees[0].id
    snapshot.existing_shifts.append(ExistingShift(
        employee_id=employee_id, store_id=rules.store_id, role_code="service",
        status="DRAFT", start=local_instant(DAY, "10:00", ZONE),
        end=local_instant(DAY, "17:00", ZONE), break_minutes_unknown=0))
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors

    candidates, errors = generate_candidates(snapshot, rules, days)

    assert not errors
    early = next(item for item in candidates if item.employee_id == employee_id
                 and item.pattern_name == "Early"
                 and item.start == local_instant(DAY, "10:00", ZONE))
    assert not early.matched_existing


def test_exact_draft_break_is_preserved_by_stability_preference():
    rules = RuleSet(store_id="mock-stability", timezone="Australia/Sydney", slot_minutes=30,
        base_day=DayRules(prep_start="10:00", opening_time="10:00",
            closing_time="14:00", work_end="14:00", opening_minimum=0,
            pattern_minimums={"Early": 1},
            demand=[DemandSegment(start="10:00", end="14:00", minimum=0)],
            patterns=[ShiftPattern(name="Early", role_code="service",
                starts=["10:00"], ends=["14:00"],
                break_rule=BreakRule(count=1, duration_minutes=30,
                    earliest="11:00", latest_end="13:00"))]),
        compliance=ComplianceRules(required_break_after_minutes=300),
        weights=OptimizationWeights(skill=0, fairness=0, excess_coverage=0,
            regular_pattern=0, early_late_start=0, stability=40,
            labor_cost=0, unnecessary_work=0), solve_seconds=5)
    break_start = local_instant(DAY, "12:00", ZONE)
    break_end = local_instant(DAY, "12:30", ZONE)
    snapshot = Snapshot(store_id=rules.store_id, timezone=rules.timezone,
        generated_at=datetime.now(timezone.utc), version="draft-break", source="MOCK",
        employees=[StaffMember(id="person", name="Person", store_id=rules.store_id,
                               qualified_roles={"service"})],
        availability=[TimeWindow(employee_id="person",
            start=local_instant(DAY, "10:00", ZONE), end=local_instant(DAY, "14:00", ZONE))],
        existing_shifts=[ExistingShift(employee_id="person", store_id=rules.store_id,
            role_code="service", status="DRAFT",
            start=local_instant(DAY, "10:00", ZONE), end=local_instant(DAY, "14:00", ZONE),
            break_minutes_unknown=30, break_start=break_start, break_end=break_end)])
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    candidates, errors = generate_candidates(snapshot, rules, days)
    assert not errors and len(candidates) == 1
    candidate = candidates[0]
    assert candidate.matched_existing
    assert [candidate.break_options[index] for index in candidate.stable_break_options] == [
        [(break_start, break_end)]]

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == "OPTIMAL"
    assert not result.validation_errors
    assert len(result.assignments) == 1
    assert result.assignments[0].breaks == [(break_start, break_end)]
    assert "Preserves an existing draft shift" in result.assignments[0].reasons

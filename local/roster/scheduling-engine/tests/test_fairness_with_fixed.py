from datetime import date, datetime, timezone

from engine.clock import local_instant, timezone_for
from engine.models import (BreakRule, DayRules, DemandSegment, ExistingShift,
                           OptimizationWeights, RuleSet, Snapshot, StaffMember,
                           TimeWindow)
from engine.solver import solve


def test_fairness_counts_published_work_within_selected_dates():
    first = date(2026, 10, 26)
    second = date(2026, 10, 27)
    zone = timezone_for("Australia/Sydney")
    people = [
        StaffMember(id="a", name="A", store_id="shop", qualified_roles={"service"},
                    opening_qualified=True, score=100),
        StaffMember(id="b", name="B", store_id="shop", qualified_roles={"service"},
                    opening_qualified=True, score=0),
    ]
    availability = [TimeWindow(employee_id=person.id,
        start=local_instant(day, "10:00", zone), end=local_instant(day, "12:00", zone))
        for person in people for day in (first, second)]
    snapshot = Snapshot(store_id="shop", timezone="Australia/Sydney",
        generated_at=datetime.now(timezone.utc), version="fixed-fairness-case",
        source="MOCK", employees=people, availability=availability,
        existing_shifts=[ExistingShift(source_shift_id="day-one", employee_id="a",
            store_id="shop", role_code="service", status="PUBLISHED",
            start=local_instant(first, "10:00", zone),
            end=local_instant(first, "12:00", zone))])
    rules = RuleSet(store_id="shop", timezone="Australia/Sydney", slot_minutes=60,
        base_day=DayRules(prep_start="10:00", opening_time="10:00",
            closing_time="12:00", work_end="12:00", opening_minimum=1,
            demand=[DemandSegment(start="10:00", end="12:00", minimum=1)],
            patterns=[{"name": "Early", "role_code": "service",
                       "starts": ["10:00"], "ends": ["12:00"],
                       "break_rule": BreakRule(count=0)}]),
        compliance={"minimum_shift_minutes": 120, "maximum_shift_minutes": 120},
        weights=OptimizationWeights(skill=1, fairness=100, excess_coverage=20,
            regular_pattern=0, early_late_start=0, stability=0,
            labor_cost=0, unnecessary_work=20))

    result = solve(snapshot, rules, first, second)

    assert result.status in {"OPTIMAL", "FEASIBLE"}
    assert not result.validation_errors
    assert [(shift.date, shift.employee_id, shift.fixed) for shift in result.assignments] == [
        (first, "a", True), (second, "b", False)]

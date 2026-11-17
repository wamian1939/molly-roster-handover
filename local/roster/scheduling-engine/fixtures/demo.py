from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from engine.clock import local_instant, timezone_for
from engine.global_base import load_global_base
from engine.models import (BreakRule, DayRules, DemandSegment,
                           RuleSet, Snapshot, StaffMember,
                           ShiftPattern, TimeWindow)


def demo_rules(store_id: str = "mock-hurstville", timezone_name: str = "Australia/Sydney") -> RuleSet:
    global_base = load_global_base()
    day = DayRules(prep_start="10:00", opening_time="11:00", closing_time="22:00", work_end="22:00",
        opening_minimum=3, opening_qualified_minimum=1,
        demand=[DemandSegment(start="10:00", end="11:00", minimum=3),
                DemandSegment(start="11:00", end="14:00", minimum=5),
                DemandSegment(start="14:00", end="17:00", minimum=6),
                DemandSegment(start="17:00", end="20:00", minimum=5),
                DemandSegment(start="20:00", end="22:00", minimum=3)],
        patterns=[
            ShiftPattern(name="Early", role_code="service", starts=["10:00", "11:00"], ends=["17:00"], preferred=True,
                break_rule=BreakRule(count=1, duration_minutes=30, earliest="12:00", latest_end="16:00")),
            ShiftPattern(name="Full", role_code="service", starts=["10:00", "11:00"], ends=["22:00"], preferred=True,
                break_rule=BreakRule(count=1, duration_minutes=60, earliest="13:00", latest_end="19:00")),
            ShiftPattern(name="Late", role_code="service", starts=["16:00", "17:00"], ends=["22:00"],
                allow_early_late_start=True, preferred=True),
        ])
    return RuleSet(store_id=store_id, timezone=timezone_name, version="mock-v1",
        global_base_version=global_base.version, slot_minutes=global_base.slot_minutes,
        base_day=day, compliance=global_base.compliance, weights=global_base.weights,
        solve_seconds=global_base.solve_seconds, random_seed=global_base.random_seed)


def current_demo_rules(store_id: str = "mock-hurstville",
                       timezone_name: str = "Australia/Sydney") -> RuleSet:
    """An unsaved example with only seven independent shift-pattern counts."""
    draft = demo_rules(store_id, timezone_name).model_dump(mode="json")
    names = [pattern["name"] for pattern in draft["base_day"]["patterns"]]
    count = 1 if store_id.startswith("mock-") else 0
    draft["base_day"] = {"patterns": [
        {**pattern, "break_rule": {key: pattern["break_rule"][key]
                                   for key in ("count", "duration_minutes", "paid")}}
        for pattern in draft["base_day"]["patterns"]]}
    draft["weekly"] = {weekday: {"pattern_minimums": {name: count for name in names}}
                       for weekday in range(7)}
    for key in ("dates", "compliance", "employee_limits", "enforce_work_rest_limits"):
        draft.pop(key, None)
    draft["weights"].pop("excess_coverage", None)
    draft["pattern_only"] = True
    return RuleSet.model_validate(draft)


def demo_snapshot(day: date, store_id: str = "mock-hurstville", timezone_name: str = "Australia/Sydney",
                  count: int = 11, days: int = 1) -> Snapshot:
    zone = timezone_for(timezone_name)
    employees = [StaffMember(id=f"demo-{index:02}", name=f"Demo employee {index}", store_id=store_id,
        qualified_roles={"service"}, skill_codes={"opening"} if index < 3 else set(),
        opening_qualified=index < 3, score=90 - index * 3,
        desired_minutes=min(420 * days, 2280 * ((days + 6) // 7))) for index in range(count)]
    availability = [TimeWindow(employee_id=employee.id,
        start=local_instant(day + timedelta(days=offset), "09:00", zone),
        end=local_instant(day + timedelta(days=offset), "23:00", zone))
        for employee in employees for offset in range(days)]
    return Snapshot(store_id=store_id, timezone=timezone_name, generated_at=datetime.now(timezone.utc),
        version=f"mock-{day.isoformat()}-{days}d-{count}", employees=employees, availability=availability,
        source="MOCK", leave_data_complete=True, compliance_policy_confirmed=True)

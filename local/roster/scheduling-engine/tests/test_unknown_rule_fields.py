from __future__ import annotations

import pytest
from pydantic import ValidationError

from engine.models import RuleSet
from fixtures.demo import demo_rules


@pytest.mark.parametrize("section,unknown", [
    ("root", "slot_minuts"),
    ("day", "opening_minimun"),
    ("segment", "start_nxt_day"),
    ("pattern", "end_nxt_day"),
    ("break", "paid_brek"),
    ("weekday", "closing_nxt_day"),
    ("date", "work_end_nxt_day"),
    ("compliance", "maximum_weekly_work_minuts"),
    ("employee_limit", "minimum_rest_minuts"),
    ("employee_preference", "hourly_cost_cent"),
    ("weights", "excess_coverge"),
])
def test_unknown_rule_field_is_rejected(section: str, unknown: str):
    payload = demo_rules("mock-hurstville").model_dump(mode="json")
    payload["weekly"]["0"] = {}
    payload["dates"]["2026-10-26"] = {}
    payload["employee_limits"]["test-employee"] = {}
    payload["employee_preferences"]["test-employee"] = {}
    targets = {
        "root": payload,
        "day": payload["base_day"],
        "segment": payload["base_day"]["demand"][0],
        "pattern": payload["base_day"]["patterns"][0],
        "break": payload["base_day"]["patterns"][0]["break_rule"],
        "weekday": payload["weekly"]["0"],
        "date": payload["dates"]["2026-10-26"],
        "compliance": payload["compliance"],
        "employee_limit": payload["employee_limits"]["test-employee"],
        "employee_preference": payload["employee_preferences"]["test-employee"],
        "weights": payload["weights"],
    }
    targets[section][unknown] = True

    with pytest.raises(ValidationError) as error:
        RuleSet.model_validate(payload)
    assert unknown in str(error.value)

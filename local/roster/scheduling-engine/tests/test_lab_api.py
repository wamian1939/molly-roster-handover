from __future__ import annotations

from datetime import date, timezone
from importlib import import_module
import json
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient
import httpx
import pytest

from api import storage
from api.app import app
from adapters.real import SourceAccessError, SourceAuthError, SourceReadError, _evaluate
from engine.clock import local_instant, timezone_for
from engine.models import EmployeeLimits, ExistingShift, RuleSet
from engine.solver import solve
from fixtures.demo import current_demo_rules, demo_rules as legacy_demo_rules, demo_snapshot


def demo_rules(store_id="mock-hurstville", timezone_name="Australia/Sydney"):
    """API tests use the current seven-day rule; engine legacy fixtures remain historical."""
    data = current_demo_rules(store_id, timezone_name).current_payload()
    names = [pattern["name"] for pattern in data["base_day"]["patterns"]]
    data["weekly"] = {day: {"pattern_minimums": {name: 1 for name in names}}
                      for day in range(7)}
    return RuleSet.model_validate(data)


def test_exact_staffing_rejects_legacy_reviewed_solver(monkeypatch):
    module = import_module("api.app")
    proposal = Path(__file__).resolve().parents[1] / "configs/hurstville-exact-scheduled.json"
    rules = RuleSet.model_validate_json(proposal.read_text(encoding="utf-8"))
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "latest_rules", lambda _store: rules)
    monkeypatch.setattr(module, "load_snapshot", lambda *_: pytest.fail("Source should not be read"))
    response = TestClient(app).post("/api/solve", json={
        "store_id": "hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT",
        "run_purpose": "REVIEWED", "leave_data_complete": True,
        "expected_rule_version": rules.version,
    })
    assert response.status_code == 422
    assert "Exact Staffing" in response.json()["detail"]


def test_exact_scheduled_rule_can_be_saved_and_read_as_current(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    payload = RuleSet.model_validate_json((Path(__file__).resolve().parents[1]
        / "configs/hurstville-exact-scheduled.json").read_text(encoding="utf-8")).current_payload()
    payload["store_id"] = "mock-hurstville"
    client = TestClient(app)
    response = client.post("/api/rules/mock-hurstville", json=payload)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["requirement_mode"] == "EXACT_SCHEDULED"
    assert saved["version"] == "mock-hurstville:v1"
    assert "weekly" not in saved
    assert "weekly_coverage" not in saved
    assert "weekly_pattern_bounds" not in saved
    assert saved["weekly_exact_staffing"]["0"][1]["staff"] == 4
    current = client.get("/api/rules/mock-hurstville").json()
    assert current["version"] == saved["version"]


def test_mock_run_is_versioned_and_persisted_only_in_lab(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    assert client.get("/api/health").json()["formal_roster_write"] is False
    assert client.get("/api/health").json()["engine_version"] == "0.1.29"
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["copied_from"] = "another-store@v3"
    saved = client.post("/api/rules/mock-hurstville", json=rules)
    assert saved.status_code == 200
    assert saved.json()["version"] == "mock-hurstville:v1"
    assert client.get("/api/rules/mock-hurstville").json()["copied_from"] == "another-store@v3"
    run = client.post("/api/solve", json={"store_id": "mock-hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "MOCK", "mode": "STRICT"})
    assert run.status_code == 200
    result = run.json()
    assert result["source"] == "MOCK"
    assert result["status"] in {"OPTIMAL", "FEASIBLE"}
    assert result["rule_version"] == "mock-hurstville:v1"
    assert not result["validation_errors"]
    assert client.get(f"/api/run/{result['run_id']}").json()["run_id"] == result["run_id"]
    updated = saved.json()
    updated["weekly"]["0"]["pattern_minimums"]["Early"] = 4
    second = client.post("/api/rules/mock-hurstville", json=updated,
        headers={"X-Expected-Rule-Version": "mock-hurstville:v1"})
    assert second.status_code == 200
    assert second.json()["version"] == "mock-hurstville:v2"
    historical = client.get(f"/api/run/{result['run_id']}/rules")
    assert historical.status_code == 200
    assert historical.json()["version"] == "mock-hurstville:v1"
    assert historical.json()["weekly"]["0"]["pattern_minimums"]["Early"] == 1
    assert client.get("/api/rules/mock-hurstville/versions/1").json() == historical.json()
    assert client.get("/api/rules/mock-hurstville/versions/3").status_code == 404
    checked_stores = []
    monkeypatch.setattr(import_module("api.app"), "require_store",
                        lambda store_id, _cookie: checked_stores.append(store_id))
    assert client.get(f"/api/run/{result['run_id']}/rules").status_code == 200
    assert checked_stores == ["mock-hurstville"]
    assert (tmp_path / "lab.sqlite3").exists()


def test_saved_real_run_history_requires_store_access(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    day = date(2026, 10, 26)
    rules = storage.save_rules(demo_rules("hurstville"))
    result = solve(demo_snapshot(day, "hurstville"), rules, day, day)
    storage.save_run(result)
    client = TestClient(app)
    paths = (f"/api/runs/hurstville", f"/api/run/{result.run_id}",
             f"/api/run/{result.run_id}/rules")

    for path in paths:
        assert client.get(path).status_code == 401

    module = import_module("api.app")
    monkeypatch.setattr(module, "_session_cookie", lambda _cookie: "synthetic-session")
    monkeypatch.setattr(module, "accessible_stores", lambda _cookie: [{"id": "another-store"}])
    headers = {"cookie": "evaluate_molly_session=synthetic-session"}
    for path in paths:
        assert client.get(path, headers=headers).status_code == 403

    monkeypatch.setattr(module, "accessible_stores", lambda _cookie: [{"id": "hurstville"}])
    for path in paths:
        assert client.get(path, headers=headers).status_code == 200


def test_weekday_pattern_counts_are_independent_and_complete(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["weekly"]["0"]["pattern_minimums"] = {"Early": 2, "Full": 0, "Late": 0}

    saved = client.post("/api/rules/mock-hurstville", json=rules)

    assert saved.status_code == 200, saved.text
    reloaded = client.get("/api/rules/mock-hurstville").json()
    assert reloaded["weekly"]["0"]["pattern_minimums"] == {
        "Early": 2, "Full": 0, "Late": 0}
    assert "dates" not in reloaded
    assert set(reloaded["base_day"]) == {"patterns"}
    assert "compliance" not in reloaded
    assert "employee_limits" not in reloaded
    with sqlite3.connect(tmp_path / "lab.sqlite3") as connection:
        stored = json.loads(connection.execute(
            "SELECT rules_json FROM rule_versions WHERE store_id=?", ("mock-hurstville",)
        ).fetchone()[0])
    assert stored == reloaded
    assert all(set(override) == {"pattern_minimums"}
               for override in stored["weekly"].values())
    assert set(stored["base_day"]["patterns"][0]["break_rule"]) == {
        "count", "duration_minutes", "paid"}
    effective = RuleSet.model_validate(reloaded)
    assert effective.for_date(date(2026, 10, 26)).pattern_minimums["Early"] == 2
    assert effective.for_date(date(2026, 10, 27)).pattern_minimums["Early"] == 1


def test_legacy_current_rule_is_only_an_unsaved_weekday_draft(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    old_data = legacy_demo_rules().model_dump(mode="json")
    old_data["weekly"] = {0: {"opening_minimum": 3, "pattern_minimums": {"Early": 4, "Late": 4}},
                          1: {"opening_minimum": 2, "pattern_minimums": {"Early": 3, "Late": 5}}}
    legacy = RuleSet.model_validate(old_data)
    saved_legacy = storage.save_rules(legacy)
    client = TestClient(app)

    draft = client.get("/api/rules/mock-hurstville").json()
    assert draft["version"] == saved_legacy.version
    assert draft["requires_save"] is True
    assert set(draft["base_day"]) == {"patterns"}
    assert set(draft["weekly"]) == set(map(str, range(7)))
    assert draft["weekly"]["0"]["pattern_minimums"] == {"Early": 4, "Full": 0, "Late": 4}
    assert draft["weekly"]["1"]["pattern_minimums"] == {"Early": 3, "Full": 0, "Late": 5}
    assert all(set(day) == {"pattern_minimums"} for day in draft["weekly"].values())
    assert not {"demand", "dates", "compliance", "employee_limits", "enforce_work_rest_limits"} & draft.keys()
    assert "excess_coverage" not in draft["weights"]
    assert client.get("/api/rules/mock-hurstville/versions/1").json()["base_day"]["opening_minimum"] == 3
    assert storage.latest_rules("mock-hurstville").version == saved_legacy.version

    rejected = client.post("/api/solve", json={"store_id": "mock-hurstville",
        "start_date": "2026-10-26", "end_date": "2026-10-26", "source": "MOCK", "mode": "STRICT"})
    assert rejected.status_code == 422
    assert "seven-day shift-pattern count" in rejected.json()["detail"]

    draft.pop("requires_save")
    draft.pop("migration_warnings")
    updated = client.post("/api/rules/mock-hurstville", json=draft,
                          headers={"X-Expected-Rule-Version": saved_legacy.version})
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == "mock-hurstville:v2"
    assert "demand" not in updated.json()["base_day"]
    assert "compliance" not in updated.json()


def test_rule_save_rejects_legacy_demand_without_writing(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["base_day"]["demand"] = [{"start": "10:00", "end": "22:00", "minimum": 3}]

    rejected = client.post("/api/rules/mock-hurstville", json=rules)

    assert rejected.status_code == 422
    assert "seven weekday shift-pattern counts" in rejected.json()["detail"]
    assert storage.latest_rules("mock-hurstville") is None


@pytest.mark.parametrize(("location", "field", "value"), [
    ("base_day", "opening_time", "11:00"),
    ("base_day", "opening_minimum", 0),
    ("root", "dates", {}),
    ("root", "employee_limits", {}),
    ("root", "enforce_work_rest_limits", False),
    ("weekday", "demand", []),
    ("weekday", "opening_minimum", 0),
    ("weights", "excess_coverage", 0),
    ("break_rule", "earliest", "12:00"),
    ("break_rule", "minimum_work_before_break_slots", 0),
])
def test_rule_save_rejects_obsolete_staffing_and_break_fields(
        tmp_path, monkeypatch, location, field, value):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    target = ({"root": rules, "base_day": rules["base_day"],
               "weekday": rules["weekly"]["0"],
               "weights": rules["weights"],
               "break_rule": rules["base_day"]["patterns"][0]["break_rule"]}[location])
    target[field] = value

    rejected = client.post("/api/rules/mock-hurstville", json=rules)
    assert rejected.status_code == 422
    assert storage.latest_rules("mock-hurstville") is None


def test_daily_work_cap_is_not_accepted_in_pattern_count_rules(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["compliance"] = {"maximum_daily_work_minutes": 600}

    saved = client.post("/api/rules/mock-hurstville", json=rules)
    assert saved.status_code == 422
    assert storage.latest_rules("mock-hurstville") is None


def test_weekly_work_cap_is_not_accepted_in_pattern_count_rules(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["compliance"] = {"maximum_weekly_work_minutes": 600}

    saved = client.post("/api/rules/mock-hurstville", json=rules)
    assert saved.status_code == 422
    assert storage.latest_rules("mock-hurstville") is None


def test_rule_save_validates_future_dst_transition_without_a_validity_range(
        tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    day = rules["base_day"]
    day["patterns"] = [{"name": "Early", "role_code": "service", "starts": ["02:30"],
                        "ends": ["10:00"], "break_rule": {"count": 1, "duration_minutes": 30}}]
    rules["weekly"] = {str(index): {"pattern_minimums": {"Early": 1}}
                       for index in range(7)}

    rejected = client.post("/api/rules/mock-hurstville", json=rules)

    assert rejected.status_code == 422
    assert any(item["date"] == "2027-10-03" and "Nonexistent local time" in item["message"]
               for item in rejected.json()["detail"])
    assert storage.latest_rules("mock-hurstville") is None


def test_rule_save_rejects_unknown_nested_field_without_writing(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["base_day"]["patterns"][0]["start_nxt_day"] = True

    rejected = client.post("/api/rules/mock-hurstville", json=rules)

    assert rejected.status_code == 422
    assert any("start_nxt_day" in str(item["loc"]) for item in rejected.json()["detail"])
    assert storage.latest_rules("mock-hurstville") is None


def test_solve_rejects_unknown_review_field_without_saving_run(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    assert client.post("/api/rules/mock-hurstville", json=rules).status_code == 200

    rejected = client.post("/api/solve", json={
        "store_id": "mock-hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "MOCK",
        "leave_data_complet": True,
    })

    assert rejected.status_code == 422
    assert any("leave_data_complet" in str(item["loc"]) for item in rejected.json()["detail"])
    assert storage.recent_runs("mock-hurstville") == []


@pytest.mark.parametrize("obsolete_field", ["compliance_policy_confirmed", "staffing_rules_confirmed"])
def test_solve_rejects_removed_work_rest_attestations(tmp_path, monkeypatch, obsolete_field):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    assert client.post("/api/rules/mock-hurstville", json=rules).status_code == 200

    rejected = client.post("/api/solve", json={
        "store_id": "mock-hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "MOCK", obsolete_field: True,
    })

    assert rejected.status_code == 422
    assert obsolete_field in str(rejected.json()["detail"])
    assert storage.recent_runs("mock-hurstville") == []


def test_solve_rejects_a_stale_rule_version_before_creating_a_run(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    saved = client.post("/api/rules/mock-hurstville", json=rules)
    assert saved.status_code == 200
    current = saved.json()["version"]

    stale = client.post("/api/solve", json={"store_id": "mock-hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "MOCK", "expected_rule_version": "mock-hurstville:v0"})
    assert stale.status_code == 409
    assert current in stale.json()["detail"]
    assert client.get("/api/runs/mock-hurstville").json()["runs"] == []


def test_rule_validity_dates_are_rejected_and_saved_rule_can_run_on_another_day(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rule = client.get("/api/rules/mock-hurstville").json()
    rule["valid_from"] = "2026-10-26"
    assert client.post("/api/rules/mock-hurstville", json=rule).status_code == 422
    rule.pop("valid_from")
    rule["valid_through"] = "2026-10-26"
    assert client.post("/api/rules/mock-hurstville", json=rule).status_code == 422
    rule.pop("valid_through")
    saved = client.post("/api/rules/mock-hurstville", json=rule)
    assert saved.status_code == 200
    assert "valid_from" not in saved.json()
    assert "valid_through" not in saved.json()

    base = {"store_id": "mock-hurstville", "start_date": "2026-10-26",
            "end_date": "2026-10-26", "source": "MOCK", "mode": "STRICT",
            "expected_rule_version": saved.json()["version"]}
    next_day = client.post("/api/solve", json={**base, "start_date": "2026-10-27",
        "end_date": "2026-10-27"})
    assert next_day.status_code == 200
    parsed = RuleSet.model_validate(saved.json())
    outside = solve(demo_snapshot(date(2026, 10, 27)), parsed,
                    date(2026, 10, 27), date(2026, 10, 27))
    assert all(item.code != "RULE_DATE_SCOPE" for item in outside.diagnostics)
    allowed = client.post("/api/solve", json=base)
    assert allowed.status_code == 200
    assert allowed.json()["status"] in {"OPTIMAL", "FEASIBLE"}


def test_public_lab_rejects_mock_store_and_mock_solve(monkeypatch):
    monkeypatch.delenv("SCHEDULING_LAB_TEST_MOCK", raising=False)
    client = TestClient(app)
    assert client.get("/api/rules/mock-hurstville").status_code == 404
    assert client.post("/api/solve", json={"store_id": "hurstville",
        "start_date": "2026-10-26", "end_date": "2026-10-26",
        "source": "MOCK"}).status_code == 422


def test_rule_save_checks_the_current_version_atomically(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    original = client.get("/api/rules/mock-hurstville").json()
    first = client.post("/api/rules/mock-hurstville", json=original,
        headers={"X-Expected-Rule-Version": "__NONE__"})
    assert first.status_code == 200
    assert first.json()["version"] == "mock-hurstville:v1"
    duplicate_first = client.post("/api/rules/mock-hurstville", json=original,
        headers={"X-Expected-Rule-Version": "__NONE__"})
    assert duplicate_first.status_code == 409

    newer = first.json()
    newer["solve_seconds"] = 16
    second = client.post("/api/rules/mock-hurstville", json=newer,
        headers={"X-Expected-Rule-Version": "mock-hurstville:v1"})
    assert second.status_code == 200
    assert second.json()["version"] == "mock-hurstville:v2"

    stale = first.json()
    stale["solve_seconds"] = 17
    rejected = client.post("/api/rules/mock-hurstville", json=stale,
        headers={"X-Expected-Rule-Version": "mock-hurstville:v1"})
    assert rejected.status_code == 409
    current = client.get("/api/rules/mock-hurstville").json()
    assert current["version"] == "mock-hurstville:v2"
    assert current["solve_seconds"] == 16


def test_rule_save_accepts_unlimited_solve_time(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["solve_seconds"] = 0
    saved = client.post("/api/rules/mock-hurstville", json=rules,
                        headers={"X-Expected-Rule-Version": "__NONE__"})
    assert saved.status_code == 200
    assert saved.json()["solve_seconds"] == 0
    assert client.get("/api/rules/mock-hurstville").json()["solve_seconds"] == 0


def test_personal_work_limits_are_rejected_from_lab_rules(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    targets = client.get("/api/employee-rule-targets/mock-hurstville")
    assert targets.status_code == 200
    employee_id = targets.json()[0]["id"]
    assert targets.json()[0]["name"]
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["employee_limits"] = {employee_id: {"maximum_daily_work_minutes": 360}}

    saved = client.post("/api/rules/mock-hurstville", json=rules)

    assert saved.status_code == 422
    assert "Pattern-only rules cannot include" in str(saved.json()["detail"])
    assert storage.latest_rules("mock-hurstville") is None
    assert client.get("/api/employee-rule-targets/hurstville").status_code == 401


def test_personal_limit_cannot_relax_store_compliance_on_save(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["employee_limits"] = {"one": {"maximum_daily_work_minutes": 999}}

    response = client.post("/api/rules/mock-hurstville", json=rules)

    assert response.status_code == 422
    assert client.get("/api/rules/mock-hurstville").json()["version"] == rules["version"]


def test_employee_preferences_are_versioned_and_missing_cost_is_visible(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    rules = client.get("/api/rules/mock-hurstville").json()
    rules["employee_preferences"] = {"demo-00": {"desired_weekly_minutes": 1680,
                                                  "hourly_cost_cents": 2500}}
    rules["weights"]["labor_cost"] = 5

    saved = client.post("/api/rules/mock-hurstville", json=rules)

    assert saved.status_code == 200
    assert saved.json()["employee_preferences"]["demo-00"]["hourly_cost_cents"] == 2500
    assert client.get("/api/rules/mock-hurstville").json()["employee_preferences"] == saved.json()["employee_preferences"]
    run = client.post("/api/solve", json={"store_id": "mock-hurstville",
        "start_date": "2026-10-26", "end_date": "2026-10-26", "source": "MOCK"})
    assert run.status_code == 200
    assert run.json()["status"] == "CONFIG_ERROR"
    assert run.json()["diagnostics"][0]["code"] == "MISSING_LABOR_COST"


def test_rule_save_rejects_date_specific_staffing_override(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    rules = demo_rules().model_dump(mode="json")
    base = rules["base_day"]
    base.update(prep_start="00:00", opening_time="00:00", closing_time="04:00",
                work_end="04:00", opening_minimum=0, opening_qualified_minimum=0,
                demand=[{"start": "00:00", "end": "04:00", "minimum": 0, "role_minimums": {}}])
    morning = base["patterns"][0]
    morning["starts"], morning["ends"] = ["00:00"], ["04:00"]
    morning["break_rule"]["count"] = 0
    base["patterns"] = [morning]
    night = {**morning, "name": "Night", "starts": ["22:00"], "ends": ["02:00"],
             "end_next_day": True}
    rules["dates"] = {"2026-10-25": {
        "prep_start": "22:00", "opening_time": "22:00",
        "closing_time": "02:00", "closing_next_day": True,
        "work_end": "02:00", "work_end_next_day": True,
        "demand": [{"start": "22:00", "end": "02:00", "end_next_day": True,
                    "minimum": 0, "role_minimums": {}}], "patterns": [night]}}

    response = TestClient(app).post("/api/rules/mock-hurstville", json=rules)

    assert response.status_code == 422
    assert "Pattern-only rules cannot include" in str(response.json()["detail"])
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_source_without_authorization_never_falls_back_to_mock(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    response = client.post("/api/solve", json={"store_id": "hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT"})
    assert response.status_code == 401
    assert not (tmp_path / "lab.sqlite3").exists()


def test_mock_store_cannot_be_read_as_a_real_source(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    preview = client.get("/api/source-preview/mock-hurstville?start_date=2026-10-26&end_date=2026-10-26")
    run = client.post("/api/solve", json={"store_id": "mock-hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT",
        "leave_data_complete": True})
    for response in (preview, run):
        assert response.status_code == 422
        assert "mock store" in response.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_solve_rejects_missing_attestations_before_snapshot_read(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "latest_rules", lambda store_id: demo_rules(store_id))

    def unexpected_read(*_args):
        raise AssertionError("real source must not be read before attestation")

    monkeypatch.setattr(module, "load_snapshot", unexpected_read)
    client = TestClient(app)
    response = client.post("/api/solve", json={"store_id": "hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT"})
    assert response.status_code == 422
    assert "approved leave" in response.json()["detail"]
    missing_preview = client.post("/api/solve", json={"store_id": "hurstville",
        "start_date": "2026-10-26", "end_date": "2026-10-26", "source": "REAL",
        "leave_data_complete": True})
    assert missing_preview.status_code == 422
    assert "reviewed rule version" in missing_preview.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_solve_requires_current_preview_version_without_saving_run(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "latest_rules", lambda store_id: demo_rules(store_id))
    snapshot = demo_snapshot(date(2026, 10, 26), store_id="hurstville")
    snapshot.source = "REAL"
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})
    monkeypatch.setattr(module, "load_snapshot", lambda *_: snapshot)
    client = TestClient(app)
    request = {"store_id": "hurstville", "start_date": "2026-10-26",
               "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT",
               "run_purpose": "EXPLORATORY", "replace_target_published_for_comparison": True,
               "leave_data_complete": True}

    missing_rule = client.post("/api/solve", json={**request, "expected_source_version": snapshot.version})
    assert missing_rule.status_code == 422
    assert "rule version" in missing_rule.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()
    request["expected_rule_version"] = "mock-v1"

    stale_rule = client.post("/api/solve", json={**request,
        "expected_rule_version": "old-rule", "expected_source_version": snapshot.version})
    assert stale_rule.status_code == 409
    assert "Rule version changed" in stale_rule.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()

    missing = client.post("/api/solve", json=request)
    assert missing.status_code == 422
    assert "preview" in missing.json()["detail"].lower()
    assert not (tmp_path / "lab.sqlite3").exists()

    stale = client.post("/api/solve", json={**request, "expected_source_version": "old-source"})
    assert stale.status_code == 409
    assert "source" in stale.json()["detail"].lower()
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_solve_rejects_unknown_leave_employee_before_optimization(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "latest_rules", lambda store_id: demo_rules(store_id))
    snapshot = demo_snapshot(date(2026, 10, 26), store_id="hurstville")
    snapshot.source = "REAL"
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})
    monkeypatch.setattr(module, "load_snapshot", lambda *_: snapshot)
    client = TestClient(app)
    response = client.post("/api/solve", json={"store_id": "hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT",
        "run_purpose": "EXPLORATORY", "replace_target_published_for_comparison": True,
        "expected_rule_version": "mock-v1",
        "expected_source_version": snapshot.version,
        "leave_data_complete": True,
        "approved_leave": [{"employee_id": "unknown-employee",
            "start": "2026-10-26T12:00:00+11:00", "end": "2026-10-26T16:00:00+11:00"}]})
    assert response.status_code == 422
    assert "unknown-employee" in response.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


@pytest.mark.parametrize("status,error_type", [
    (401, SourceAuthError),
    (403, SourceAccessError),
])
def test_evaluate_rejection_is_distinct_from_source_outage(monkeypatch, status, error_type):
    original_client = httpx.Client
    transport = httpx.MockTransport(lambda _request: httpx.Response(status))
    monkeypatch.setattr(httpx, "Client", lambda **_kwargs: original_client(transport=transport))
    with pytest.raises(error_type):
        _evaluate("/roster-integration/stores", "evaluate_molly_session=expired")


def test_evaluate_connection_failure_remains_a_source_read_error(monkeypatch):
    original_client = httpx.Client

    def disconnected(request):
        raise httpx.ConnectError("offline", request=request)

    transport = httpx.MockTransport(disconnected)
    monkeypatch.setattr(httpx, "Client", lambda **_kwargs: original_client(transport=transport))
    with pytest.raises(SourceReadError, match="Evaluate API read failed") as failure:
        _evaluate("/roster-integration/stores", "evaluate_molly_session=valid")
    assert not isinstance(failure.value, (SourceAuthError, SourceAccessError))


@pytest.mark.parametrize("failure,status", [
    (SourceAuthError("Evaluate login has expired or is invalid"), 401),
    (SourceAccessError("Evaluate denied access to this data"), 403),
])
def test_store_gate_preserves_evaluate_authorization_status(tmp_path, monkeypatch, failure, status):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")

    def rejected(*_args):
        raise failure

    monkeypatch.setattr(module, "accessible_stores", rejected)
    client = TestClient(app)
    headers = {"cookie": "evaluate_molly_session=test-session"}
    stores = client.get("/api/stores", headers=headers)
    preview = client.get("/api/source-preview/hurstville?start_date=2026-10-26&end_date=2026-10-26",
                         headers=headers)
    for response in (stores, preview):
        assert response.status_code == status
        assert response.json()["detail"] == str(failure)
    assert not (tmp_path / "lab.sqlite3").exists()


@pytest.mark.parametrize("source_failure", [
    "Evaluate API read failed: ConnectionError",
    "Roster database read failed: OperationalError",
])
def test_real_source_failure_is_explicit_and_never_runs_mock(
        tmp_path, monkeypatch, source_failure):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "latest_rules", lambda store_id: demo_rules(store_id))

    def unavailable_source(*_args):
        raise SourceReadError(source_failure)

    if source_failure.startswith("Evaluate"):
        monkeypatch.setattr(module, "accessible_stores", unavailable_source)
    else:
        monkeypatch.setattr(module, "accessible_stores", lambda *_: [{"id": "hurstville"}])
        monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
            "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})
        monkeypatch.setattr(module, "load_snapshot", unavailable_source)
    client = TestClient(app)
    headers = {"cookie": "evaluate_molly_session=test-session"}
    preview = client.get("/api/source-preview/hurstville?start_date=2026-10-26&end_date=2026-10-26",
                         headers=headers)
    run = client.post("/api/solve", json={"store_id": "hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT",
        "run_purpose": "EXPLORATORY", "replace_target_published_for_comparison": True,
        "expected_rule_version": "mock-v1",
        "expected_source_version": "preview-version",
        "leave_data_complete": True}, headers=headers)
    for response in (preview, run):
        assert response.status_code == 503
        assert response.json()["detail"] == source_failure
    if source_failure.startswith("Evaluate"):
        stores = client.get("/api/stores", headers=headers)
        assert stores.status_code == 503
        assert stores.json()["detail"] == source_failure
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_preview_lists_unknown_break_and_rejects_break_override_in_comparison(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville")
    zone = timezone_for(snapshot.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="published-1",
        employee_id=snapshot.employees[0].id, store_id=snapshot.store_id,
        role_code="service", status="PUBLISHED", break_minutes_unknown=60,
        start=local_instant(day, "10:00", zone), end=local_instant(day, "22:00", zone)))
    snapshot.source = "REAL"
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "load_snapshot", lambda *_: snapshot)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {"settings": {"openingTime": "09:00", "timezone": "Australia/Sydney"},
        "active_templates": [{"name": "AA", "startTime": "10:00", "endTime": "22:00",
                              "breakMinutes": 60}]})
    monkeypatch.setattr(module, "latest_rules", lambda store_id: demo_rules(store_id))
    client = TestClient(app)
    preview = client.get("/api/source-preview/hurstville?start_date=2026-10-26&end_date=2026-10-26")
    assert preview.status_code == 200
    assert preview.json()["rule_hints"]["settings"]["openingTime"] == "09:00"
    assert preview.json()["rule_hints"]["active_templates"][0]["name"] == "AA"
    assert preview.json()["unresolved_fixed_breaks"][0]["source_shift_id"] == "published-1"
    assert preview.json()["published_shift_source_alignment"][0]["role_and_availability_pool"] == len(snapshot.employees)
    observed = preview.json()["observed_published_shifts"]
    assert observed == [{"date": "2026-10-26", "start": "10:00", "end": "22:00",
        "start_instant": local_instant(day, "10:00", zone).astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "end_instant": local_instant(day, "22:00", zone).astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "end_next_day": False, "role_code": "service", "break_minutes": 60,
        "assigned_people": 1}]
    assert snapshot.employees[0].name not in preview.text
    invalid = client.post("/api/solve", json={"store_id": "hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT",
        "run_purpose": "EXPLORATORY", "replace_target_published_for_comparison": True,
        "expected_rule_version": "mock-v1",
        "expected_source_version": snapshot.version,
        "leave_data_complete": True,
        "fixed_break_intervals": [{"source_shift_id": "published-1",
            "start": "2026-10-26T13:00:00+11:00", "end": "2026-10-26T13:30:00+11:00"}]})
    assert invalid.status_code == 422
    assert "excluded from comparison" in invalid.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_run_keeps_its_own_published_reference_in_lab_history(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville")
    snapshot.source = "REAL"
    zone = timezone_for(snapshot.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="published-reference",
        employee_id=snapshot.employees[0].id, store_id=snapshot.store_id,
        role_code="service", status="PUBLISHED", break_minutes_unknown=0,
        start=local_instant(day, "10:00", zone), end=local_instant(day, "17:00", zone)))
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "load_snapshot", lambda *_: snapshot)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})
    rules = demo_rules("hurstville")
    monkeypatch.setattr(module, "latest_rules", lambda store_id: rules)
    client = TestClient(app)
    response = client.post("/api/solve", json={"store_id": "hurstville", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "source": "REAL", "mode": "STRICT",
        "run_purpose": "EXPLORATORY", "replace_target_published_for_comparison": True,
        "expected_rule_version": rules.version,
        "expected_source_version": snapshot.version})
    assert response.status_code == 200
    result = response.json()
    assert result["source"] == "REAL"
    assert result["parameters"]["approved_leave_review"] == "UNKNOWN"
    assert result["parameters"]["acceptance_gate"] == "NOT_ELIGIBLE"
    assert result["published_reference"] == [{"date": "2026-10-26", "start": "10:00", "end": "17:00",
        "start_instant": local_instant(day, "10:00", zone).astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "end_instant": local_instant(day, "17:00", zone).astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "end_next_day": False, "role_code": "service", "break_minutes": 0, "assigned_people": 1}]
    assert result["parameters"]["comparison_mode"] == "REPLACE_TARGET_PUBLISHED"
    assert result["parameters"]["comparison_removed_assignments"] == 1
    assert not any(shift["fixed"] for shift in result["assignments"])
    assert len(snapshot.existing_shifts) == 1
    snapshot.existing_shifts.clear()
    restored = client.get(f"/api/run/{result['run_id']}")
    assert restored.status_code == 200
    assert restored.json()["published_reference"] == result["published_reference"]
    assert restored.json()["snapshot_version"] == result["snapshot_version"]


def test_comparison_mode_rejects_mock_source(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    client = TestClient(app)
    response = client.post("/api/solve", json={"store_id": "mock-hurstville",
        "start_date": "2026-10-26", "end_date": "2026-10-26", "source": "MOCK",
        "replace_target_published_for_comparison": True})
    assert response.status_code == 422
    assert not (tmp_path / "lab.sqlite3").exists()


def test_exploratory_real_run_uses_current_source_without_false_policy_attestation(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    day = date(2026, 10, 26)
    rules = demo_rules("hurstville")
    rules.weekly[0].pattern_minimums["Full"] = 0
    snapshot = demo_snapshot(day, store_id="hurstville")
    snapshot.source = "REAL"
    snapshot.leave_data_complete = False
    snapshot.compliance_policy_confirmed = False
    zone = timezone_for(snapshot.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="published-no-break",
        employee_id=snapshot.employees[0].id, store_id="hurstville", role_code="service",
        status="PUBLISHED", break_minutes_unknown=0,
        start=local_instant(day, "10:00", zone), end=local_instant(day, "17:00", zone)))
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "latest_rules", lambda _store: rules)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})
    monkeypatch.setattr(module, "load_snapshot", lambda *_: snapshot)
    client = TestClient(app)
    request = {"store_id": "hurstville", "start_date": day.isoformat(),
        "end_date": day.isoformat(), "source": "REAL", "run_purpose": "EXPLORATORY",
        "mode": "STRICT", "expected_rule_version": rules.version,
        "expected_source_version": snapshot.version,
        "replace_target_published_for_comparison": True}
    response = client.post("/api/solve", json=request)
    assert response.status_code == 200
    result = response.json()
    assert result["source"] == "REAL"
    assert result["run_purpose"] == "EXPLORATORY"
    assert result["engine_version"].startswith("v2-")
    assert result["status"] in {"OPTIMAL", "FEASIBLE"}
    assert result["parameters"]["acceptance_gate"] == "NOT_ELIGIBLE"
    assert result["parameters"]["approved_leave_review"] == "UNKNOWN"
    assert "work_break_policy_review" not in result["parameters"]
    assert "staffing_rules_review" not in result["parameters"]
    assert result["parameters"]["comparison_removed_assignments"] == 1
    assert result["published_reference"][0]["assigned_people"] == 1
    assert not any(shift["fixed"] for shift in result["assignments"])
    assert not result["validation_errors"]
    assert snapshot.leave_data_complete is False
    assert snapshot.compliance_policy_confirmed is False
    assert len(snapshot.existing_shifts) == 1
    saved = client.get(f"/api/run/{result['run_id']}").json()
    assert saved["run_purpose"] == "EXPLORATORY"
    history = client.get("/api/runs/hurstville").json()["runs"]
    assert history[0]["run_purpose"] == "EXPLORATORY"
    assert history[0]["mode"] == "STRICT"
    assert history[0]["rule_version"] == rules.version
    assert history[0]["snapshot_version"] == saved["snapshot_version"]

    reviewed = client.post("/api/solve", json={**request, "run_purpose": "REVIEWED"})
    assert reviewed.status_code == 422
    missing_comparison = client.post("/api/solve", json={
        **request, "replace_target_published_for_comparison": False})
    assert missing_comparison.status_code == 422
    stale_source = client.post("/api/solve", json={**request,
        "expected_source_version": "stale"})
    assert stale_source.status_code == 409
    unreviewed_leave = client.post("/api/solve", json={**request,
        "approved_leave": [{"employee_id": snapshot.employees[0].id,
            "start": local_instant(day, "12:00", zone).isoformat(),
            "end": local_instant(day, "13:00", zone).isoformat()}]})
    assert unreviewed_leave.status_code == 422


@pytest.mark.parametrize("start_date,end_date", [
    ("2026-10-27", "2026-10-26"),
    ("2026-10-26", "2026-11-09"),
])
def test_real_date_range_is_rejected_before_source_read(
        tmp_path, monkeypatch, start_date, end_date):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "load_snapshot", lambda *_: pytest.fail("source was read"))
    monkeypatch.setattr(module, "latest_rules", lambda *_: pytest.fail("rules were read"))
    client = TestClient(app)

    preview = client.get(f"/api/source-preview/hurstville?start_date={start_date}&end_date={end_date}")
    assert preview.status_code == 422
    solve_response = client.post("/api/solve", json={
        "store_id": "hurstville", "start_date": start_date,
        "end_date": end_date, "source": "REAL", "mode": "STRICT",
        "leave_data_complete": True,
    })
    assert solve_response.status_code == 422
    assert not (tmp_path / "lab.sqlite3").exists()


def test_source_preview_accepts_fourteen_day_boundary(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    seen = []
    snapshot = demo_snapshot(date(2026, 10, 26), store_id="hurstville")
    def load(store_id, start, end, cookie, timezone_name, minimum_rest_minutes):
        seen.append((start, end, timezone_name))
        return snapshot
    monkeypatch.setattr(module, "load_snapshot", load)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})

    response = TestClient(app).get(
        "/api/source-preview/hurstville?start_date=2026-10-26&end_date=2026-11-08")
    assert response.status_code == 200
    assert seen == [(date(2026, 10, 26), date(2026, 11, 8), "Australia/Sydney")]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_preview_and_solve_read_same_personal_rest_window(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})
    rules = demo_rules("hurstville")
    saved = storage.save_rules(rules)
    snapshot = demo_snapshot(date(2026, 10, 26), store_id="hurstville")
    snapshot.source = "REAL"
    seen = []

    def load(store_id, start, end, cookie, timezone_name, minimum_rest_minutes):
        seen.append(minimum_rest_minutes)
        return snapshot

    monkeypatch.setattr(module, "load_snapshot", load)
    client = TestClient(app)
    preview = client.get(
        "/api/source-preview/hurstville?start_date=2026-10-26&end_date=2026-10-26")
    assert preview.status_code == 200
    run = client.post("/api/solve", json={
        "store_id": "hurstville", "start_date": "2026-10-26", "end_date": "2026-10-26",
        "source": "REAL", "mode": "STRICT", "run_purpose": "EXPLORATORY",
        "replace_target_published_for_comparison": True,
        "expected_rule_version": saved.version,
        "expected_source_version": preview.json()["snapshot_version"],
    })
    assert run.status_code == 200
    assert seen == [0, 0]


def test_real_preview_uses_roster_store_timezone(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    seen = []
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Adelaide"}, "active_templates": []})

    def load(store_id, start, end, cookie, timezone_name, minimum_rest_minutes):
        seen.append(timezone_name)
        return demo_snapshot(start, store_id, timezone_name)

    monkeypatch.setattr(module, "load_snapshot", load)
    response = TestClient(app).get(
        "/api/source-preview/adelaide?start_date=2026-10-26&end_date=2026-10-26")
    assert response.status_code == 200
    assert response.json()["timezone"] == "Australia/Adelaide"
    assert seen == ["Australia/Adelaide"]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_solve_rejects_stale_timezone_before_snapshot(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "latest_rules", lambda store_id: demo_rules(store_id))
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Adelaide"}, "active_templates": []})
    monkeypatch.setattr(module, "load_snapshot", lambda *_: pytest.fail("source was read"))
    response = TestClient(app).post("/api/solve", json={
        "store_id": "adelaide", "start_date": "2026-10-26", "end_date": "2026-10-26",
        "run_purpose": "EXPLORATORY", "replace_target_published_for_comparison": True,
        "expected_rule_version": "mock-v1",
        "expected_source_version": "preview-version",
        "source": "REAL", "leave_data_complete": True,
    })
    assert response.status_code == 422
    assert "timezone" in response.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_rule_save_rejects_store_timezone_mismatch_without_version(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Adelaide"}, "active_templates": []})
    monkeypatch.setattr(module, "_evaluate", lambda *_: pytest.fail("jobs were read"))
    response = TestClient(app).post("/api/rules/adelaide",
        json=demo_rules("adelaide").current_payload())
    assert response.status_code == 422
    assert "timezone" in response.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_rule_save_accepts_matching_store_timezone(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Adelaide"}, "active_templates": []})
    monkeypatch.setattr(module, "_evaluate", lambda *_: [
        {"id": "service", "isActive": True}])
    rules = demo_rules("adelaide").model_copy(update={"timezone": "Australia/Adelaide"})
    response = TestClient(app).post("/api/rules/adelaide",
        json=rules.current_payload(),
        headers={"cookie": "evaluate_molly_session=test-session"})
    assert response.status_code == 200
    assert response.json()["timezone"] == "Australia/Adelaide"
    assert response.json()["version"] == "adelaide:v1"
    assert (tmp_path / "lab.sqlite3").exists()


def test_lab_confirmed_timezone_allows_missing_roster_settings_only(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "_evaluate", lambda *_: [
        {"id": "service", "isActive": True}])
    hints = {"settings": None, "active_templates": []}
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: hints)
    observed = []

    def load(store_id, start, end, cookie, timezone_name, minimum_rest_minutes,
             *, timezone_source="ROSTER"):
        observed.append((timezone_name, timezone_source))
        snapshot = demo_snapshot(start, store_id, timezone_name)
        snapshot.source = "REAL"
        return snapshot

    monkeypatch.setattr(module, "load_snapshot", load)
    client = TestClient(app)
    rule = demo_rules("missing-settings", "Australia/Adelaide").model_copy(
        update={"timezone_source": "LAB_CONFIRMED"})
    saved = client.post("/api/rules/missing-settings", json=rule.current_payload(),
                        headers={"cookie": "evaluate_molly_session=test"})
    assert saved.status_code == 200
    assert saved.json()["timezone_source"] == "LAB_CONFIRMED"
    preview = client.get(
        "/api/source-preview/missing-settings?start_date=2026-10-26&end_date=2026-10-26")
    assert preview.status_code == 200
    assert preview.json()["timezone"] == "Australia/Adelaide"
    assert preview.json()["timezone_source"] == "LAB_CONFIRMED"
    assert observed == [("Australia/Adelaide", "LAB_CONFIRMED")]

    candidate = client.post("/api/solve", json={
        "store_id": "missing-settings", "start_date": "2026-10-26",
        "end_date": "2026-10-26", "expected_rule_version": saved.json()["version"],
        "expected_source_version": preview.json()["snapshot_version"],
        "source": "REAL", "mode": "STRICT", "run_purpose": "EXPLORATORY",
        "replace_target_published_for_comparison": True,
    })
    assert candidate.status_code == 200
    assert candidate.json()["source"] == "REAL"
    assert candidate.json()["rule_version"] == saved.json()["version"]
    assert candidate.json()["parameters"]["timezone_source"] == "LAB_CONFIRMED"
    assert observed == [("Australia/Adelaide", "LAB_CONFIRMED")] * 2

    # A later formal setting cannot be silently superseded by the Lab rule.
    hints["settings"] = {"timezone": "Australia/Sydney"}
    changed = client.get(
        "/api/source-preview/missing-settings?start_date=2026-10-26&end_date=2026-10-26")
    assert changed.status_code == 503
    assert "Roster now has" in changed.json()["detail"]
    assert len(observed) == 2


def test_lab_timezone_cannot_override_existing_or_invalid_roster_setting(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "_evaluate", lambda *_: pytest.fail("jobs were read"))
    hints = {"settings": {"timezone": "Australia/Sydney"}, "active_templates": []}
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: hints)
    rule = demo_rules("existing-settings").model_copy(update={"timezone_source": "LAB_CONFIRMED"})
    client = TestClient(app)
    for timezone_value in ("Australia/Sydney", None, "Not/AZone"):
        hints["settings"] = {"timezone": timezone_value}
        response = client.post("/api/rules/existing-settings", json=rule.current_payload())
        assert response.status_code == 503
        assert "timezone" in response.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


def test_real_rule_save_rejects_unknown_pattern_role_without_version(tmp_path, monkeypatch):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": {"timezone": "Australia/Sydney"}, "active_templates": []})
    monkeypatch.setattr(module, "_evaluate", lambda *_: [
        {"id": "service", "isActive": True}])
    rules = demo_rules("hurstville")
    rules.base_day.patterns[0].role_code = "manager"

    response = TestClient(app).post("/api/rules/hurstville",
        json=rules.current_payload(),
        headers={"cookie": "evaluate_molly_session=test-session"})

    assert response.status_code == 422
    assert "manager" in response.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()


@pytest.mark.parametrize("settings", [None, {"timezone": "Not/AZone"}])
def test_real_preview_rejects_missing_or_bad_store_timezone(tmp_path, monkeypatch, settings):
    module = import_module("api.app")
    monkeypatch.setattr(storage, "DATA_FILE", tmp_path / "lab.sqlite3")
    monkeypatch.setattr(module, "require_store", lambda *_: None)
    monkeypatch.setattr(module, "read_roster_rule_hints", lambda *_: {
        "settings": settings, "active_templates": []})
    monkeypatch.setattr(module, "load_snapshot", lambda *_: pytest.fail("source was read"))
    response = TestClient(app).get(
        "/api/source-preview/adelaide?start_date=2026-10-26&end_date=2026-10-26")
    assert response.status_code == 503
    assert "timezone" in response.json()["detail"]
    assert not (tmp_path / "lab.sqlite3").exists()

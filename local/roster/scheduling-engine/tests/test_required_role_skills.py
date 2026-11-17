from datetime import date

import pytest

from adapters.real import SourceReadError, effective_job_skill_requirements
from engine.candidates import generate_candidates
from engine.clock import local_instant, timezone_for
from engine.config import compile_rules
from engine.models import AssignedShift, ExistingShift, SolveStatus
from engine.solver import solve
from engine.validation import verify_result
from fixtures.demo import demo_rules, demo_snapshot


DAY = date(2026, 10, 26)


def test_current_store_role_skills_override_global_role_for_formal_job():
    jobs = [{"id": "job-service", "code": "service", "isActive": True}]
    roles = [
        {"id": "global", "code": "service", "storeId": None, "isActive": True,
         "requiredSkillCodes": ["global-skill"]},
        {"id": "local", "code": "service", "storeId": "target", "isActive": True,
         "requiredSkillCodes": ["local-skill"]},
        {"id": "retired", "code": "service", "storeId": "other", "isActive": False,
         "requiredSkillCodes": ["retired-skill"]},
    ]
    assert effective_job_skill_requirements(jobs, roles, "target",
        {"global": "job-service", "local": "job-service"}) == {
            "job-service": {"local-skill"}}


def test_exact_formal_code_precedes_store_legacy_alias():
    jobs = [{"id": "job-full", "code": "full-role", "isActive": True}]
    roles = [
        {"id": "global-exact", "code": "full-role", "storeId": None, "isActive": True,
         "requiredSkillCodes": ["direct-skill"]},
        {"id": "store-alias", "code": "all-rounder", "storeId": "target", "isActive": True,
         "requiredSkillCodes": ["alias-skill"]},
    ]
    assert effective_job_skill_requirements(jobs, roles, "target",
        {"global-exact": "job-full", "store-alias": "job-full"}) == {
            "job-full": {"direct-skill"}}


@pytest.mark.parametrize("skills", [None, [""], ["valid", 3]])
def test_malformed_active_roster_skill_requirement_fails_closed(skills):
    jobs = [{"id": "job-service", "code": "service", "isActive": True}]
    roles = [{"id": "local", "code": "service", "storeId": "target", "isActive": True,
              "requiredSkillCodes": skills}]
    with pytest.raises(SourceReadError, match="required skills"):
        effective_job_skill_requirements(jobs, roles, "target", {"local": "job-service"})


def test_required_roster_role_skill_filters_candidate_and_independent_replay():
    snapshot = demo_snapshot(DAY, count=4)
    rules = demo_rules()
    snapshot.role_required_skills = {"service": {"opening"}}
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors

    candidates, errors = generate_candidates(snapshot, rules, days)
    assert not errors
    assert candidates and not any(candidate.employee_id == "demo-03" for candidate in candidates)

    zone = timezone_for(snapshot.timezone)
    proposed = AssignedShift(employee_id="demo-03", employee_name="Demo employee 3",
        store_id=snapshot.store_id, date=DAY, pattern_name="Early", role_code="service",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone),
        breaks=[(local_instant(DAY, "12:00", zone), local_instant(DAY, "12:30", zone))],
        net_work_minutes=390)
    assert any("required skills" in error for error in
               verify_result(snapshot, rules, days, [proposed], "BEST_EFFORT"))

    strict = solve(snapshot, rules, DAY, DAY)
    assert strict.status == SolveStatus.INFEASIBLE


def test_published_shift_without_current_required_skill_needs_review():
    snapshot = demo_snapshot(DAY, count=1)
    snapshot.role_required_skills = {"service": {"milk-bar"}}
    zone = timezone_for(snapshot.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="published",
        employee_id="demo-00", store_id=snapshot.store_id, role_code="service",
        status="PUBLISHED", start=local_instant(DAY, "10:00", zone),
        end=local_instant(DAY, "17:00", zone), break_minutes_unknown=30))

    result = solve(snapshot, demo_rules(), DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "LOCKED_QUALIFICATION"

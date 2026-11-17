from datetime import date, datetime, timedelta, timezone

from adapters.reference import (comparison_snapshot, observed_published_shifts,
                                published_shift_source_alignment)
from engine.clock import local_instant, timezone_for
from engine.models import ExistingShift, TimeWindow
from fixtures.demo import demo_snapshot


def test_repeated_local_hour_keeps_distinct_published_shift_references():
    day = date(2026, 4, 5)  # Sydney's daylight-saving fall-back day.
    snapshot = demo_snapshot(day, store_id="hurstville")
    snapshot.existing_shifts.clear()
    first = datetime(2026, 4, 4, 15, 15, tzinfo=timezone.utc)
    second = first + timedelta(hours=1)
    for index, start in enumerate((first, second)):
        snapshot.existing_shifts.append(ExistingShift(
            source_shift_id=f"shift-{index}", employee_id=snapshot.employees[index].id,
            store_id="hurstville", role_code="service", status="PUBLISHED",
            start=start, end=start + timedelta(minutes=30)))

    rows = observed_published_shifts(snapshot, day, day)
    assert len(rows) == 2
    assert [row["start"] for row in rows] == ["02:15", "02:15"]
    assert [row["end"] for row in rows] == ["02:45", "02:45"]
    assert rows[0]["start_instant"] != rows[1]["start_instant"]
    assert all(row["assigned_people"] == 1 for row in rows)


def test_previous_day_overnight_shift_appears_in_selected_day_reference_but_remains_fixed_in_comparison():
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville", count=3)
    snapshot.existing_shifts.clear()
    zone = timezone_for(snapshot.timezone)
    previous = ExistingShift(source_shift_id="previous-overnight", employee_id=snapshot.employees[0].id,
        store_id="hurstville", role_code="service", status="PUBLISHED",
        start=local_instant(day - timedelta(days=1), "22:00", zone),
        end=local_instant(day, "02:00", zone))
    target = ExistingShift(source_shift_id="target", employee_id=snapshot.employees[1].id,
        store_id="hurstville", role_code="service", status="PUBLISHED",
        start=local_instant(day, "10:00", zone), end=local_instant(day, "17:00", zone))
    later = ExistingShift(source_shift_id="later", employee_id=snapshot.employees[2].id,
        store_id="hurstville", role_code="service", status="PUBLISHED",
        start=local_instant(day + timedelta(days=1), "22:00", zone),
        end=local_instant(day + timedelta(days=2), "02:00", zone))
    snapshot.existing_shifts.extend([previous, target, later])

    reference = observed_published_shifts(snapshot, day, day)
    assert [(row["date"], row["start"], row["end"]) for row in reference] == [
        ((day - timedelta(days=1)).isoformat(), "22:00", "02:00"),
        (day.isoformat(), "10:00", "17:00"),
    ]
    comparison, removed = comparison_snapshot(snapshot, day, day)
    assert removed == 1
    assert [shift.source_shift_id for shift in comparison.existing_shifts] == [
        "previous-overnight", "later"]


def test_reference_only_groups_same_instants_role_and_break_duration():
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville")
    snapshot.existing_shifts.clear()
    start = datetime(2026, 10, 25, 23, tzinfo=timezone.utc)
    end = start + timedelta(hours=7)
    variants = [
        (start, end, "service", 0),
        (start, end, "service", 0),
        (start, end, "full-role", 0),
        (start, end, "service", 30),
        (start + timedelta(hours=1), end, "service", 0),
    ]
    for index, (begin, finish, role, break_minutes) in enumerate(variants):
        snapshot.existing_shifts.append(ExistingShift(
            source_shift_id=f"shift-{index}", employee_id=snapshot.employees[index].id,
            store_id="hurstville", role_code=role, status="PUBLISHED",
            break_minutes_unknown=break_minutes, start=begin, end=finish))

    rows = observed_published_shifts(snapshot, day, day)
    assert len(rows) == 4
    assert sorted(row["assigned_people"] for row in rows) == [1, 1, 1, 2]
    grouped = next(row for row in rows if row["assigned_people"] == 2)
    assert (grouped["start"], grouped["end"], grouped["role_code"], grouped["break_minutes"]) == (
        "10:00", "17:00", "service", 0)


def test_published_source_alignment_counts_current_role_and_full_availability_only():
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville", count=3)
    zone = timezone_for(snapshot.timezone)
    begin = local_instant(day, "10:00", zone)
    finish = local_instant(day, "17:00", zone)
    snapshot.employees[1].qualified_roles.clear()
    snapshot.employees[0].opening_qualified = False
    snapshot.availability[2] = TimeWindow(employee_id=snapshot.employees[2].id,
        start=local_instant(day, "12:00", zone), end=local_instant(day, "23:00", zone))
    for index, employee in enumerate(snapshot.employees):
        snapshot.existing_shifts.append(ExistingShift(source_shift_id=f"shift-{index}",
            employee_id=employee.id, store_id="hurstville", role_code="service",
            status="PUBLISHED", start=begin, end=finish))
    rows = published_shift_source_alignment(snapshot, day, day)
    assert len(rows) == 1
    assert rows[0]["assigned_people"] == 3
    assert rows[0]["role_and_availability_pool"] == 1
    assert rows[0]["opening_qualified_role_and_availability_pool"] == 0
    assert rows[0]["role_availability_no_external_overlap_pool"] == 1
    assert rows[0]["opening_qualified_no_external_overlap_pool"] == 0
    assert rows[0]["assigned_without_current_role"] == 1
    assert rows[0]["assigned_without_full_availability"] == 1
    assert all(employee.name not in str(rows) for employee in snapshot.employees)
    snapshot.employees[0].opening_qualified = True
    assert published_shift_source_alignment(snapshot, day, day)[0][
        "opening_qualified_role_and_availability_pool"] == 1


def test_published_alignment_separates_formal_role_from_required_skill_pool():
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville", count=4)
    snapshot.role_required_skills = {"service": {"opening"}}
    zone = timezone_for(snapshot.timezone)
    begin = local_instant(day, "10:00", zone)
    finish = local_instant(day, "17:00", zone)
    for index, employee in enumerate(snapshot.employees):
        snapshot.existing_shifts.append(ExistingShift(source_shift_id=f"shift-{index}",
            employee_id=employee.id, store_id=snapshot.store_id, role_code="service",
            status="PUBLISHED", start=begin, end=finish))

    row = published_shift_source_alignment(snapshot, day, day)[0]

    assert row["role_and_availability_pool"] == 4
    assert row["role_skill_availability_pool"] == 3
    assert row["role_skill_availability_no_external_overlap_pool"] == 3
    assert row["assigned_without_required_skills"] == 1


def test_published_alignment_excludes_known_external_overlap_without_excluding_adjacent_shift():
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville", count=3)
    zone = timezone_for(snapshot.timezone)
    begin = local_instant(day, "10:00", zone)
    finish = local_instant(day, "17:00", zone)
    snapshot.employees[0].opening_qualified = True
    snapshot.employees[1].opening_qualified = True
    snapshot.employees[2].opening_qualified = False
    snapshot.existing_shifts.extend([
        ExistingShift(source_shift_id="target", employee_id=snapshot.employees[0].id,
            store_id="hurstville", role_code="service", status="PUBLISHED",
            start=begin, end=finish),
        ExistingShift(source_shift_id="external-overlap", employee_id=snapshot.employees[0].id,
            store_id="green-square", role_code="service", status="PUBLISHED",
            start=local_instant(day, "12:00", zone), end=local_instant(day, "13:00", zone)),
        ExistingShift(source_shift_id="external-adjacent", employee_id=snapshot.employees[1].id,
            store_id="green-square", role_code="service", status="PUBLISHED",
            start=finish, end=local_instant(day, "18:00", zone)),
    ])

    row = published_shift_source_alignment(snapshot, day, day)[0]
    assert row["role_and_availability_pool"] == 3
    assert row["opening_qualified_role_and_availability_pool"] == 2
    assert row["role_availability_no_external_overlap_pool"] == 2
    assert row["opening_qualified_no_external_overlap_pool"] == 1


def test_published_alignment_only_counts_target_store_employees():
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville", count=2)
    zone = timezone_for(snapshot.timezone)
    snapshot.employees[1].store_id = "green-square"
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="target",
        employee_id=snapshot.employees[0].id, store_id="hurstville",
        role_code="service", status="PUBLISHED",
        start=local_instant(day, "10:00", zone),
        end=local_instant(day, "17:00", zone)))

    row = published_shift_source_alignment(snapshot, day, day)[0]
    assert row["role_and_availability_pool"] == 1
    assert row["role_availability_no_external_overlap_pool"] == 1


def test_comparison_detaches_only_target_store_published_assignments():
    day = date(2026, 10, 26)
    snapshot = demo_snapshot(day, store_id="hurstville")
    snapshot.existing_shifts.clear()
    zone = timezone_for(snapshot.timezone)
    cases = [
        ("target", "hurstville", "PUBLISHED", day),
        ("previous", "hurstville", "PUBLISHED", day - timedelta(days=1)),
        ("other-store", "green-square", "PUBLISHED", day),
        ("locked", "hurstville", "LOCKED", day),
    ]
    for index, (shift_id, store, status, shift_day) in enumerate(cases):
        snapshot.existing_shifts.append(ExistingShift(
            source_shift_id=shift_id, employee_id=snapshot.employees[index].id,
            store_id=store, role_code="service", status=status,
            start=local_instant(shift_day, "10:00", zone),
            end=local_instant(shift_day, "17:00", zone)))

    manual_reference = observed_published_shifts(snapshot, day, day)
    comparison, removed = comparison_snapshot(snapshot, day, day)

    assert removed == 1
    assert [shift.source_shift_id for shift in comparison.existing_shifts] == [
        "previous", "other-store", "locked"]
    assert [shift.source_shift_id for shift in snapshot.existing_shifts] == [
        "target", "previous", "other-store", "locked"]
    assert len(manual_reference) == 1
    assert comparison.version != snapshot.version

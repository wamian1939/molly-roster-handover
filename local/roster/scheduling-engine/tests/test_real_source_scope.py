from datetime import date, datetime, timezone

import pytest

from adapters import real
from engine.candidates import completely_available
from engine.models import StaffMember


@pytest.mark.parametrize("payload", [
    {},
    {"stores": "not-a-list"},
    {"stores": [{"id": "target", "isActive": "false"}]},
    {"stores": [{"id": "", "isActive": True}]},
    {"stores": [{"id": "target", "isActive": True},
                {"id": "target", "isActive": False}]},
])
def test_malformed_accessible_store_list_fails_closed(monkeypatch, payload):
    monkeypatch.setattr(real, "_evaluate", lambda *_: payload)
    with pytest.raises(real.SourceReadError, match="store list.*source contract"):
        real.accessible_stores("evaluate_molly_session=test")


def test_accessible_store_list_excludes_inactive_boolean(monkeypatch):
    monkeypatch.setattr(real, "_evaluate", lambda *_: {"stores": [
        {"id": "active", "isActive": True},
        {"id": "inactive", "isActive": False},
    ]})
    assert real.accessible_stores("evaluate_molly_session=test") == [
        {"id": "active", "isActive": True}]


def test_evaluate_official_score_is_read_without_rounding_or_default(monkeypatch):
    rows = [
        {"id": "scored", "displayName": "Scored", "isActive": True,
         "positions": [], "skillSummary": {"qualifiedSkillCodes": [],
         "operations": {"opening": "NO"}},
         "officialScore": {"score": 73.3, "tier": "T2", "roundId": "closed-1"}},
        {"id": "unscored", "displayName": "Unscored", "isActive": True,
         "positions": [], "skillSummary": {"qualifiedSkillCodes": [],
         "operations": {"opening": "NO"}}, "officialScore": None},
    ]
    monkeypatch.setattr(real, "_evaluate", lambda *_: {
        "workforceRevision": "revision", "employees": rows,
        "pagination": {"page": 1, "pageSize": 100, "total": 2, "hasMore": False}})

    employees, revision = real._employees("hurstville", "evaluate_molly_session=test")

    assert revision == "revision"
    assert [(employee.id, employee.score) for employee in employees] == [
        ("scored", 73.3), ("unscored", None)]


def test_roster_shift_read_keeps_target_store_and_cross_store_staff_only(monkeypatch):
    class Cursor:
        def __init__(self):
            self.queries = []
            self.statement = ""

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, parameters=None):
            self.statement = statement
            self.queries.append((statement, parameters))

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Sydney"}]
            return []

    class Connection:
        def __init__(self, cursor):
            self.saved_cursor = cursor

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return self.saved_cursor

    cursor = Cursor()
    employees = [StaffMember(id="employee-a", name="A", store_id="target"),
                 StaffMember(id="employee-b", name="B", store_id="target")]
    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (employees, "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", lambda: Connection(cursor))

    snapshot = real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                                  "evaluate_molly_session=test", "Australia/Sydney")

    assert snapshot.store_id == "target"
    statement, parameters = next((sql, values) for sql, values in cursor.queries
                                 if "FROM shift_assignments" in sql)
    assert '(s."storeId" = %s OR a."employeeId" = ANY(%s))' in statement
    assert parameters[2:] == ("target", ["employee-a", "employee-b"])


def test_real_snapshot_reads_current_roster_role_skill_requirements(monkeypatch):
    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Sydney"}]
            if "FROM shift_roles" in self.statement:
                assert '"requiredSkillCodes"' in self.statement
                return [{"id": "role-service", "storeId": "target", "code": "service",
                         "nameZh": "Service", "isActive": True,
                         "requiredSkillCodes": ["milk-bar"]}]
            return []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target",
                     qualified_roles={"job-service"})], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [
        {"id": "job-service", "code": "service", "name": "Service", "isActive": True}])
    monkeypatch.setattr(real, "_roster_connection", Connection)

    snapshot = real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                                  "evaluate_molly_session=test", "Australia/Sydney")

    assert snapshot.role_required_skills == {"job-service": {"milk-bar"}}


def test_roster_shift_read_reaches_configured_long_rest_window(monkeypatch):
    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, parameters=None):
            if "FROM shift_assignments" in statement:
                self.shift_parameters = parameters
            self.statement = statement

        def fetchall(self):
            return [{"timezone": "Australia/Sydney"}] if "FROM roster_store_settings" in self.statement else []

    class Connection:
        def __init__(self, cursor):
            self.saved_cursor = cursor

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return self.saved_cursor

    cursor = Cursor()
    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", lambda: Connection(cursor))

    day = date(2026, 10, 26)
    real.load_snapshot("target", day, day, "evaluate_molly_session=test",
                       "Australia/Sydney", minimum_rest_minutes=8 * 24 * 60)

    to_instant, from_instant, *_ = cursor.shift_parameters
    assert from_instant == datetime(2026, 10, 16, 13)
    assert to_instant == datetime(2026, 11, 4, 13)


def test_roster_timezone_change_between_hint_and_snapshot_fails_closed(monkeypatch):
    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Adelaide"}]
            raise AssertionError("Scheduling rows must not be read with a stale timezone")

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", Connection)

    with pytest.raises(real.SourceReadError, match="timezone changed"):
        real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                           "evaluate_molly_session=test", "Australia/Sydney")


@pytest.mark.parametrize("roster_timezone, succeeds", [(None, True),
                                                        ("Australia/Sydney", False)])
def test_lab_confirmed_timezone_requires_formal_setting_still_absent(
        monkeypatch, roster_timezone, succeeds):
    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [] if roster_timezone is None else [{"timezone": roster_timezone}]
            if not succeeds:
                raise AssertionError("Scheduling rows must not be read after Roster timezone appears")
            return []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", Connection)
    if succeeds:
        snapshot = real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
            "evaluate_molly_session=test", "Australia/Sydney",
            timezone_source="LAB_CONFIRMED")
        assert snapshot.timezone == "Australia/Sydney"
        assert snapshot.source == "REAL"
    else:
        with pytest.raises(real.SourceReadError, match="timezone appeared"):
            real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                "evaluate_molly_session=test", "Australia/Sydney",
                timezone_source="LAB_CONFIRMED")


@pytest.mark.parametrize("timezone_source,first,later", [
    ("ROSTER", "Australia/Sydney", "Australia/Adelaide"),
    ("LAB_CONFIRMED", None, "Australia/Sydney"),
])
def test_timezone_change_during_roster_snapshot_fails_before_result(
        monkeypatch, timezone_source, first, later):
    reads = {"connections": 0}

    class Cursor:
        def __init__(self, timezone_name):
            self.timezone_name = timezone_name

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return ([] if self.timezone_name is None else
                        [{"timezone": self.timezone_name}])
            return []

    class Connection:
        def __init__(self, timezone_name):
            self.timezone_name = timezone_name

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor(self.timezone_name)

    def connect():
        reads["connections"] += 1
        return Connection(first if reads["connections"] == 1 else later)

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", connect)

    with pytest.raises(real.SourceReadError, match="timezone changed|timezone appeared"):
        real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
            "evaluate_molly_session=test", "Australia/Sydney",
            timezone_source=timezone_source)
    assert reads["connections"] == 2


@pytest.mark.parametrize("changed_source", ["employee", "job"])
def test_real_snapshot_rejects_evaluate_changes_across_roster_read(monkeypatch, changed_source):
    class EmptyCursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Sydney"}]
            return []

    class EmptyConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return EmptyCursor()

    reads = {"employees": 0, "jobs": 0}

    def employees(*_args):
        reads["employees"] += 1
        score = 61 if changed_source == "employee" and reads["employees"] == 2 else 60
        return [StaffMember(id="employee-a", name="A", store_id="target", score=score)], "revision"

    def jobs(*_args):
        reads["jobs"] += 1
        code = "closing" if changed_source == "job" and reads["jobs"] == 2 else "service"
        return [{"id": "job-a", "code": code, "isActive": True}]

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", employees)
    monkeypatch.setattr(real, "_evaluate", jobs)
    monkeypatch.setattr(real, "_roster_connection", EmptyConnection)

    with pytest.raises(real.SourceReadError, match="changed during the Roster source read"):
        real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                           "evaluate_molly_session=test", "Australia/Sydney")

    assert reads == {"employees": 2, "jobs": 2}


def test_evaluate_duplicate_employee_across_pages_fails_closed(monkeypatch):
    def evaluate(path, _cookie):
        page = 2 if "page=2&" in path else 1
        ids = ["one"] if page == 2 else ["one", *[f"employee-{i}" for i in range(1, 100)]]
        return {"workforceRevision": "same-revision",
                "employees": [{"id": employee_id, "displayName": employee_id, "isActive": True,
                               "positions": [], "skillSummary": {"qualifiedSkillCodes": [],
                               "operations": {"opening": "NO"}}, "officialScore": None}
                              for employee_id in ids],
                "pagination": {"page": page, "pageSize": 100, "total": 101,
                               "hasMore": page == 1}}

    monkeypatch.setattr(real, "_evaluate", evaluate)
    with pytest.raises(real.SourceReadError, match="same active employee more than once"):
        real._employees("target", "evaluate_molly_session=test")


@pytest.mark.parametrize("pagination, count", [
    ({"page": 1, "pageSize": 100, "total": 2, "hasMore": False}, 1),
    ({"page": 2, "pageSize": 100, "total": 1, "hasMore": False}, 1),
    ({"page": 1, "pageSize": 99, "total": 1, "hasMore": False}, 1),
    ({"page": 1, "pageSize": 100, "total": "1", "hasMore": False}, 1),
    ({"page": 1, "pageSize": 100, "total": 1, "hasMore": True}, 1),
    ({"page": 1, "pageSize": 100, "total": 101, "hasMore": True}, 0),
])
def test_malformed_evaluate_pagination_fails_closed(monkeypatch, pagination, count):
    employee = {"id": "one", "displayName": "One", "isActive": True,
                "positions": [], "skillSummary": {"qualifiedSkillCodes": [],
                "operations": {"opening": "NO"}}, "officialScore": None}
    calls = []

    def evaluate(path, _cookie):
        calls.append(path)
        return {"workforceRevision": "revision", "employees": [employee] * count,
                "pagination": pagination}

    monkeypatch.setattr(real, "_evaluate", evaluate)
    with pytest.raises(real.SourceReadError, match="pagination.*source contract"):
        real._employees("target", "evaluate_molly_session=test")
    assert len(calls) == 1


def test_roster_duplicate_shift_assignment_fails_before_reference_counts(monkeypatch):
    same_row = {"sourceShiftId": "shift-one", "employeeId": "employee-a",
                "storeId": "target", "startAt": datetime(2026, 10, 25, 23, tzinfo=timezone.utc),
                "endAt": datetime(2026, 10, 26, 6, tzinfo=timezone.utc),
                "breakMinutes": 0, "shiftRoleId": "role-one", "status": "PUBLISHED"}

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Sydney"}]
            return [same_row, same_row] if "FROM shift_assignments" in self.statement else []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", Connection)

    with pytest.raises(real.SourceReadError, match="duplicate shift assignment"):
        real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                           "evaluate_molly_session=test", "Australia/Sydney")


@pytest.mark.parametrize("malformed", ["missing_revision", "missing_skill_summary"])
def test_malformed_evaluate_workforce_reports_source_contract_error(monkeypatch, malformed):
    raw = {"id": "one", "displayName": "One", "isActive": True,
           "positions": [], "skillSummary": {"qualifiedSkillCodes": [],
           "operations": {"opening": "NO"}}, "officialScore": None}
    payload = {"workforceRevision": "revision", "employees": [raw],
               "pagination": {"page": 1, "pageSize": 100, "total": 1,
                              "hasMore": False}}
    if malformed == "missing_revision":
        del payload["workforceRevision"]
    else:
        del raw["skillSummary"]
    monkeypatch.setattr(real, "_evaluate", lambda *_: payload)

    with pytest.raises(real.SourceReadError, match="scheduling source contract"):
        real._employees("target", "evaluate_molly_session=test")


@pytest.mark.parametrize("field,value", [("breakMinutes", -5), ("status", "LOCKED")])
def test_invalid_roster_shift_row_reports_source_contract_error(monkeypatch, field, value):
    row = {"sourceShiftId": "shift-one", "employeeId": "employee-a",
           "storeId": "target", "startAt": datetime(2026, 10, 25, 23, tzinfo=timezone.utc),
           "endAt": datetime(2026, 10, 26, 6, tzinfo=timezone.utc),
           "breakMinutes": 0, "shiftRoleId": "role-one", "status": "PUBLISHED"}
    row[field] = value

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Sydney"}]
            return [row] if "FROM shift_assignments" in self.statement else []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", Connection)

    with pytest.raises(real.SourceReadError, match="scheduling source contract"):
        real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                           "evaluate_molly_session=test", "Australia/Sydney")


def test_available_row_without_clock_times_is_a_source_error(monkeypatch):
    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Sydney"}]
            if "FROM employee_availability" in self.statement:
                return [{"employeeId": "employee-a", "status": "AVAILABLE", "startAt": None, "endAt": None,
                         "date": date(2026, 10, 26)}]
            return []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", Connection)

    with pytest.raises(real.SourceReadError, match="AVAILABLE.*start and end"):
        real.load_snapshot("target", date(2026, 10, 26), date(2026, 10, 26),
                           "evaluate_molly_session=test", "Australia/Sydney")


def test_explicit_unavailable_interval_vetoes_overlapping_available_source(monkeypatch):
    day = date(2026, 10, 26)
    available_start = datetime(2026, 10, 25, 23, tzinfo=timezone.utc)
    unavailable_start = datetime(2026, 10, 26, 3, tzinfo=timezone.utc)
    unavailable_end = datetime(2026, 10, 26, 4, tzinfo=timezone.utc)
    available_end = datetime(2026, 10, 26, 6, tzinfo=timezone.utc)

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, _parameters=None):
            self.statement = statement

        def fetchall(self):
            if "FROM roster_store_settings" in self.statement:
                return [{"timezone": "Australia/Sydney"}]
            if "FROM employee_availability" in self.statement:
                assert "status" in self.statement and "status = 'AVAILABLE'" not in self.statement
                return [
                    {"employeeId": "employee-a", "status": "AVAILABLE", "startAt": available_start,
                     "endAt": available_end, "date": day},
                    {"employeeId": "employee-a", "status": "UNAVAILABLE", "startAt": unavailable_start,
                     "endAt": unavailable_end, "date": day},
                ]
            return []

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def cursor(self):
            return Cursor()

    monkeypatch.setattr(real, "accessible_stores", lambda *_: [{"id": "target"}])
    monkeypatch.setattr(real, "_employees", lambda *_: (
        [StaffMember(id="employee-a", name="A", store_id="target")], "revision"))
    monkeypatch.setattr(real, "_evaluate", lambda *_: [])
    monkeypatch.setattr(real, "_roster_connection", Connection)

    snapshot = real.load_snapshot("target", day, day,
                                  "evaluate_molly_session=test", "Australia/Sydney")
    assert [(window.start, window.end) for window in snapshot.availability] == [
        (available_start, unavailable_start), (unavailable_end, available_end)]
    assert completely_available("employee-a", available_start, available_end, snapshot.availability) is False
    assert completely_available("employee-a", available_start, unavailable_start, snapshot.availability) is True
    assert completely_available("employee-a", unavailable_end, available_end, snapshot.availability) is True

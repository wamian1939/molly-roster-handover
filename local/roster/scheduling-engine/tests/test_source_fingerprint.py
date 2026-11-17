from datetime import date

from adapters.real import _source_fingerprint
from engine.models import StaffMember


def fingerprint(employees, jobs=None, roles=None, availability=None, shifts=None,
                timezone_name="Australia/Sydney"):
    return _source_fingerprint("revision-1", employees, jobs or [], roles or [],
                               availability or [], shifts or [], timezone_name=timezone_name)


def test_employee_scheduling_inputs_change_real_source_version():
    original = StaffMember(id="one", name="One", store_id="store",
                           qualified_roles={"service"}, skill_codes={"opening"},
                           opening_qualified=True, score=60)
    baseline = fingerprint([original])

    for changed in (
        original.model_copy(update={"qualified_roles": {"full"}}),
        original.model_copy(update={"skill_codes": {"closing"}}),
        original.model_copy(update={"opening_qualified": False}),
        original.model_copy(update={"score": 61}),
    ):
        assert fingerprint([changed]) != baseline


def test_source_version_is_stable_when_read_rows_or_set_order_changes():
    first = StaffMember(id="one", name="One", store_id="store",
                        qualified_roles={"service", "full"}, skill_codes={"opening", "closing"})
    second = StaffMember(id="two", name="Two", store_id="store", qualified_roles={"service"})
    jobs = [{"id": "a", "code": "service"}, {"id": "b", "code": "full"}]
    roles = [{"id": "x", "code": "service"}, {"id": "y", "code": "full"}]

    assert fingerprint([first, second], jobs, roles) == fingerprint(
        [second, first.model_copy(update={"qualified_roles": {"full", "service"},
                                          "skill_codes": {"closing", "opening"}})],
        list(reversed(jobs)), list(reversed(roles)))


def test_roster_input_change_still_changes_real_source_version():
    first = StaffMember(id="one", name="One", store_id="store")
    assert fingerprint([first], shifts=[{"id": "shift", "breakMinutes": 0}]) != fingerprint(
        [first], shifts=[{"id": "shift", "breakMinutes": 60}])


def test_explicit_unavailable_change_invalidates_real_source_version():
    employee = StaffMember(id="one", name="One", store_id="store")
    available = {"employeeId": "one", "status": "AVAILABLE",
                 "startAt": "2026-10-26T10:00:00+11:00", "endAt": "2026-10-26T17:00:00+11:00"}
    unavailable = {"employeeId": "one", "status": "UNAVAILABLE",
                   "startAt": "2026-10-26T14:00:00+11:00", "endAt": "2026-10-26T15:00:00+11:00"}
    assert fingerprint([employee], availability=[available]) != fingerprint(
        [employee], availability=[available, unavailable])


def test_roster_timezone_changes_real_source_version():
    employee = StaffMember(id="one", name="One", store_id="store")
    assert fingerprint([employee], timezone_name="Australia/Sydney") != fingerprint(
        [employee], timezone_name="Australia/Adelaide")


def test_real_source_version_binds_store_and_requested_date_range():
    employee = StaffMember(id="one", name="One", store_id="store")
    def scoped(store_id, start, end):
        return _source_fingerprint("revision-1", [employee], [], [], [], [],
                                   timezone_name="Australia/Sydney",
                                   scope=(store_id, start, end))

    day = date(2026, 10, 26)
    baseline = scoped("hurstville", day, day)
    assert baseline == scoped("hurstville", day, day)
    assert baseline != scoped("other-store", day, day)
    assert baseline != scoped("hurstville", date(2026, 10, 27), date(2026, 10, 27))
    assert baseline != scoped("hurstville", day, date(2026, 11, 1))

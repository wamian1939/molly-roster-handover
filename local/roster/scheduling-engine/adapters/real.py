from __future__ import annotations

import os
import json
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
from urllib.parse import quote

import httpx
import psycopg
from psycopg.rows import dict_row

from engine.clock import local_instant, timezone_for
from engine.models import ExistingShift, Snapshot, StaffMember, TimeWindow


class SourceReadError(RuntimeError):
    pass


class SourceAuthError(SourceReadError):
    pass


class SourceAccessError(SourceReadError):
    pass


def _roster_connection():
    url = os.getenv("ROSTER_DATABASE_READONLY_URL")
    if not url:
        raise SourceReadError("ROSTER_DATABASE_READONLY_URL is required for real Roster data")
    return psycopg.connect(url, connect_timeout=5, row_factory=dict_row,
                           options="-c default_transaction_read_only=on")


def _source_fingerprint(revision: str, employees: list[StaffMember], jobs: list[dict],
                        role_rows: list[dict], availability_rows: list[dict],
                        shift_rows: list[dict], *, timezone_name: str,
                        scope: tuple[str, date, date] | None = None) -> str:
    def canonical_rows(rows: list[dict]) -> list[str]:
        return sorted(json.dumps(row, sort_keys=True, default=str, ensure_ascii=False,
                                 separators=(",", ":")) for row in rows)

    employee_rows = []
    for employee in employees:
        row = employee.model_dump(mode="json")
        row["qualified_roles"] = sorted(employee.qualified_roles)
        row["skill_codes"] = sorted(employee.skill_codes)
        employee_rows.append(row)
    payload = {"workforce_revision": revision, "store_timezone": timezone_name,
               "employees": canonical_rows(employee_rows),
               "jobs": canonical_rows(jobs),
               "roles": canonical_rows(role_rows),
               "availability": canonical_rows(availability_rows),
               "shifts": canonical_rows(shift_rows)}
    if scope is not None:
        store_id, start_date, end_date = scope
        payload["snapshot_scope"] = {"store_id": store_id,
                                     "start_date": start_date.isoformat(),
                                     "end_date": end_date.isoformat()}
    return sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"),
                             ensure_ascii=False).encode()).hexdigest()[:20]


def map_historical_shift_roles(jobs: list[dict], roles: list[dict], store_id: str) -> dict[str, str | None]:
    """Resolve historical Roster roles using the current explicit code association.

    Existing shifts may retain inactive Roster roles, but only active Evaluate
    formal jobs can authorize a canonical job ID. Ambiguous job codes fail closed.
    """
    job_by_code: dict[str, dict] = {}
    for job in jobs:
        code = job.get("code")
        if not job.get("isActive") or not code:
            continue
        if code in job_by_code and job_by_code[code]["id"] != job["id"]:
            raise SourceReadError(f"Evaluate has multiple active formal jobs with code {code}")
        job_by_code[code] = job
    mapped: dict[str, str | None] = {}
    for role in roles:
        if role.get("storeId") not in (None, store_id):
            continue
        job = job_by_code.get(role["code"])
        if job is None and role["code"] == "all-rounder" and role["nameZh"] == "全岗":
            full_job = job_by_code.get("full-role")
            if full_job is not None and full_job.get("name") == "全岗":
                job = full_job
        mapped[role["id"]] = job["id"] if job else None
    return mapped


def effective_job_skill_requirements(jobs: list[dict], roles: list[dict], store_id: str,
                                     role_to_job: dict[str, str | None]) -> dict[str, set[str]]:
    """Use the same active formal-job/shift-role precedence as the Roster UI."""
    jobs_by_id = {job["id"]: job for job in jobs if job.get("isActive")}
    selected: dict[str, tuple[tuple[bool, bool], set[str]]] = {}
    for role in roles:
        if not isinstance(role.get("isActive"), bool):
            raise SourceReadError("Roster role active state does not match the scheduling source contract")
        if not role["isActive"] or role.get("storeId") not in (None, store_id):
            continue
        job_id = role_to_job.get(role["id"])
        if job_id not in jobs_by_id:
            continue
        codes = role.get("requiredSkillCodes")
        if (not isinstance(codes, list) or any(not isinstance(code, str) or not code.strip()
                                                for code in codes) or len(codes) != len(set(codes))):
            raise SourceReadError("Roster role required skills do not match the scheduling source contract")
        priority = (role["code"] == jobs_by_id[job_id].get("code"), role["storeId"] == store_id)
        current = selected.get(job_id)
        if current is not None and current[0] == priority:
            raise SourceReadError("Multiple active Roster roles have the same formal-job priority")
        if current is None or priority > current[0]:
            selected[job_id] = (priority, set(codes))
    return {job_id: codes for job_id, (_priority, codes) in selected.items()}


def _utc(value: datetime) -> datetime:
    # Prisma stores DateTime as PostgreSQL timestamp without time zone; the
    # application writes UTC clock values into that column.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _effective_availability(rows: list[dict], known_employee_ids: set[str]) -> list[TimeWindow]:
    """Mirror Roster's explicit UNAVAILABLE veto in the positive-window snapshot."""
    available: list[TimeWindow] = []
    unavailable: dict[str, list[TimeWindow]] = {}
    for row in rows:
        employee_id = row["employeeId"]
        if employee_id not in known_employee_ids:
            continue
        status = row["status"]
        if status == "UNKNOWN":
            continue
        if status not in {"AVAILABLE", "UNAVAILABLE"}:
            raise SourceReadError("Roster availability has an unsupported status")
        start_at, end_at = row["startAt"], row["endAt"]
        if start_at is None or end_at is None:
            if status == "UNAVAILABLE" and start_at is None and end_at is None:
                continue  # Roster's interval veto ignores rows without clock intervals.
            raise SourceReadError(f"Roster {status} availability is missing start and end times")
        window = TimeWindow(employee_id=employee_id, start=_utc(start_at), end=_utc(end_at))
        if status == "AVAILABLE":
            available.append(window)
        else:
            unavailable.setdefault(employee_id, []).append(window)
    effective: list[TimeWindow] = []
    for window in available:
        pieces = [(window.start, window.end)]
        for block in unavailable.get(window.employee_id, []):
            pieces = [(left, right) for start, end in pieces
                      for left, right in ((start, min(end, block.start)),
                                          (max(start, block.end), end)) if left < right]
            if not pieces:
                break
        effective.extend(TimeWindow(employee_id=window.employee_id, start=start, end=end)
                         for start, end in pieces)
    return sorted(effective, key=lambda item: (item.employee_id, item.start, item.end))


def _session_cookie(header: str | None) -> str:
    cookie = next((part.strip() for part in (header or "").split(";")
                   if part.strip().startswith("evaluate_molly_session=")), None)
    if not cookie:
        raise SourceAuthError("Evaluate login is required for real data")
    return cookie


def _evaluate(path: str, cookie: str) -> dict | list:
    base = os.getenv("EVALUATE_API_BASE_URL", "http://127.0.0.1:4000/api").rstrip("/")
    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.get(f"{base}{path}", headers={"cookie": cookie})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as error:
        if error.response.status_code == 401:
            raise SourceAuthError("Evaluate login has expired or is invalid") from error
        if error.response.status_code == 403:
            raise SourceAccessError("Evaluate denied access to this data") from error
        raise SourceReadError(f"Evaluate API read failed at {path}: HTTP {error.response.status_code}") from error
    except (httpx.HTTPError, ValueError) as error:
        raise SourceReadError(f"Evaluate API read failed at {path}: {type(error).__name__}") from error


def accessible_stores(cookie_header: str | None) -> list[dict]:
    cookie = _session_cookie(cookie_header)
    payload = _evaluate("/roster-integration/stores", cookie)
    rows = payload.get("stores") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        raise SourceReadError("Evaluate store list does not match the scheduling source contract")
    seen_ids: set[str] = set()
    active: list[dict] = []
    for store in rows:
        if (not isinstance(store, dict)
            or not isinstance(store.get("id"), str) or not store["id"].strip()
            or not isinstance(store.get("isActive"), bool)
            or store["id"] in seen_ids):
            raise SourceReadError("Evaluate store list does not match the scheduling source contract")
        seen_ids.add(store["id"])
        if store["isActive"]:
            active.append(store)
    return active


def _employees(store_id: str, cookie: str) -> tuple[list[StaffMember], str]:
    employees: list[StaffMember] = []
    seen_ids: set[str] = set()
    revision: str | None = None
    expected_total: int | None = None
    page = 1
    while True:
        payload = _evaluate(f"/roster-integration/stores/{quote(store_id)}/employees?page={page}&pageSize=100", cookie)
        try:
            current_revision = payload["workforceRevision"]
            raw_employees = payload["employees"]
            pagination = payload["pagination"]
            has_more = pagination["hasMore"]
            returned_page = pagination["page"]
            page_size = pagination["pageSize"]
            total = pagination["total"]
            if not isinstance(current_revision, str) or not current_revision or not isinstance(raw_employees, list):
                raise ValueError("invalid Evaluate pagination fields")
        except (KeyError, TypeError, ValueError) as error:
            raise SourceReadError("Evaluate employee response does not match the scheduling source contract") from error
        if (type(returned_page) is not int or returned_page != page
            or type(page_size) is not int or page_size != 100
            or type(total) is not int or total < 0
            or not isinstance(has_more, bool)
            or (expected_total is not None and total != expected_total)
            or len(raw_employees) != min(page_size, max(total - (page - 1) * page_size, 0))
            or has_more != (page * page_size < total)):
            raise SourceReadError("Evaluate employee pagination does not match the scheduling source contract")
        if revision is not None and current_revision != revision:
            raise SourceReadError("Evaluate employee data changed during pagination; retry")
        revision = current_revision
        expected_total = total
        for raw in raw_employees:
            try:
                if raw["isActive"] is not True:
                    raise ValueError("paged Evaluate workforce must contain active employees only")
                employee_id = raw["id"]
                employee = StaffMember(id=employee_id, name=raw["displayName"], store_id=store_id,
                    employment_type=raw.get("employmentType"),
                    qualified_roles={position["id"] for position in raw.get("positions", [])},
                    skill_codes=set(raw["skillSummary"]["qualifiedSkillCodes"]),
                    opening_qualified=raw["skillSummary"]["operations"]["opening"] == "CAN_DO",
                    score=raw["officialScore"]["score"] if raw.get("officialScore") else None)
            except (KeyError, AttributeError, TypeError, ValueError) as error:
                raise SourceReadError("Evaluate employee row does not match the scheduling source contract") from error
            if employee_id in seen_ids:
                raise SourceReadError("Evaluate returned the same active employee more than once; retry")
            seen_ids.add(employee_id)
            employees.append(employee)
        if not has_more:
            break
        page += 1
    if len(employees) != expected_total:
        raise SourceReadError("Evaluate employee pagination does not match the scheduling source contract")
    return employees, revision


def read_roster_rule_hints(store_id: str) -> dict:
    """Read current Roster UI settings/templates as review hints, not solver rules."""
    try:
        with _roster_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                cursor.execute("SET LOCAL statement_timeout = '5s'")
                cursor.execute('''SELECT timezone, "openingTime", "closingTime", "minimumShiftMinutes",
                    "defaultBreakMinutes", "weeklyHourWarning", "dailyHourWarning", version
                    FROM roster_store_settings WHERE "storeId" = %s''', (store_id,))
                settings = cursor.fetchone()
                cursor.execute('''SELECT t.name, t."startTime", t."endTime", t."breakMinutes",
                    t.version, r."nameZh" AS "roleName", r.code AS "roleCode"
                    FROM shift_templates t LEFT JOIN shift_roles r ON r.id = t."shiftRoleId"
                    WHERE t."storeId" = %s AND t."isActive" = TRUE
                    ORDER BY t."displayOrder", t.name''', (store_id,))
                templates = cursor.fetchall()
    except psycopg.Error as error:
        raise SourceReadError(f"Roster rule-hint read failed: {type(error).__name__}") from error
    return {"settings": settings, "active_templates": templates}


def _require_timezone_source(rows: list[dict], timezone_name: str, timezone_source: str) -> None:
    if timezone_source == "ROSTER":
        if (len(rows) != 1 or not isinstance(rows[0], dict)
            or not isinstance(rows[0].get("timezone"), str)):
            raise SourceReadError("Roster store timezone is missing from the source snapshot")
        if rows[0]["timezone"] != timezone_name:
            raise SourceReadError("Roster store timezone changed between source reads; retry")
    elif rows:
        raise SourceReadError("Roster store timezone appeared after Lab confirmation; review the timezone source")


def load_snapshot(store_id: str, start: date, end: date, cookie_header: str | None,
                  timezone_name: str, minimum_rest_minutes: int = 600,
                  *, timezone_source: str = "ROSTER") -> Snapshot:
    if timezone_source not in {"ROSTER", "LAB_CONFIRMED"}:
        raise SourceReadError("Unknown real-source timezone authority")
    cookie = _session_cookie(cookie_header)
    stores = accessible_stores(cookie_header)
    if store_id not in {store["id"] for store in stores}:
        raise SourceReadError("Store is inactive or outside the signed-in account's access")
    employees, revision = _employees(store_id, cookie)
    jobs = _evaluate(f"/store-jobs?storeId={quote(store_id)}", cookie)
    evaluate_fingerprint = _source_fingerprint(revision, employees, jobs, [], [], [],
                                               timezone_name=timezone_name)
    zone = timezone_for(timezone_name)
    # Include the previous-day fixed shift and every external shift that could
    # violate even a per-employee rest override. The seven-day floor also
    # supplies the preceding part of the current weekly work-cap period.
    reach_days = max(7, (minimum_rest_minutes + 1439) // 1440 + 1)
    from_instant = local_instant(start - timedelta(days=reach_days), "00:00", zone)
    to_instant = local_instant(end + timedelta(days=reach_days + 1), "00:00", zone)
    try:
        with _roster_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
                cursor.execute("SET LOCAL statement_timeout = '5s'")
                cursor.execute('SELECT timezone FROM roster_store_settings WHERE "storeId" = %s',
                               (store_id,))
                _require_timezone_source(cursor.fetchall(), timezone_name, timezone_source)
                cursor.execute('''SELECT "employeeId", status, "startAt", "endAt", "date"
                    FROM employee_availability WHERE "storeId" = %s
                    AND "date" BETWEEN %s AND %s ORDER BY "employeeId", "startAt"''',
                    (store_id, start - timedelta(days=1), end + timedelta(days=1)))
                availability_rows = cursor.fetchall()
                cursor.execute('''SELECT s.id AS "sourceShiftId", a."employeeId", s."storeId", s."startAt", s."endAt",
                    s."breakMinutes", s."shiftRoleId", p.status
                    FROM shift_assignments a JOIN shifts s ON s.id = a."shiftId"
                    JOIN roster_periods p ON p.id = s."rosterPeriodId"
                    WHERE s."startAt" < %s AND s."endAt" > %s
                    AND (s."storeId" = %s OR a."employeeId" = ANY(%s))
                    ORDER BY a."employeeId", s."startAt"''',
                    (to_instant.replace(tzinfo=None), from_instant.replace(tzinfo=None),
                     store_id, [employee.id for employee in employees]))
                shift_rows = cursor.fetchall()
                try:
                    assignment_keys = [(row["sourceShiftId"], row["employeeId"]) for row in shift_rows]
                except (KeyError, TypeError) as error:
                    raise SourceReadError("Roster shift rows do not match the scheduling source contract") from error
                if len(assignment_keys) != len(set(assignment_keys)):
                    raise SourceReadError("Roster returned a duplicate shift assignment; retry")
                cursor.execute('''SELECT id, code, "nameZh", "storeId", "isActive", "requiredSkillCodes" FROM shift_roles
                    WHERE "storeId" = %s OR "storeId" IS NULL''', (store_id,))
                role_rows = cursor.fetchall()
    except psycopg.Error as error:
        raise SourceReadError(f"Roster database read failed: {type(error).__name__}") from error
    final_employees, final_revision = _employees(store_id, cookie)
    final_jobs = _evaluate(f"/store-jobs?storeId={quote(store_id)}", cookie)
    if _source_fingerprint(final_revision, final_employees, final_jobs, [], [], [],
                           timezone_name=timezone_name) != evaluate_fingerprint:
        raise SourceReadError("Evaluate workforce or formal jobs changed during the Roster source read; retry")
    # A fresh transaction detects a timezone row created or updated after the
    # repeatable-read snapshot began. It does not pretend to lock formal state;
    # callers still compare the preview and solve source versions.
    try:
        with _roster_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION READ ONLY")
                cursor.execute("SET LOCAL statement_timeout = '5s'")
                cursor.execute('SELECT timezone FROM roster_store_settings WHERE "storeId" = %s',
                               (store_id,))
                _require_timezone_source(cursor.fetchall(), timezone_name, timezone_source)
    except psycopg.Error as error:
        raise SourceReadError(f"Roster timezone recheck failed: {type(error).__name__}") from error
    try:
        known = {employee.id for employee in employees}
        role_to_job = map_historical_shift_roles(jobs, role_rows, store_id)
        role_required_skills = effective_job_skill_requirements(jobs, role_rows, store_id, role_to_job)
        availability = _effective_availability(availability_rows, known)
        if any(row["status"] not in {"DRAFT", "PUBLISHED"} for row in shift_rows):
            raise ValueError("Unsupported Roster period status")
        shifts = [ExistingShift(source_shift_id=row["sourceShiftId"], employee_id=row["employeeId"], store_id=row["storeId"],
            start=_utc(row["startAt"]), end=_utc(row["endAt"]), role_code=role_to_job.get(row["shiftRoleId"]),
            status="PUBLISHED" if row["status"] == "PUBLISHED" else "DRAFT",
            break_minutes_unknown=row["breakMinutes"]) for row in shift_rows]
    except (KeyError, AttributeError, TypeError, ValueError) as error:
        raise SourceReadError("Roster rows or Evaluate formal jobs do not match the scheduling source contract") from error
    fingerprint = _source_fingerprint(revision, employees, jobs, role_rows,
                                      availability_rows, shift_rows, timezone_name=timezone_name,
                                      scope=(store_id, start, end))
    return Snapshot(store_id=store_id, timezone=timezone_name, generated_at=datetime.now(timezone.utc),
        version=f"evaluate:{revision}|source:{fingerprint}", employees=employees,
        role_required_skills=role_required_skills,
        availability=availability, existing_shifts=shifts, source="REAL",
        leave_data_complete=False, compliance_policy_confirmed=False)

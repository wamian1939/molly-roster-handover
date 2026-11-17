"""Provision a SELECT-only PostgreSQL login for this local Scheduling Engine Lab.

This is intentionally limited to the local Molly Roster database. It never
touches roster rows, existing roles, or an existing Lab .env file.
"""

from __future__ import annotations

import argparse
import secrets
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import psycopg
from psycopg import sql


LAB_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = LAB_ROOT.parent
ROLE = "molly_roster_schedule_ro"
TABLES = (
    "employee_availability",
    "roster_periods",
    "roster_store_settings",
    "shift_assignments",
    "shift_roles",
    "shift_templates",
    "shifts",
)


def backend_url() -> str:
    path = PROJECT_ROOT / "backend" / ".env"
    if not path.is_file():
        raise RuntimeError("Local backend/.env is missing")
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "DATABASE_URL":
            return value.strip().strip('"').strip("'")
    raise RuntimeError("Local backend/.env has no DATABASE_URL")


def verify_select_only(url: str) -> None:
    with psycopg.connect(url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_user, current_database(), current_setting('default_transaction_read_only')")
            identity = cursor.fetchone()
            if identity != (ROLE, "molly_roster", "on"):
                raise RuntimeError("Read-only role identity or transaction default is wrong")
            cursor.execute("SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, "
                           "rolbypassrls, rolinherit FROM pg_roles WHERE rolname = current_user")
            if cursor.fetchone() != (False, False, False, False, False, False):
                raise RuntimeError("Read-only role has elevated role privileges")
            cursor.execute("SELECT count(*) FROM pg_auth_members "
                           "WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)")
            if cursor.fetchone() != (0,):
                raise RuntimeError("Read-only role belongs to another database role")
            cursor.execute("SELECT has_schema_privilege(current_user, 'public', 'USAGE'), "
                           "has_schema_privilege(current_user, 'public', 'CREATE'), "
                           "has_database_privilege(current_user, current_database(), 'CREATE')")
            if cursor.fetchone() != (True, False, False):
                raise RuntimeError("Read-only role has unexpected schema or database privileges")
            for table in TABLES:
                relation = f"public.{table}"
                cursor.execute("SELECT has_table_privilege(current_user, %s, 'SELECT'), "
                               "has_table_privilege(current_user, %s, 'INSERT'), "
                               "has_table_privilege(current_user, %s, 'UPDATE'), "
                               "has_table_privilege(current_user, %s, 'DELETE'), "
                               "has_table_privilege(current_user, %s, 'TRUNCATE')",
                               (relation,) * 5)
                if cursor.fetchone() != (True, False, False, False, False):
                    raise RuntimeError(f"Unexpected privileges for {relation}")
                cursor.execute(sql.SQL("SELECT 1 FROM {}.{} LIMIT 0").format(
                    sql.Identifier("public"), sql.Identifier(table)))
            cursor.execute("SELECT c.relname, "
                           "has_table_privilege(current_user, c.oid, 'SELECT'), "
                           "has_table_privilege(current_user, c.oid, 'INSERT'), "
                           "has_table_privilege(current_user, c.oid, 'UPDATE'), "
                           "has_table_privilege(current_user, c.oid, 'DELETE'), "
                           "has_table_privilege(current_user, c.oid, 'TRUNCATE'), "
                           "has_table_privilege(current_user, c.oid, 'REFERENCES'), "
                           "has_table_privilege(current_user, c.oid, 'TRIGGER') "
                           "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                           "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')")
            relations = cursor.fetchall()
            for name, select, *writes in relations:
                if select != (name in TABLES) or any(writes):
                    raise RuntimeError(f"Unexpected permissions on public.{name}")
            cursor.execute("SELECT c.relname, "
                           "has_sequence_privilege(current_user, c.oid, 'USAGE'), "
                           "has_sequence_privilege(current_user, c.oid, 'SELECT'), "
                           "has_sequence_privilege(current_user, c.oid, 'UPDATE') "
                           "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                           "WHERE n.nspname = 'public' AND c.relkind = 'S'")
            sequences = cursor.fetchall()
            for name, *privileges in sequences:
                if any(privileges):
                    raise RuntimeError(f"Unexpected permissions on public sequence {name}")
    print(f"Verified {ROLE}: SELECT on {len(TABLES)} required tables; "
          f"no other grants across {len(relations)} public relations and {len(sequences)} sequences")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--apply", action="store_true", help="Create the local role and ignored Lab .env")
    actions.add_argument("--verify", action="store_true", help="Recheck the current ignored Lab .env and role grants")
    args = parser.parse_args()
    target = LAB_ROOT / ".env"
    if args.verify:
        if not target.is_file():
            raise RuntimeError("Lab .env is missing")
        lines = target.read_text(encoding="utf-8-sig").splitlines()
        urls = [line.split("=", 1)[1].strip() for line in lines
                if line.startswith("ROSTER_DATABASE_READONLY_URL=")]
        if len(urls) != 1 or not urls[0]:
            raise RuntimeError("Lab .env must contain exactly one restricted database URL")
        verify_select_only(urls[0])
        return
    admin_url = backend_url()
    parsed = urlsplit(admin_url)
    if parsed.scheme not in {"postgres", "postgresql"} or parsed.hostname not in {"127.0.0.1", "localhost", "::1"} or parsed.path != "/molly_roster":
        raise RuntimeError("Refusing to provision a non-local or unexpected database")
    if target.exists():
        raise RuntimeError("Lab .env already exists; refusing to overwrite it")
    with psycopg.connect(admin_url, connect_timeout=5) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database(), rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = current_user")
            if cursor.fetchone() != ("molly_roster", True):
                raise RuntimeError("The local database account cannot create a restricted role")
            cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (ROLE,))
            if cursor.fetchone():
                raise RuntimeError("The dedicated role already exists; inspect it before changing anything")
        connection.rollback()
    print(f"Target: local {parsed.hostname}:{parsed.port or 5432}/molly_roster; new role {ROLE}; SELECT on {len(TABLES)} tables")
    if not args.apply:
        print("Dry run only. Pass --apply after a verified database backup.")
        return

    password = secrets.token_urlsafe(36)
    readonly_url = urlunsplit((parsed.scheme,
        f"{ROLE}:{quote(password, safe='')}@{parsed.hostname}:{parsed.port or 5432}",
        parsed.path, "", ""))
    staging = LAB_ROOT / ".data" / "roster-readonly-env.tmp"
    staging.parent.mkdir(parents=True, exist_ok=True)
    if staging.exists():
        raise RuntimeError("A staged credential file already exists; inspect it before provisioning")
    staging.write_text(f"ROSTER_DATABASE_READONLY_URL={readonly_url}\n", encoding="utf-8")
    role_created = False
    try:
        with psycopg.connect(admin_url, connect_timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql.SQL("CREATE ROLE {} LOGIN NOINHERIT PASSWORD {}").format(
                    sql.Identifier(ROLE), sql.Literal(password)))
                cursor.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                    sql.Identifier("molly_roster"), sql.Identifier(ROLE)))
                cursor.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(ROLE)))
                cursor.execute(sql.SQL("GRANT SELECT ON TABLE {} TO {}").format(
                    sql.SQL(", ").join(sql.SQL("{}.{}").format(sql.Identifier("public"), sql.Identifier(table))
                                     for table in TABLES), sql.Identifier(ROLE)))
                cursor.execute(sql.SQL("ALTER ROLE {} IN DATABASE {} SET default_transaction_read_only = on").format(
                    sql.Identifier(ROLE), sql.Identifier("molly_roster")))
        role_created = True
        verify_select_only(readonly_url)
        staging.rename(target)
        print("Created ignored Lab .env with the restricted connection. Restart only the Lab to load it.")
    except Exception:
        if role_created:
            print("Provisioning stopped after role creation; the ignored staged credential remains for recovery.")
        elif staging.exists():
            staging.unlink()
        raise


if __name__ == "__main__":
    main()

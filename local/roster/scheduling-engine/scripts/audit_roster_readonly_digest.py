"""Print content digests for the seven formal Roster tables readable by the Lab.

This command opens a repeatable-read, read-only transaction with the dedicated
Lab login. It prints only table names, row counts and SHA-256 digests. Use the
same command before and after an isolated Lab solve to detect source changes.
An unchanged digest is corroborating evidence, not proof against simultaneous
external edits or writes to tables outside this login's SELECT scope.
"""

from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

import psycopg
from psycopg import sql

from provision_local_readonly import ROLE, TABLES


LAB_ROOT = Path(__file__).resolve().parents[1]


def _readonly_url() -> str:
    env_file = LAB_ROOT / ".env"
    lines = env_file.read_text(encoding="utf-8-sig").splitlines()
    urls = [line.split("=", 1)[1].strip().strip('"').strip("'") for line in lines
            if line.startswith("ROSTER_DATABASE_READONLY_URL=")]
    if len(urls) != 1 or not urls[0]:
        raise RuntimeError("Lab requires exactly one restricted Roster database URL")
    parsed = urlsplit(urls[0])
    if (parsed.scheme not in {"postgres", "postgresql"}
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.path != "/molly_roster"):
        raise RuntimeError("Refusing a non-local or unexpected Roster database")
    return urls[0]


def audit() -> dict:
    tables = {}
    with psycopg.connect(_readonly_url(), connect_timeout=5,
                         options="-c default_transaction_read_only=on") as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            cursor.execute("SELECT current_user, current_database(), "
                           "current_setting('transaction_read_only')")
            identity = cursor.fetchone()
            if identity != (ROLE, "molly_roster", "on"):
                raise RuntimeError("Restricted Roster database identity or transaction mode changed")
            for table in TABLES:
                cursor.execute(sql.SQL("SELECT row_to_json(t) FROM public.{} AS t")
                               .format(sql.Identifier(table)))
                rows = sorted(json.dumps(row[0], sort_keys=True, ensure_ascii=False,
                                         default=str, separators=(",", ":"))
                              for row in cursor.fetchall())
                tables[table] = {"rows": len(rows),
                                 "sha256": sha256("\n".join(rows).encode("utf-8")).hexdigest()}
    return {"database": "molly_roster", "role": ROLE,
            "tables": tables}


if __name__ == "__main__":
    print(json.dumps(audit(), sort_keys=True, indent=2))

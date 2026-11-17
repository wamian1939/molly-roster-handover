"""Read-only PostgreSQL export and repeatable, conflict-intolerant local D1 rehearsal.

Real exports are PRIVATE artifacts. They must never be committed or packaged.
The importer only adds absent rows and accepts byte-equivalent existing rows;
a changed row aborts the entire transaction instead of overwriting cloud writes.
"""
import argparse
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
import pathlib
import sqlite3
import uuid

from schema import HERE, ROOT, generate, models


def connection_url(root):
    import os
    for line in (root / "backend/.env").read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL missing")


def canonical(value):
    if isinstance(value, datetime):
        # PostgreSQL TIMESTAMP(3) is written by Prisma using UTC, without a zone.
        return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if isinstance(value, date): return value.isoformat()
    if isinstance(value, (Decimal, uuid.UUID)): return str(value)
    if isinstance(value, dict): return {str(k): canonical(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [canonical(v) for v in value]
    return value


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def export(root, output, roster_only):
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
    # Prisma URLs can contain its schema option, which libpq does not support.
    from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
    parts = urlsplit(connection_url(root))
    url = urlunsplit(parts._replace(query=urlencode([(k,v) for k,v in parse_qsl(parts.query) if k != "schema"])))
    with psycopg.connect(url, row_factory=dict_row) as connection:
        connection.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        tables = [m["table"] for m in models()[0]] if roster_only else [r["tablename"] for r in connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]
        payload = {"format": 1, "source": "roster" if roster_only else "evaluate", "exportedAt": datetime.now(timezone.utc).isoformat(), "tables": {}}
        for table in tables:
            rows = canonical(connection.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier(table))).fetchall())
            rows.sort(key=lambda row: json.dumps(row, sort_keys=True, ensure_ascii=False))
            payload["tables"][table] = rows
        payload["contentHash"] = digest(payload["tables"])
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists(): raise RuntimeError("Refusing to overwrite export")
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {"source": payload["source"], "contentHash": payload["contentHash"], "counts": {k:len(v) for k,v in payload["tables"].items()}}
    output.with_suffix(".manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


def encoded_row(row, fields):
    result = {}
    for field in fields:
        key = field["name"]
        if key not in row: raise ValueError("Missing field: " + key)
        value = row[key]
        if value is not None and (field["array"] or field["kind"] == "Json"):
            value = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        elif field["kind"] == "Boolean" and value is not None: value = int(value)
        result[key] = value
    if set(row) != set(result): raise ValueError("Unmapped fields: " + str(set(row)-set(result)))
    return result


def import_local(payload, database):
    if payload.get("source") != "roster" or payload.get("format") != 1 or digest(payload["tables"]) != payload.get("contentHash"):
        raise ValueError("Source format or content checksum failed")
    all_models, _ = models()
    if set(payload["tables"]) != {m["table"] for m in all_models}: raise ValueError("Unexpected table inventory")
    database.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(database)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    if not con.execute("SELECT 1 FROM sqlite_master WHERE type='table'").fetchone(): con.executescript(generate())
    inserted = unchanged = 0
    try:
        con.execute("BEGIN IMMEDIATE")
        for model in all_models:
            table = model["table"]
            key = next(f["name"] for f in model["fields"] if "@id" in f["attrs"])
            for row in payload["tables"][table]:
                row = encoded_row(row, model["fields"])
                existing = con.execute(f'SELECT * FROM "{table}" WHERE "{key}"=?', (row[key],)).fetchone()
                if existing:
                    if dict(existing) != row: raise ValueError(f"Target row differs in {table}; no rows were overwritten")
                    unchanged += 1
                else:
                    columns = ','.join('"'+c+'"' for c in row)
                    con.execute(f'INSERT INTO "{table}" ({columns}) VALUES ({",".join("?" for _ in row)})', list(row.values()))
                    inserted += 1
        if con.execute("PRAGMA foreign_key_check").fetchall(): raise ValueError("Foreign-key verification failed")
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok": raise ValueError("Integrity verification failed")
        # Compare every migrated field, including immutable publication JSON and store IDs.
        for model in all_models:
            table = model["table"]
            expected = [encoded_row(row, model["fields"]) for row in payload["tables"][table]]
            actual = [dict(row) for row in con.execute(f'SELECT * FROM "{table}"')]
            sort = lambda rows: sorted(rows, key=lambda row: json.dumps(row, sort_keys=True, ensure_ascii=False))
            if sort(actual) != sort(expected): raise ValueError("Full reconciliation failed: " + table)
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()
    return {"inserted": inserted, "unchanged": unchanged, "foreignKeys": "passed", "integrity": "passed", "allFieldsReconciled": True, "contentHash": payload["contentHash"]}


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    e = sub.add_parser("export")
    e.add_argument("--source", choices=["roster", "evaluate"], required=True)
    e.add_argument("--output", type=pathlib.Path, required=True)
    i = sub.add_parser("rehearse")
    i.add_argument("--input", type=pathlib.Path, required=True)
    i.add_argument("--database", type=pathlib.Path, required=True)
    args = parser.parse_args()
    if args.command == "export":
        export(ROOT if args.source == "roster" else ROOT.parent / "Evaluate Molly", args.output, args.source == "roster")
    else:
        print(json.dumps(import_local(json.loads(args.input.read_text(encoding="utf-8")), args.database), indent=2))


if __name__ == "__main__": main()

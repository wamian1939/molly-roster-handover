"""Capture a real Lab snapshot through the user's existing browser session.

This one-use HTTP listener binds only to loopback. Chrome sends its HttpOnly
Evaluate session cookie to the same host; the cookie is passed in memory to
the read-only source adapter and is never printed or saved. The resulting
employee snapshot is saved only under the ignored Lab .data directory.
"""

from __future__ import annotations

import argparse
import secrets
import sqlite3
import sys
import time
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from adapters.real import load_snapshot
from engine.models import RuleSet
from scripts.export_real_snapshot import load_local_configuration


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start', type=date.fromisoformat, required=True)
    parser.add_argument('--end', type=date.fromisoformat, required=True)
    parser.add_argument('--rule-version', type=int, default=15)
    args = parser.parse_args()
    if args.start > args.end or (args.end - args.start).days >= 14:
        parser.error('Choose an inclusive date range of 1-14 days')
    load_local_configuration()
    uri = (ROOT / '.data' / 'lab.sqlite3').resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True) as db:
        row = db.execute('SELECT rules_json FROM rule_versions WHERE store_id=? AND version=?',
                         ('hurstville', args.rule_version)).fetchone()
    if row is None:
        parser.error('Requested Hurstville rule version is unavailable')
    rules = RuleSet.model_validate_json(row[0])
    output = ROOT / '.data' / f'hurstville-real-{args.start}-{args.end}.json'
    if output.exists():
        parser.error(f'Existing snapshot is protected: {output}')

    nonce = secrets.token_urlsafe(24)
    completed = False

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *values: object) -> None:
            pass

        def do_GET(self) -> None:
            nonlocal completed
            if self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}' or self.path != f'/capture/{nonce}':
                self.send_error(404)
                return
            cookie = self.headers.get('Cookie', '')
            if not any(part.strip().startswith('evaluate_molly_session=') for part in cookie.split(';')):
                self.send_error(401, 'Evaluate login is not available in this browser tab')
                return
            try:
                snapshot = load_snapshot('hurstville', args.start, args.end, cookie,
                                         rules.timezone, 0,
                                         timezone_source=rules.timezone_source)
                if snapshot.source != 'REAL':
                    raise ValueError('Source is not REAL')
                with output.open('x', encoding='utf-8') as destination:
                    destination.write(snapshot.model_dump_json(indent=2) + '\n')
            except Exception as error:
                print(f'Capture failed: {type(error).__name__}', flush=True)
                self.send_error(500, 'Read-only source capture failed')
                return
            print(f'Saved {output.name}: employees={len(snapshot.employees)}, '
                  f'availability={len(snapshot.availability)}, '
                  f'surrounding_shifts={len(snapshot.existing_shifts)}, '
                  f'version={snapshot.version}', flush=True)
            body = b'Real Hurstville snapshot saved locally for the V1/V2 comparison.\n'
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            completed = True

    with HTTPServer(('127.0.0.1', 0), Handler) as server:
        server.timeout = 1
        print(f'Open once in the existing Chrome session: '
              f'http://127.0.0.1:{server.server_port}/capture/{nonce}', flush=True)
        deadline = time.monotonic() + 120
        while not completed and time.monotonic() < deadline:
            server.handle_request()
    if not completed:
        print('Capture expired without a saved snapshot', flush=True)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

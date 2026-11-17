"""Binary, non-destructive PostgreSQL backups. Never prints credentials or rows."""
import argparse
import hashlib
import json
import pathlib
import subprocess
from datetime import datetime, timezone


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    destination = args.output.resolve() / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destination.mkdir(parents=True, exist_ok=False)
    manifest = {"createdAt": datetime.now(timezone.utc).isoformat(), "consistentAcrossDatabases": False, "databases": []}
    for container in ("molly-roster-postgres", "evaluate-molly-postgres"):
        target = destination / (container + ".dump")
        command = ['docker', 'exec', container, 'sh', '-c', 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom']
        with target.open("xb") as stream:
            subprocess.run(command, stdout=stream, stderr=subprocess.PIPE, check=True)
        # Ask pg_restore to parse the complete archive TOC, using the source image's matching tools.
        with target.open("rb") as stream:
            toc = subprocess.run(['docker', 'exec', '-i', container, 'pg_restore', '--list'], stdin=stream, capture_output=True, check=True)
        manifest["databases"].append({"container": container, "file": target.name,
            "bytes": target.stat().st_size, "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "archiveReadable": True, "tocLines": len(toc.stdout.splitlines())})
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"backupDirectory": str(destination), **manifest}, indent=2))


if __name__ == "__main__":
    main()

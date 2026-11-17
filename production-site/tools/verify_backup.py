"""Restore both archives into disposable databases, verify counts, then drop only those databases."""
import argparse
import json
import pathlib
import subprocess
import uuid
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

import psycopg
from data import ROOT,connection_url


def main():
    parser=argparse.ArgumentParser();parser.add_argument("directory",type=pathlib.Path);args=parser.parse_args()
    manifest=json.loads((args.directory/"manifest.json").read_text(encoding="utf-8"))
    report=[]
    for entry in manifest["databases"]:
        container=entry["container"]
        database="sites_restore_"+uuid.uuid4().hex
        def command(binary,*arguments,stream=None):
            return subprocess.run(['docker','exec',*(['-i'] if stream else []),container,'sh','-c','exec '+binary+' -U "$POSTGRES_USER" "$@"','verify',*arguments],stdin=stream,capture_output=True,check=True)
        command('createdb',database)
        try:
            with (args.directory/entry["file"]).open("rb") as stream: command('pg_restore','--exit-on-error','--no-owner','--no-acl','-d',database,stream=stream)
            project=ROOT if container.startswith('molly-roster') else ROOT.parent/'Evaluate Molly'
            parts=urlsplit(connection_url(project));url=urlunsplit(parts._replace(path='/'+database,query=urlencode([(k,v) for k,v in parse_qsl(parts.query) if k!='schema'])))
            with psycopg.connect(url) as con:
                from psycopg import sql
                tables=[r[0] for r in con.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]
                counts={table:con.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table))).fetchone()[0] for table in tables}
            report.append({"container":container,"restorePassed":True,"tableCounts":counts})
        finally: command('dropdb',database)
    (args.directory/"restore-verification.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))


if __name__=="__main__":main()

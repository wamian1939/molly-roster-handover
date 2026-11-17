"""Run current Roster integration tests on a fresh disposable database only."""
import json
import os
import pathlib
import subprocess
import uuid
import time
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode

from data import ROOT,HERE,connection_url


def main():
    database='sites_test_'+uuid.uuid4().hex
    def command(binary):
        subprocess.run(['docker','exec','molly-roster-postgres','sh','-c','exec '+binary+' -U "$POSTGRES_USER" "$1"','test',database],capture_output=True,check=True)
    command('createdb')
    try:
        parts=urlsplit(connection_url(ROOT))
        schema='codex_roster_backend_test_'+str(int(time.time()))+'_'+uuid.uuid4().hex[:4]
        options={**dict(parse_qsl(parts.query)),'schema':schema}
        url=urlunsplit(parts._replace(path='/'+database,query=urlencode(options)))
        environment={**os.environ,'DATABASE_URL':url,'RUN_DATABASE_TESTS':'1','NODE_ENV':'test'}
        migration=subprocess.run(['node','node_modules/prisma/build/index.js','migrate','deploy'],cwd=ROOT/'backend',env=environment,capture_output=True,text=True)
        if migration.returncode: raise RuntimeError('Isolated migration failed; no source database was modified')
        result=subprocess.run(['npm.cmd' if os.name=='nt' else 'npm','test','--','--reporter=json','--outputFile='+str(HERE/'.local/backend-tests.json')],cwd=ROOT/'backend',env=environment,capture_output=True,text=True)
        (HERE/'.local/backend-tests.log').write_text(result.stdout+result.stderr,encoding='utf-8')
        details=json.loads((HERE/'.local/backend-tests.json').read_text(encoding='utf-8'))
        report={k:details[k] for k in ('success','numTotalTests','numPassedTests','numFailedTests','numPendingTests')}
        report['isolatedDatabase']=True
        (HERE/'evidence/backend-postgres-tests.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report,indent=2))
        return result.returncode
    finally: command('dropdb')


if __name__=='__main__':raise SystemExit(main())

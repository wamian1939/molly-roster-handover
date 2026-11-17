"""Real HTTP + native Linux solve check. Secret remains in process memory only."""
import contextlib
import hashlib
import json
import os
import pathlib
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT=pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'scheduling-engine'))
sys.path.insert(0,str(ROOT/'multi-agent-engine'))
from benchmark_solver import pseudonymize
from datetime import date


def main():
    from engine.models import Snapshot,RuleSet
    source=ROOT/'multi-agent-engine/.data/live-real-targets-bob-v3'
    original=Snapshot.model_validate_json((source/'snapshot-scheduling.json').read_text(encoding='utf-8'))
    snapshot=pseudonymize(original)
    mapping={e.id:f'employee-{i:03}' for i,e in enumerate(original.employees)}
    rule_data=json.loads((source/'rules.json').read_text(encoding='utf-8'))
    for key in ('employee_limits','employee_preferences'):
        rule_data[key]={mapping.get(k,k):v for k,v in rule_data.get(key,{}).items()}
    rules=RuleSet.model_validate(rule_data)
    start,end=date(2026,10,26),date(2026,11,1)
    body={"snapshot":snapshot.model_dump(mode='json'),"rules":rules.model_dump(mode='json'),"from":str(start),"to":str(end),"mode":"BEST_EFFORT","solveSeconds":10}
    secret=secrets.token_urlsafe(48)
    name='roster-solver-test-'+uuid.uuid4().hex[:12]
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    environment={**os.environ,'SOLVER_SHARED_SECRET':secret}
    subprocess.run(['docker','run','-d','--rm','--name',name,'--cpus=1','--memory=512m','-p',f'127.0.0.1:{port}:8080','-e','SOLVER_SHARED_SECRET','molly-roster-solver:sites'],env=environment,capture_output=True,check=True)
    base=f'http://127.0.0.1:{port}'
    def request(payload,authenticated=True):
        req=urllib.request.Request(base+'/v1/solve',data=json.dumps(payload).encode(),headers={'content-type':'application/json',**({'authorization':'Bearer '+secret} if authenticated else {})})
        try:
            with urllib.request.urlopen(req,timeout=55) as response:return response.status,json.load(response)
        except urllib.error.HTTPError as error:return error.code,{}
    try:
        for _ in range(40):
            try:
                with urllib.request.urlopen(base+'/health',timeout=1) as response:
                    if json.load(response)['ok']:break
            except (OSError,urllib.error.URLError):time.sleep(0.25)
        else:raise RuntimeError('Container failed readiness')
        assert request(body,False)[0]==401
        assert request({})[0]==400
        began=time.monotonic();status,result=request(body);seconds=time.monotonic()-began
        if status!=200:raise AssertionError('Solver HTTP status '+str(status))
        assert result['publishable'] is False
        value=result['result'];assert not value['validation_errors']
        assert value['status']=='INFEASIBLE' and not value['assignments']
        repeated_status,repeated=request(body)
        assert repeated_status==200 and repeated['requestHash']==result['requestHash']
        daily={**body,'to':str(start)}
        day_status,day_result=request(daily)
        assert day_status==200 and day_result['result']['status'] in ('OPTIMAL','FEASIBLE') and day_result['result']['assignments']
        assert not day_result['result']['validation_errors']
        # Run IDs differ, but retries must retain the request identity used for Sites-side deduplication.
        rejected=json.loads(json.dumps(body));rejected['snapshot']['employees'][0]['name']='Identifying Name'
        assert request(rejected)[0]==422
        report={'image':'molly-roster-solver:sites','httpSolve':status,'pseudonymizedRealEmployees':len(snapshot.employees),
            'days':7,'seconds':seconds,'assignments':len(value['assignments']),'status':value['status'],
            'validationErrors':0,'unauthenticatedRejected':True,'identifyingNameRejected':True,
            'retryRequestHashStable':True,'publishable':False,'cloudDeployment':False,
            'feasibleDay':{'status':day_result['result']['status'],'assignments':len(day_result['result']['assignments']),'validationErrors':len(day_result['result']['validation_errors'])},
            'containerStats':subprocess.check_output(['docker','stats','--no-stream','--format','{{.MemUsage}} | {{.CPUPerc}}',name],text=True).strip()}
        (ROOT/'sites/roster/evidence/solver-container.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report,indent=2))
    finally:
        subprocess.run(['docker','stop',name],capture_output=True,check=True)


if __name__=='__main__':main()

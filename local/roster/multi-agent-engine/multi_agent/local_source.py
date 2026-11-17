"""Authorized local CLI snapshot; no HTTP authentication bypass or new score implementation."""
from datetime import datetime,timedelta,timezone
import json,os,sqlite3,subprocess
from pathlib import Path

from . import LAB_ROOT
from .domain import digest
from engine.models import RuleSet,Snapshot,StaffMember,ExistingShift
from engine.clock import local_instant,timezone_for
from adapters.real import (_roster_connection,_effective_availability,_utc,_source_fingerprint,
    map_historical_shift_roles,effective_job_skill_requirements)


def load_configuration():
    for path in [LAB_ROOT/'.env',LAB_ROOT.parent/'multi-agent-engine/.env']:
        if path.is_file():
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                key,sep,value=line.partition('=')
                if sep and key.strip() in {'ROSTER_DATABASE_READONLY_URL','EVALUATE_API_BASE_URL'}:
                    os.environ[key.strip()]=value.strip().strip('"').strip("'")


def local_database_inputs(store_id,start,end,output):
    load_configuration()
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    backend=LAB_ROOT.parent.parent/'Evaluate Molly/backend'
    bridge=LAB_ROOT.parent/'multi-agent-engine/scripts/export-workforce.mts'
    process=subprocess.run(['node',str(backend/'node_modules/tsx/dist/cli.mjs'),str(bridge),str(backend),store_id],
        capture_output=True,text=True,encoding='utf-8',timeout=50)
    if process.returncode:
        # Do not forward Prisma connection strings or environment values on errors.
        raise RuntimeError('Read-only Evaluate service export failed; inspect local bridge configuration')
    workforce=json.loads(process.stdout)
    if workforce['identity']['read_only']!='on':raise ValueError('Evaluate read-only guard failed')
    employees=[StaffMember(id=e['id'],name=e['displayName'],store_id=store_id,
        employment_type=e.get('employmentType'),qualified_roles={p['id'] for p in e['positions']},
        skill_codes=set(e['skillSummary']['qualifiedSkillCodes']),
        opening_qualified=e['skillSummary']['operations']['opening']=='CAN_DO',
        score=e['officialScore']['score'] if e.get('officialScore') else None) for e in workforce['employees']]
    uri=(LAB_ROOT/'.data/lab.sqlite3').resolve().as_uri()+'?mode=ro'
    with sqlite3.connect(uri,uri=True) as connection:
        row=connection.execute('SELECT rules_json FROM rule_versions WHERE store_id=? ORDER BY version DESC LIMIT 1',(store_id,)).fetchone()
    if not row:raise ValueError('No saved RuleSet for this store')
    rules=RuleSet.model_validate_json(row[0]);zone=timezone_for(rules.timezone)
    left=local_instant(start-timedelta(days=7),'00:00',zone)
    right=local_instant(end+timedelta(days=8),'00:00',zone)
    with _roster_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
            cursor.execute("SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only")
            roster_identity=cursor.fetchone()
            cursor.execute('SELECT timezone FROM roster_store_settings WHERE "storeId"=%s',(store_id,))
            settings=cursor.fetchone()
            if not settings or settings['timezone']!=rules.timezone:raise ValueError('Live Roster timezone differs from RuleSet')
            cursor.execute('''SELECT "employeeId",status,"startAt","endAt","date" FROM employee_availability
                WHERE "storeId"=%s AND "date" BETWEEN %s AND %s ORDER BY "employeeId","startAt"''',
                (store_id,start-timedelta(days=1),end+timedelta(days=1)))
            availability_rows=cursor.fetchall()
            cursor.execute('''SELECT s.id AS "sourceShiftId",a."employeeId",s."storeId",s."startAt",s."endAt",
                s."breakMinutes",s."shiftRoleId",p.status FROM shift_assignments a JOIN shifts s ON s.id=a."shiftId"
                JOIN roster_periods p ON p.id=s."rosterPeriodId" WHERE s."startAt"<%s AND s."endAt">%s
                AND (s."storeId"=%s OR a."employeeId"=ANY(%s)) ORDER BY a."employeeId",s."startAt"''',
                (right.replace(tzinfo=None),left.replace(tzinfo=None),store_id,[e.id for e in employees]))
            shift_rows=cursor.fetchall()
            cursor.execute('''SELECT id,code,"nameZh","storeId","isActive","requiredSkillCodes","colorToken"
                FROM shift_roles WHERE "storeId"=%s OR "storeId" IS NULL''',(store_id,))
            roles=cursor.fetchall()
    jobs=workforce['jobs'];mapping=map_historical_shift_roles(jobs,roles,store_id)
    skills=effective_job_skill_requirements(jobs,roles,store_id,mapping)
    availability=_effective_availability(availability_rows,{e.id for e in employees})
    existing=[ExistingShift(source_shift_id=s['sourceShiftId'],employee_id=s['employeeId'],store_id=s['storeId'],
        start=_utc(s['startAt']),end=_utc(s['endAt']),role_code=mapping.get(s['shiftRoleId']),
        status=s['status'],break_minutes_unknown=s['breakMinutes']) for s in shift_rows]
    revision=digest(workforce['employees'])[:24]
    fingerprint=_source_fingerprint(revision,employees,jobs,roles,availability_rows,shift_rows,
        timezone_name=rules.timezone,scope=(store_id,start,end))
    snapshot=Snapshot(store_id=store_id,timezone=rules.timezone,generated_at=datetime.now(timezone.utc),
        version=f'local-db:{revision}|source:{fingerprint}',employees=employees,role_required_skills=skills,
        availability=availability,existing_shifts=existing,source='REAL',run_purpose='EXPLORATORY')
    by_job={}
    for role in roles:
        job=mapping.get(role['id'])
        if not job or not role['isActive']:continue
        job_code=next(j['code'] for j in jobs if j['id']==job)
        rank=(role['code']==job_code,role['storeId']==store_id)
        current=by_job.get(job)
        if current and rank==(current['code']==job_code,current['storeId']==store_id):raise ValueError('Ambiguous Roster role')
        if current and rank<(current['code']==job_code,current['storeId']==store_id):continue
        by_job[job]={**role,'formalJobId':job}
    (output/'snapshot-original.json').write_text(snapshot.model_dump_json(indent=2),encoding='utf-8')
    (output/'rules.json').write_text(rules.model_dump_json(indent=2),encoding='utf-8')
    (output/'provenance.json').write_text(json.dumps({'source':'LIVE_LOCAL_DATABASE','fetched_at':str(snapshot.generated_at),
        'evaluate':workforce['identity'],'roster':roster_identity,'rating_source':workforce['rating_source'],
        'employee_count':len(employees),'availability_count':len(availability),'existing_count':len(existing)},indent=2),encoding='utf-8')
    return rules,snapshot,by_job

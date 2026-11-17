"""Build private, resumable migration chunks, never build-time seed data."""
import json,pathlib,hashlib,sqlite3,subprocess
from data import HERE,ROOT,models,encoded_row,digest


def main():
    roster=json.loads((HERE/'.local/roster-export.json').read_text(encoding='utf-8'))
    evaluate=json.loads((HERE/'.local/evaluate-export.json').read_text(encoding='utf-8'))
    projection=json.loads((HERE/'.local/workforce-export.json').read_text(encoding='utf-8'))
    records=[]
    for model in models()[0]:
        for row in roster['tables'][model['table']]:records.append({'type':'roster','model':model['name'][0].lower()+model['name'][1:],'row':encoded_row(row,model['fields'])})
    for table,rows in evaluate['tables'].items():
        for row in rows:records.append({'type':'archive','table':table,'key':str(row.get('id') or digest(row)),'row':row})
    for row in projection['accounts']:records.append({'type':'account','row':row})
    records.append({'type':'source','id':'workforce','body':projection['workforce']})
    py=ROOT/'scheduling-engine/.venv-isolated/Scripts/python.exe'
    def rules(week):return json.loads(subprocess.check_output([str(py),str(ROOT/'scripts/read-employee-capacity-rules.py'),'hurstville',week],text=True,encoding='utf-8'))
    base=rules('2099-01-05');overrides={}
    db=ROOT/'multi-agent-engine/.data/agent-rule-settings.sqlite3'
    if db.exists():
        con=sqlite3.connect(db.resolve().as_uri()+'?mode=ro',uri=True)
        for (scope,) in con.execute("SELECT DISTINCT scope_key FROM settings_versions WHERE store_id='hurstville' AND scope_key<>'DEFAULT'"):
            overrides[scope]=rules(scope)
        con.close()
    records.append({'type':'source','id':'demo-rules','body':{'rules':base,'overrides':overrides}})
    chunks=[{'id':f'chunk_{i//60:04}','records':records[i:i+60]} for i in range(0,len(records),60)]
    chunks.append({'id':'complete','records':[]})
    (HERE/'.local/import-chunks.json').write_text(json.dumps(chunks,ensure_ascii=False),encoding='utf-8')
    manifest={'rosterRows':sum(len(rows) for rows in roster['tables'].values()),'evaluateArchiveRows':sum(len(rows) for rows in evaluate['tables'].values()),'accounts':len(projection['accounts']),'chunks':len(chunks),'rosterHash':roster['contentHash'],'evaluateHash':evaluate['contentHash'],'workforceRevision':projection['workforce']['revision']}
    (HERE/'evidence/import-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8');print(json.dumps(manifest,indent=2))


if __name__=='__main__':main()

"""Display only accepted, independently checked days in the existing calendar."""


def calendar_preview(run_id,snapshot,roles,assignments,start,end,preserve,version,accepted):
    people={e.id:e for e in snapshot.employees}
    rows=[]
    for s in assignments:
        if s.fixed or s.date not in accepted:continue # Saved records are not duplicated.
        person=people[s.employee_id]
        role=roles.get(s.role_code)
        if not role and snapshot.source=='REAL':continue # Never invent a Roster role.
        role=role or {'id':s.role_code,'storeId':s.store_id,'code':s.role_code,'nameZh':s.pattern_name,'colorToken':'#77516d','requiredSkillCodes':[]}
        shift_id=f'agent-preview:{run_id}:{s.id}'
        rows.append({'id':shift_id,'rosterPeriodId':f'agent-preview:{run_id}','storeId':s.store_id,'date':str(s.date),
            'startAt':s.start.isoformat(),'endAt':s.end.isoformat(),'breakMinutes':0,'shiftRoleId':role['id'],
            'roleNameSnapshot':role['nameZh'],'roleColorSnapshot':role['colorToken'],'shiftRole':role,
            'publicNote':None,'internalNote':s.reason,'version':0,'agentPreview':True,'agentPattern':s.pattern_name,
            'assignments':[{'id':shift_id+':employee','employeeId':person.id,'employeeNameSnapshot':person.name,
                'employeeTypeSnapshot':'UNKNOWN','officialScoreSnapshot':str(person.score) if person.score is not None else None,'tierSnapshot':None}]})
    return {'run_id':run_id,'from':str(start),'to':str(end),'preserve_existing':preserve,'version':version,
            'accepted_dates':sorted(str(d) for d in accepted),'shifts':rows,'saved':False,
            'preserved_shift_ids':sorted({s.source_shift_id for s in assignments if s.fixed and s.source_shift_id})}

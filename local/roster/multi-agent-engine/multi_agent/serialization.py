"""Pure CalendarResponse serialization, shared by full and editable partial drafts."""


def serialize_calendar(snapshot,rules,run_id,roster_roles,scheduled,start,end):
    # CalendarResponse-compatible shape. No create/update/publish call exists here.
    people = {e.id:e for e in snapshot.employees}
    period_id = "multi-agent-draft-"+run_id
    shifts=[]
    from zoneinfo import ZoneInfo
    zone=ZoneInfo(snapshot.timezone)
    for s in scheduled:
        e=people[s.employee_id]
        role=roster_roles.get(s.role_code)
        if role is None and snapshot.source=="REAL":
            raise ValueError("Verified Roster shift-role mapping is required for real JSON export")
        role=role or {"id":s.role_code,"storeId":s.store_id,"code":s.role_code,"nameZh":s.pattern_name,
                      "colorToken":"rose","requiredSkillCodes":[]}
        shifts.append({"id":s.id,"rosterPeriodId":period_id,"storeId":s.store_id,"date":str(s.date),
            "startAt":s.start.isoformat(),"endAt":s.end.isoformat(),"breakMinutes":0,
            "shiftRoleId":role["id"],"roleNameSnapshot":role["nameZh"],"roleColorSnapshot":role["colorToken"],
            "publicNote":None,"internalNote":"Draft: breaks and compliance pending", "version":1,
            "shiftRole":role,
            "assignments":[{"id":s.id+"-assignment","employeeId":e.id,"employeeNameSnapshot":e.name,
                "employeeTypeSnapshot":"UNKNOWN","employmentTypeSnapshot":e.employment_type,
                "officialScoreSnapshot":str(e.score) if e.score is not None else None,
                "tierSnapshot":None}],"status":"DRAFT","source":"EXISTING_SNAPSHOT" if s.fixed else "MULTI_AGENT_V1",
            "sourceShiftId":s.source_shift_id,"locked":s.fixed,"patternName":s.pattern_name,
            "crossesMidnight":s.start.astimezone(zone).date()!=s.end.astimezone(zone).date()})
    return {"storeId":rules.store_id,"from":str(start),"to":str(end),
        "periods":[{"id":period_id,"storeId":rules.store_id,"startDate":str(start),"endDate":str(end),
            "cycleType":"WEEK","status":"DRAFT","version":1,"publishedAt":None}],"shifts":shifts,
        "breaksPlanned":False,"publishable":False,"paidMinutes":None}

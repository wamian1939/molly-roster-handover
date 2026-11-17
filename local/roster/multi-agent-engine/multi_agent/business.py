"""Versioned store rules: deterministic hour targets and mandatory interval coverage."""
from datetime import timedelta
from decimal import Decimal,ROUND_HALF_UP
from engine.clock import local_instant,timezone_for,minutes_between


def validate_scope(rules,snapshot,policy):
    business=policy.business_rules
    if business is None:return
    if business.store_id!=rules.store_id or business.store_id!=snapshot.store_id:
        raise ValueError('Business RuleSet store does not match source')
    if business.base_rule_version!=rules.version:
        raise ValueError('Business RuleSet base version changed; review the new store rules')
    unknown={r.employee_id for r in business.mandatory_coverage}-{e.id for e in snapshot.employees}
    if unknown:raise ValueError('Mandatory coverage references unknown employees: '+str(sorted(unknown)))


def available_minutes(snapshot,employee_id,start,end):
    """Union authoritative positive windows within the requested local dates, then veto approved leave."""
    zone=timezone_for(snapshot.timezone)
    left=local_instant(start,'00:00',zone);right=local_instant(end+timedelta(days=1),'00:00',zone)
    windows=[]
    for w in snapshot.availability:
        if w.employee_id==employee_id and w.start<right and w.end>left:
            windows.append((max(left,w.start),min(right,w.end)))
    merged=[]
    for a,b in sorted(windows):
        if merged and a<=merged[-1][1]:merged[-1]=(merged[-1][0],max(merged[-1][1],b))
        else:merged.append((a,b))
    for leave in snapshot.approved_leave:
        if leave.employee_id==employee_id:
            merged=[(a,b) for x,y in merged for a,b in ((x,min(y,leave.start)),(max(x,leave.end),y)) if a<b]
    return sum(minutes_between(a,b) for a,b in merged)


def rating_targets(snapshot,policy,start,end):
    business=policy.business_rules
    if business is None or business.rating_hours is None:return {}
    config=business.rating_hours
    top=max((p.score for p in snapshot.employees if p.score is not None),default=None)
    rows={}
    for p in snapshot.employees:
        available=available_minutes(snapshot,p.id,start,end)
        fraction=None
        if p.score is not None:
            fraction=config.highest_score_fraction if p.score==top else next(b.fraction for b in config.bands if p.score>=b.minimum_score)
        target=int((Decimal(available)*Decimal(str(fraction))).quantize(Decimal('1'),rounding=ROUND_HALF_UP)) if fraction is not None else None
        rows[p.id]={'employee_id':p.id,'employee_name':p.name,'rating':p.score,'available_minutes':available,
            'target_fraction':fraction,'target_scheduled_minutes':target,'highest_rating':p.score is not None and p.score==top}
    return rows


def target_progress(target,assigned_minutes):
    if target is None:return {}
    minutes=target['target_scheduled_minutes']
    return {**target,'target_assigned_minutes':assigned_minutes,
        'target_remaining_minutes':max(0,minutes-assigned_minutes) if minutes is not None else None,
        'target_excess_minutes':max(0,assigned_minutes-minutes) if minutes is not None else None}


def target_selection_term(progress,candidate_minutes,policy):
    config=policy.business_rules.rating_hours if policy.business_rules else None
    target=progress.get('target_scheduled_minutes')
    if config is None or target is None or target==0:return 0.0
    assigned=progress['target_assigned_minutes']
    remaining=max(0,target-assigned)/target
    overshoot=max(0,assigned+candidate_minutes-target)/target
    improvement=(abs(target-assigned)-abs(target-assigned-candidate_minutes))/target
    return 100*config.target_weight*(remaining-overshoot+improvement)


def mandatory_for_day(policy,day):
    return [r for r in policy.business_rules.mandatory_coverage if day.weekday() in r.weekdays] if policy.business_rules else []


def covers_requirement(shift,requirement,day,timezone):
    zone=timezone_for(timezone)
    return (shift.employee_id==requirement.employee_id and shift.date==day and
        shift.start<=local_instant(day,requirement.start,zone) and shift.end>=local_instant(day,requirement.end,zone))


def unmet_requirements(policy,day,shifts,timezone):
    return [r for r in mandatory_for_day(policy,day) if not any(covers_requirement(s,r,day,timezone) for s in shifts)]


def business_report(snapshot,rules,policy,start,end,shifts):
    if policy.business_rules is None:return None
    targets=rating_targets(snapshot,policy,start,end)
    from .domain import candidates_for,caps
    daily_options={}
    zone=timezone_for(snapshot.timezone)
    for offset in range((end-start).days+1):
        day=start+timedelta(days=offset)
        daily_options[day]=candidates_for(day,rules,snapshot,None,policy)
    rows=[]
    for employee_id,target in targets.items():
        assigned=sum(minutes_between(s.start,s.end) for s in shifts if s.employee_id==employee_id and
            s.store_id==snapshot.store_id and start<=s.date<=end)
        progress=target_progress(target,assigned)
        progress['actual_fraction']=assigned/target['available_minutes'] if target['available_minutes'] else None
        progress['difference_minutes']=assigned-target['target_scheduled_minutes'] if target['target_scheduled_minutes'] is not None else None
        capacity=0
        for day,options in daily_options.items():
            lengths=[minutes_between(s.start,s.end) for s in options if s.employee_id==employee_id]
            lengths += [minutes_between(s.start,s.end) for s in snapshot.existing_shifts if s.employee_id==employee_id
                and s.store_id==snapshot.store_id and s.start.astimezone(zone).date()==day]
            daily_cap,_=caps(rules,policy,employee_id)
            if daily_cap is not None:lengths=[n for n in lengths if n<=daily_cap]
            # Sum of per-date maxima is only a necessary upper bound, never a solver/feasibility claim.
            capacity+=sum(sorted(lengths,reverse=True)[:rules.compliance_for(employee_id).maximum_shifts_per_day])
        _,weekly_cap=caps(rules,policy,employee_id)
        if weekly_cap is not None:capacity=min(capacity,weekly_cap)
        progress['maximum_candidate_minutes']=capacity
        progress['target_exceeds_individual_capacity']=target['target_scheduled_minutes'] is not None and target['target_scheduled_minutes']>capacity
        rows.append(progress)
    rows.sort(key=lambda r:(-(r['rating'] if r['rating'] is not None else -1),r['employee_name']))
    mandatory=[];required_minutes=0
    people={e.id:e for e in snapshot.employees}
    for offset in range((end-start).days+1):
        day=start+timedelta(days=offset)
        for band in rules.weekly_exact_staffing.get(day.weekday(),[]):
            required_minutes+=minutes_between(local_instant(day,band.start,zone),local_instant(day,band.end,zone))*band.staff
        for req in mandatory_for_day(policy,day):
            matching=[s for s in shifts if covers_requirement(s,req,day,snapshot.timezone)]
            mandatory.append({'date':str(day),'employee_id':req.employee_id,'employee_name':people[req.employee_id].name,
                'start':req.start,'end':req.end,'label':req.label,'satisfied':bool(matching),
                'shifts':[{'id':s.id,'pattern_name':s.pattern_name,'start':s.start.isoformat(),'end':s.end.isoformat()} for s in matching]})
    return {'rule_version':policy.business_rules.version,'targets_are_soft':True,'mandatory_is_hard':True,
        'rating_policy':policy.business_rules.rating_hours.model_dump(mode='json') if policy.business_rules.rating_hours else None,
        'target_basis':'Merged reported available minutes within requested store-local dates, excluding approved leave',
        'rows':rows,'mandatory_coverage':mandatory,'required_coverage_minutes':required_minutes,
        'total_rated_target_minutes':sum(row['target_scheduled_minutes'] or 0 for row in rows),
        'unknown_rating_employee_ids':[row['employee_id'] for row in rows if row['rating'] is None]}

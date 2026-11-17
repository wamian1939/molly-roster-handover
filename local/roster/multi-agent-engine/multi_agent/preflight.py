"""Necessary eligibility bounds only, never a staffing assignment or optimization solver."""
from datetime import timedelta
from zoneinfo import ZoneInfo
from engine.clock import local_instant
from .domain import candidates_for,ledger_for,availability_covers
from .business import mandatory_for_day,covers_requirement


def group_conflicts(conflicts):
    """Merge identical adjacent slot findings; retain raw checks for machine validation."""
    groups=[]
    for conflict in conflicts:
        item={**conflict}
        if item['code'] in {'ELIGIBILITY_SHORTAGE','FIXED_EXACT_EXCESS'}:
            item['slot_count']=1
            signature={k:v for k,v in item.items() if k not in {'start','end','slot_count'}}
            previous=groups[-1] if groups else None
            if (previous and previous.get('end')==item['start'] and
                {k:v for k,v in previous.items() if k not in {'start','end','slot_count'}}==signature):
                previous['end']=item['end']
                previous['slot_count']+=1
                continue
        groups.append(item)
    return groups


def eligibility_bounds(context,snapshot,rules,policy,shifts):
    ledger=ledger_for(snapshot,rules,policy,shifts,context.days[0].date,context.days[-1].date,0)
    zone=ZoneInfo(rules.timezone)
    output=[]
    for day in context.days:
        candidates=candidates_for(day.date,rules,snapshot,ledger,policy)
        fixed=[s for s in shifts if s.date==day.date]
        shortages=[]
        for requirement in mandatory_for_day(policy,day.date):
            if not any(covers_requirement(s,requirement,day.date,rules.timezone) for s in candidates+fixed):
                shortages.append({'code':'MANDATORY_EMPLOYEE_UNAVAILABLE','employee_id':requirement.employee_id,
                    'start':local_instant(day.date,requirement.start,zone).isoformat(),
                    'end':local_instant(day.date,requirement.end,zone).isoformat(),
                    'message':f'{requirement.label}：Availability 或岗位资格不允许覆盖完整要求，不能强行安排。'})
        for band in day.coverage:
            left=local_instant(day.date,band.start,zone);right=local_instant(day.date,band.end,zone)
            while left<right:
                end=left+timedelta(minutes=30)
                eligible=sorted({s.employee_id for s in candidates+fixed if s.start<=left and s.end>=end})
                locked=sorted({s.employee_id for s in fixed if s.start<=left and s.end>=end})
                if len(eligible)<band.staff or len(locked)>band.staff:
                    available=sorted(e.id for e in snapshot.employees if availability_covers(snapshot,e.id,left,end))
                    shortages.append({'start':left.isoformat(),'end':end.isoformat(),'required':band.staff,
                        'eligible_employee_ids':eligible,'fixed_employee_ids':locked,
                        'available_employee_ids':available,
                        'code':'ELIGIBILITY_SHORTAGE' if len(eligible)<band.staff else 'FIXED_EXACT_EXCESS'})
                left=end
        # Necessary two-period capacity bound, not a choice/search procedure.
        # Each employee contributes at most 2 ONLY if one legal shift can cover both instants.
        pair_conflicts=[]
        if all(rules.compliance_for(e.id).maximum_shifts_per_day==1 for e in snapshot.employees):
            points=[(local_instant(day.date,b.start,zone),b.staff,b.start) for b in day.coverage]
            for i,(a,need_a,clock_a) in enumerate(points):
                for b,need_b,clock_b in points[i+1:]:
                    # A point shortage already has a precise slot finding. Reserve the
                    # combined bound for cases where each point alone has enough people.
                    individual_a={s.employee_id for s in candidates+fixed if s.start<=a and s.end>=a+timedelta(minutes=30)}
                    individual_b={s.employee_id for s in candidates+fixed if s.start<=b and s.end>=b+timedelta(minutes=30)}
                    if len(individual_a)<need_a or len(individual_b)<need_b:
                        continue
                    capacity=sum(max([int(s.start<=a and s.end>=a+timedelta(minutes=30))+
                        int(s.start<=b and s.end>=b+timedelta(minutes=30)) for s in candidates+fixed
                        if s.employee_id==e.id] or [0]) for e in snapshot.employees)
                    if capacity<need_a+need_b:
                        pair_conflicts.append({'code':'COMBINED_PERIOD_STAFF_SHORTAGE','periods':[clock_a,clock_b],
                            'required_period_coverage':need_a+need_b,'maximum_period_coverage':capacity,
                            'message':f'{clock_a} 与 {clock_b} 合计需要 {need_a+need_b} 人次覆盖；Full 可覆盖两段，但每人每日一个完整班次的现有候选最多提供 {capacity} 人次覆盖。'})
        shortages.extend(pair_conflicts)
        output.append({'date':str(day.date),'candidate_count':len(candidates),'proven_slot_conflicts':shortages,
                       'conflict_groups':group_conflicts(shortages),
                       'existing_shift_count':len(fixed),
                       'bound_only':True,'feasibility_proven':False})
    return output


def residual_capacity_sufficient(day,shifts,candidates,coverage,rules):
    """Reject only provably stranded partial days; never select or search a schedule."""
    slots=[s for s in coverage if s.date==day]
    deficits=[s for s in slots if s.difference<0]
    if not deficits:return True
    today=[s for s in shifts if s.date==day]
    possible=[]
    for candidate in candidates:
        own=[s for s in today if s.employee_id==candidate.employee_id]
        if len(own)>=rules.compliance_for(candidate.employee_id).maximum_shifts_per_day:continue
        if any(s.start<candidate.end and candidate.start<s.end for s in own):continue
        if any(s.difference>=0 and candidate.start<=s.start and candidate.end>=s.end for s in slots):continue
        possible.append(candidate)
    return all(len({c.employee_id for c in possible if c.start<=s.start and c.end>=s.end})>=-s.difference for s in deficits)

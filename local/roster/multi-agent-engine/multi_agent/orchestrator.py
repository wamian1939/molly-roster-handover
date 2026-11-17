from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import json

from pydantic import ValidationError as SchemaError
from .contracts import (DailyScheduleProposal, FinalAudit, FinalSchedule, SchedulingContext,
    UnassignedStaffReview, ValidationError, ValidationReport, Policy, RequirementUnderstanding, DailySelection)
from .domain import (candidates_for, context_for, digest, fixed_shifts, ledger_for, priority, same_context)
from .validator import validate, validate_calendar
from .preflight import eligibility_bounds,residual_capacity_sufficient
from .business import mandatory_for_day,covers_requirement,unmet_requirements,target_progress,target_selection_term,business_report
from engine.clock import minutes_between


class SchedulingFailure(Exception):
    pass


class Orchestrator:
    def __init__(self, provider, rules, snapshot, start, end, *, policy=None, trace_dir=None, on_event=None, run_id=None, roster_roles=None):
        self.provider, self.rules, self.snapshot = provider, rules.model_copy(deep=True), snapshot.model_copy(deep=True)
        self.start, self.end = start, end
        self.policy = policy or Policy()
        self.run_id = run_id or str(uuid4())
        self.trace_dir = Path(trace_dir) if trace_dir else None
        self.on_event = on_event
        self.version = 0
        self.shifts, self.history, self.events = [], [], []
        self.context = None
        self.review = None
        self.ledger = ledger_for(snapshot,rules,self.policy,[],start,end,0)
        self.calls = []
        self.roster_roles = roster_roles or {}
        self.accepted_dates=set()
        self.partial_dates=set()
        self.failed_days=[]

    def event(self, kind, **data):
        item = {"sequence":len(self.events),"time":datetime.now(timezone.utc).isoformat(),
                "kind":kind,"state_version":self.version,**data}
        self.events.append(item)
        if self.trace_dir:
            self.trace_dir.mkdir(parents=True,exist_ok=True)
            with (self.trace_dir / "events.jsonl").open("a",encoding="utf-8") as stream:
                stream.write(json.dumps(item,ensure_ascii=False,default=str)+"\n")
        if self.on_event:
            self.on_event(item)

    def ask(self, agent, payload, output_type):
        # A JSON round-trip is an isolation boundary: providers cannot mutate shared state.
        inputs = json.loads(json.dumps(payload,default=str,ensure_ascii=False))
        self.event("AGENT_RUNNING",agent=agent,date=payload.get("date"))
        raw, usage = self.provider.generate(agent,inputs,output_type.model_json_schema())
        self.calls.append(usage)
        self.event("AGENT_OUTPUT",agent=agent,input_hash=digest(inputs),input=inputs,output=raw,usage=usage)
        return output_type.model_validate(raw)

    def commit(self, shifts, through=None, allow_shortfall=False):
        # Commit is atomic in memory and ONLY follows independent validation.
        active_dates=(self.accepted_dates|self.partial_dates|({through} if through else set())) if self.policy.continue_on_day_failure else None
        partial=self.partial_dates|({through} if through and allow_shortfall else set())
        report = validate(self.context,self.snapshot,self.rules,self.policy,shifts,through,active_dates=active_dates,shortfall_dates=partial)
        self.event("VALIDATION",date=through,report=report.model_dump(mode="json"))
        if not report.valid:
            return report
        version = self.version+1
        ledger = ledger_for(self.snapshot,self.rules,self.policy,shifts,self.start,self.end,version)
        verified = validate(self.context,self.snapshot,self.rules,self.policy,shifts,through,ledger,active_dates=active_dates,shortfall_dates=partial)
        if not verified.valid:
            return verified
        self.shifts, self.ledger, self.version = list(shifts), ledger, version
        if through:
            if allow_shortfall:self.partial_dates.add(through)
            else:self.accepted_dates.add(through)
        self.history.append({"date":str(through) if through else "REVIEW", "ledger":ledger.model_dump(mode="json")})
        self.event("PARTIAL_COMMITTED" if allow_shortfall else "COMMITTED",date=through,ledger=ledger.model_dump(mode="json"),
            assignments=[s.model_dump(mode='json') for s in self.shifts])
        if through and allow_shortfall:
            full=validate(self.context,self.snapshot,self.rules,self.policy,shifts,through,active_dates={through})
            finding={'date':str(through),'reason':'BEST_EFFORT_INCOMPLETE',
                'errors':[e.model_dump(mode='json') for e in full.errors if e.date==through or e.date is None],
                'coverage':[s.model_dump(mode='json') for s in full.coverage if s.date==through],
                'scheduled_shift_count':len([s for s in shifts if s.date==through])}
            self.failed_days.append(finding)
            self.event('DAY_INCOMPLETE',date=through,errors=finding['errors'],coverage=finding['coverage'])
        return verified

    def run(self):
        self.event("RUN_STARTED",provider=self.provider.name,policy=self.policy.model_dump(),source=self.snapshot.source)
        try:
            expected = context_for(self.rules,self.snapshot,self.start,self.end,self.policy)
            self.shifts = fixed_shifts(self.snapshot,self.start,self.end)
            self.ledger = ledger_for(self.snapshot,self.rules,self.policy,self.shifts,self.start,self.end,0)
            self.event("INITIAL_LEDGER",ledger=self.ledger.model_dump(mode="json"))
            errors = []
            for attempt in range(self.policy.max_repairs+1):
                try:
                    context = self.ask("requirement",{"authoritative_context":expected.model_dump(mode="json",include=set(RequirementUnderstanding.model_fields)),
                        "rules":self.rules.model_dump(mode="json"),"snapshot":self.snapshot.model_dump(mode="json"),
                        "business_rules":expected.business_rules,"rating_hour_targets":expected.rating_hour_targets,
                        "validation_errors":errors},RequirementUnderstanding)
                    if not same_context(context,expected):
                        raise ValueError("Requirement Agent altered authoritative RuleSet/Snapshot semantics")
                    self.context = expected.model_copy(update={"priorities":context.priorities},deep=True)
                    self.event("CONTEXT_ACCEPTED",context=self.context.model_dump(mode="json"))
                    self.event("AGENT_COMPLETED",agent="requirement")
                    break
                except (SchemaError,ValueError) as error:
                    errors=[{"code":"CONTEXT_MISMATCH","message":str(error)}]
                    self.event("REPAIR_ROUTED",agent="requirement",attempt=attempt,errors=errors)
            if self.context is None:
                raise SchedulingFailure("Requirement Agent exhausted context repair budget")
            bounds=eligibility_bounds(self.context,self.snapshot,self.rules,self.policy,self.shifts)
            self.event("ELIGIBILITY_BOUNDS",days=bounds)
            conflicts=[d for d in bounds if d["proven_slot_conflicts"]]
            if conflicts and not self.policy.continue_on_day_failure:
                self.event("REPAIR_REQUIRES_NEW_RUN",target="RULES_OR_SOURCE",conflicts=conflicts)
                raise SchedulingFailure("Authoritative source has proven coverage eligibility/fixed-shift conflicts: "+str(conflicts))
            for index, day in enumerate(self.context.days):
                bound=next(b for b in bounds if b['date']==str(day.date))
                if bound['proven_slot_conflicts'] and self.policy.continue_on_day_failure and not self.policy.best_effort:
                    self.failed_days.append({'date':str(day.date),'reason':'PROVEN_SOURCE_SHORTAGE',
                        'errors':bound['proven_slot_conflicts']})
                    self.event('DAY_FAILED',date=day.date,errors=bound['proven_slot_conflicts'])
                    continue
                candidates = candidates_for(day.date,self.rules,self.snapshot,self.ledger,self.policy)
                if self.policy.incremental_daily_selection or self.policy.best_effort:
                    if self.schedule_incrementally(day,candidates,best_effort=bool(bound['proven_slot_conflicts']) and self.policy.best_effort):
                        continue
                    if self.policy.continue_on_day_failure:
                        self.failed_days.append({'date':str(day.date),'reason':'DAILY_REPAIR_EXHAUSTED',
                            'errors':[{'message':'No valid complete daily selection within repair budget'}]})
                        self.event('DAY_FAILED',date=day.date,errors=self.failed_days[-1]['errors'])
                        continue
                    raise SchedulingFailure(f'Incremental daily selection failed {day.date}')
                # Short per-call references prevent the LLM mixing similar canonical employee IDs.
                by_id = {f'C{i+1:03}':s for i,s in enumerate(candidates)}
                hours = {e.employee_id:e for e in self.ledger.employees}
                people = {e.id:e for e in self.snapshot.employees}
                from zoneinfo import ZoneInfo
                zone=ZoneInfo(self.rules.timezone)
                ranked = [{"id":ref,"employee_id":s.employee_id,"employee_name":people[s.employee_id].name,
                    "rating":people[s.employee_id].score,"pattern_name":s.pattern_name,
                    "start":s.start.isoformat(),"end":s.end.isoformat(),
                    "local_start":s.start.astimezone(zone).strftime("%H:%M"),
                    "local_end":s.end.astimezone(zone).strftime("%H:%M")} for ref,s in by_id.items()]
                ledger_input=self.ledger.model_dump(mode="json")
                for row in ledger_input["employees"]:
                    row.pop("availability")
                    row['employee_name']=people[row['employee_id']].name
                    row.update(priority(people[row["employee_id"]],row["total_scheduled_minutes"],self.rules,self.policy))
                ledger_input["employees"].sort(key=lambda row:-row["priority"])
                weighted_priority={row["employee_id"]:row["priority"] for row in ledger_input["employees"]}
                ranked.sort(key=lambda row:(-weighted_priority[row["employee_id"]],row["employee_id"],row["id"]))
                remaining=[]
                for future in self.context.days[index+1:]:
                    options=candidates_for(future.date,self.rules,self.snapshot,self.ledger,self.policy)
                    remaining.append({**future.model_dump(mode="json"),"eligible_employees_by_pattern":{
                        name:sorted({s.employee_id for s in options if s.pattern_name==name}) for name in future.patterns}})
                errors, previous = [], None
                for attempt in range(self.policy.max_repairs+1):
                    try:
                        proposal = self.ask("daily",{"date":str(day.date),"day":day.model_dump(mode="json"),
                            "ledger":ledger_input,"policy":self.policy.model_dump(),
                            "mandatory_coverage":[r.model_dump() for r in mandatory_for_day(self.policy,day.date)],
                            "candidates":ranked,"locked_shifts":[s.model_dump(mode="json") for s in self.shifts if s.date==day.date],
                            "remaining_days":remaining,
                            "limits":{"enforce_work_rest_limits":self.rules.enforce_work_rest_limits,
                                "compliance":self.rules.compliance.model_dump(),"employee_limits":{
                                    k:v.model_dump() for k,v in self.rules.employee_limits.items()}},
                            "validation_errors":errors,
                            "previous_proposal":previous},DailyScheduleProposal)
                        previous = proposal.model_dump(mode="json")
                        if proposal.date != day.date or proposal.ledger_version != self.version:
                            raise ValueError("Proposal date or ledger version is stale")
                        if len({c.candidate_id for c in proposal.choices}) != len(proposal.choices):
                            raise ValueError("Repeated candidate IDs")
                        selected = [by_id[c.candidate_id].model_copy(update={"reason":c.reason}) for c in proposal.choices]
                        report = self.commit(self.shifts+selected,day.date)
                        if report.valid:
                            self.event("AGENT_COMPLETED",agent="daily",date=day.date)
                            break
                        errors = [e.model_dump(mode="json") for e in report.errors]
                    except (SchemaError, ValueError, KeyError) as error:
                        errors=[{"code":"DAILY_SCHEMA","message":str(error)}]
                        if isinstance(error,KeyError):
                            errors[0]['message']='Unknown candidate reference. Choose ONLY the supplied C-number IDs; never construct an employee/time ID. Rejected: '+str(error)
                    self.event("REPAIR_ROUTED",agent="daily",date=day.date,attempt=attempt,errors=errors)
                else:
                    if self.policy.continue_on_day_failure:
                        self.failed_days.append({'date':str(day.date),'reason':'DAILY_REPAIR_EXHAUSTED','errors':errors})
                        self.event('DAY_FAILED',date=day.date,errors=errors)
                        continue
                    raise SchedulingFailure(f"Daily Agent failed {day.date}; prior accepted dates preserved; {errors[:3]}")
            self.review_and_audit()
            report = validate(self.context,self.snapshot,self.rules,self.policy,self.shifts,ledger=self.ledger)
            safe=validate(self.context,self.snapshot,self.rules,self.policy,self.shifts,ledger=self.ledger,shortfall_dates=self.partial_dates)
            if not report.valid and not (self.policy.best_effort and self.partial_dates and safe.valid):
                raise SchedulingFailure("Final independent validation failed")
            calendar = self.serialize_calendar()
            serialization_errors=validate_calendar(calendar,self.shifts,self.snapshot,self.roster_roles)
            if serialization_errors:
                raise SchedulingFailure(str([e.model_dump() for e in serialization_errors]))
            result = self.result("DRAFT_VALIDATED" if report.valid else "FAILED",report,calendar)
        except Exception as error:
            # A failure never exposes a successful-looking export. Partial state remains traceable.
            errors = [ValidationError(code="RUN_FAILED",message=f"{type(error).__name__}: {error}")]
            partial=validate(self.context,self.snapshot,self.rules,self.policy,self.shifts,ledger=self.ledger) if self.context else None
            calendar=None
            if self.policy.best_effort and self.partial_dates and self.context:
                safe=validate(self.context,self.snapshot,self.rules,self.policy,self.shifts,ledger=self.ledger,
                    active_dates=self.accepted_dates|self.partial_dates,shortfall_dates=self.partial_dates)
                if safe.valid:
                    try:
                        candidate=self.serialize_calendar()
                        if not validate_calendar(candidate,self.shifts,self.snapshot,self.roster_roles):calendar=candidate
                    except (ValueError,KeyError):pass
            result = self.result("FAILED",ValidationReport(valid=False,errors=errors+(partial.errors if partial else []),
                coverage=partial.coverage if partial else []),calendar)
        self.event("RUN_FINISHED",status=result.status)
        if self.trace_dir:
            (self.trace_dir/"result.json").write_text(result.model_dump_json(indent=2),encoding="utf-8")
        return result

    def schedule_incrementally(self,day,candidates,best_effort=False):
        """LLM chooses each shift. Deterministic code only filters illegal additions and counts residual demand."""
        from zoneinfo import ZoneInfo
        zone=ZoneInfo(self.rules.timezone)
        people={p.id:p for p in self.snapshot.employees}
        targets={row['employee_id']:row for row in self.context.rating_hour_targets}
        hours={row.employee_id:row for row in self.ledger.employees}
        active=self.accepted_dates|self.partial_dates|{day.date}
        feedback=[]
        best=None
        best_score=-1
        initial=validate(self.context,self.snapshot,self.rules,self.policy,self.shifts,day.date,active_dates=active,shortfall_dates=self.partial_dates)
        # Necessary per-slot upper bound, never a combinatorial assignment solver.
        upper=sum(min(s.required,len({c.employee_id for c in candidates+self.shifts if c.date==day.date and c.start<=s.start and c.end>=s.end}))
            for s in initial.coverage if s.date==day.date)
        for attempt in range(self.policy.max_repairs+1):
            relaxed=best_effort or (self.policy.best_effort and attempt==self.policy.max_repairs)
            chosen=[]
            for step in range(len(people)+1):
                current=validate(self.context,self.snapshot,self.rules,self.policy,self.shifts+chosen,
                    day.date,active_dates=active,shortfall_dates=self.partial_dates)
                if self.policy.best_effort:
                    safe=validate(self.context,self.snapshot,self.rules,self.policy,self.shifts+chosen,day.date,
                        active_dates=active,shortfall_dates=self.partial_dates|{day.date})
                    score=sum(min(s.required,s.scheduled) for s in current.coverage if s.date==day.date)
                    if safe.valid and score>best_score:best,best_score=list(chosen),score
                if current.valid:
                    report=self.commit(self.shifts+chosen,day.date)
                    if report.valid:
                        self.event('AGENT_COMPLETED',agent='daily',date=day.date)
                        return True
                legal={}
                pending=unmet_requirements(self.policy,day.date,self.shifts+chosen,self.rules.timezone)
                first_deficit=next((s for s in current.coverage if s.date==day.date and s.difference<0),None)
                for i,candidate in enumerate(candidates):
                    if candidate.id in {s.id for s in chosen}:continue
                    if not relaxed and pending and not covers_requirement(candidate,pending[0],day.date,self.rules.timezone):continue
                    if not relaxed and not pending and first_deficit and not (candidate.start<=first_deficit.start and candidate.end>=first_deficit.end):continue
                    if relaxed and not any(s.difference<0 and candidate.start<=s.start and candidate.end>=s.end for s in current.coverage if s.date==day.date):continue
                    trial=validate(self.context,self.snapshot,self.rules,self.policy,self.shifts+chosen+[candidate],
                        day.date,active_dates=active,allow_incomplete_mandatory=True,shortfall_dates=self.partial_dates)
                    if any(error.code not in {'EXACT_COVERAGE','OPENING_COUNT'} for error in trial.errors):continue
                    if any(slot.difference>0 for slot in trial.coverage):continue
                    starts=sum(s.date==day.date and s.start.astimezone(zone).strftime('%H:%M')==day.opening_start
                        for s in self.shifts+chosen+[candidate])
                    if starts>day.opening_count:continue
                    if not relaxed and not residual_capacity_sufficient(day.date,self.shifts+chosen+[candidate],candidates,trial.coverage,self.rules):continue
                    legal[f'C{i+1:03}']=candidate
                if relaxed and pending:
                    mandatory={ref:c for ref,c in legal.items() if covers_requirement(c,pending[0],day.date,self.rules.timezone)}
                    if mandatory:legal=mandatory
                if not legal:
                    feedback=[{'code':'NO_LEGAL_ADDITION','message':'Current same-day choices leave deficits with no legal addition. Choose a different mixture.',
                        'rejected_attempt':[{'employee':people[s.employee_id].name,'pattern':s.pattern_name,
                            'start':s.start.astimezone(zone).strftime('%H:%M'),'end':s.end.astimezone(zone).strftime('%H:%M')} for s in chosen]}]
                    self.event('REPAIR_ROUTED',agent='daily',date=day.date,attempt=attempt,errors=feedback)
                    break
                rows=[{'id':ref,'employee_name':people[s.employee_id].name,'employee_id':s.employee_id,
                    'rating':people[s.employee_id].score,'pattern':s.pattern_name,
                    'start':s.start.astimezone(zone).strftime('%H:%M'),'end':s.end.astimezone(zone).strftime('%H:%M')}
                    for ref,s in legal.items()]
                for row in rows:
                    employee_id=row['employee_id'];candidate=legal[row['id']]
                    assigned=(hours[employee_id].target_assigned_minutes or 0)+sum(minutes_between(s.start,s.end) for s in chosen if s.employee_id==employee_id)
                    progress=target_progress(targets.get(employee_id),assigned)
                    row.update(progress)
                    term=target_selection_term(progress,minutes_between(candidate.start,candidate.end),self.policy)
                    row['target_priority_term']=round(term,6)
                    base=priority(people[employee_id],hours[employee_id].total_scheduled_minutes,self.rules,self.policy)['priority']
                    row['selection_priority']=round(base+term,6)
                    row['coverage_gain_minutes']=30*sum(s.difference<0 and candidate.start<=s.start and candidate.end>=s.end for s in current.coverage if s.date==day.date)
                    target=progress.get('target_scheduled_minutes')
                    row['projected_target_excess_minutes']=max(0,assigned+minutes_between(candidate.start,candidate.end)-target) if target is not None else None
                rows.sort(key=lambda row:(-row['coverage_gain_minutes'] if relaxed else 0,-row['selection_priority']))
                try:
                    selection=self.ask('daily',{'interaction_mode':'SELECT_ONE','date':str(day.date),'step':step,
                        'policy':self.policy.model_dump(),'best_effort':relaxed,
                        'objective':'Maximize covered required person-minutes first; ratings and hour targets are secondary. Never exceed any slot or violate availability, qualification or hour limits.',
                        'ledger_version':self.ledger.version,
                        'mandatory_pending':[r.model_dump() for r in pending],
                        'rating_hour_targets':self.context.rating_hour_targets,
                        'ledger':[{'employee_id':r.employee_id,'scheduled_minutes':r.total_scheduled_minutes,
                                   'remaining_capacity_hours':r.remaining_hours_capacity} for r in self.ledger.employees],
                        'remaining_deficits':[{'start':s.start.astimezone(zone).strftime('%H:%M'),
                            'end':s.end.astimezone(zone).strftime('%H:%M'),'need_more':-s.difference}
                            for s in current.coverage if s.date==day.date and s.difference<0],
                        'chosen_today':[{'employee_name':people[s.employee_id].name,'pattern':s.pattern_name,
                            'start':s.start.astimezone(zone).strftime('%H:%M'),'end':s.end.astimezone(zone).strftime('%H:%M')} for s in chosen],
                        'legal_candidates':rows,'previous_attempt_feedback':feedback},DailySelection)
                    if selection.candidate_id not in legal:raise ValueError('Choose only a currently listed C-number')
                    chosen.append(legal[selection.candidate_id].model_copy(update={'reason':selection.reason}))
                    self.event('DAILY_CHOICE',agent='daily',date=day.date,step=step,candidate_id=selection.candidate_id,
                        employee_name=people[chosen[-1].employee_id].name,pattern=chosen[-1].pattern_name)
                except (SchemaError,ValueError,RuntimeError) as error:
                    if isinstance(error,RuntimeError) and not self.policy.best_effort:raise
                    feedback=[{'code':'SELECTION_SCHEMA','message':str(error)}]
                    self.event('REPAIR_ROUTED',agent='daily',date=day.date,attempt=attempt,errors=feedback)
                    break
            if best is not None and best_score>=upper:break
        if self.policy.best_effort and best is not None:
            if self.commit(self.shifts+best,day.date,allow_shortfall=True).valid:
                self.event('AGENT_COMPLETED',agent='daily',date=day.date)
                return True
        return False

    def review_and_audit(self):
        errors = []
        for attempt in range(self.policy.max_repairs+1):
            rows = self.ledger.employees
            unassigned = sorted(r.employee_id for r in rows if r.total_scheduled_minutes==0)
            low = sorted(r.employee_id for r in rows if 0<r.total_scheduled_minutes<self.policy.low_minutes)
            try:
                review = self.ask("review",{"unassigned_employee_ids":unassigned,"low_hours_employee_ids":low,
                    "ledger":self.ledger.model_dump(mode="json"),"snapshot":self.snapshot.model_dump(mode="json"),
                    "policy":self.policy.model_dump(),
                    "rating_hour_targets":self.context.rating_hour_targets,
                    "opportunity_priorities":[{"employee_id":p.id,**priority(p,
                        next(r.total_scheduled_minutes for r in rows if r.employee_id==p.id),self.rules,self.policy)}
                        for p in self.snapshot.employees],
                    "shifts":[s.model_dump(mode="json") for s in self.shifts],"validation_errors":errors},UnassignedStaffReview)
                if review.unassigned_employee_ids!=unassigned or review.low_hours_employee_ids!=low:
                    raise ValueError("Review omitted or invented unassigned/low-hours employees")
                if self.policy.fairness_weight==0 and review.replacements:
                    raise ValueError('Fairness disabled: review must report only and cannot recommend hours-balancing replacements')
                self.review=review
                self.event("AGENT_COMPLETED",agent="review")
                report = validate(self.context,self.snapshot,self.rules,self.policy,self.shifts,ledger=self.ledger)
                audit = self.ask("audit",{"review":review.model_dump(mode="json"),
                    "independent_validation":report.model_dump(mode="json"),"ledger":self.ledger.model_dump(mode="json"),
                    "shifts":[s.model_dump(mode="json") for s in self.shifts],
                    "snapshot":self.snapshot.model_dump(mode="json"),"policy":self.policy.model_dump(),
                    "known_failed_days":self.failed_days,"validation_errors":errors},FinalAudit)
                self.event("AGENT_COMPLETED",agent="audit")
                known_failed_dates={d['date'] for d in self.failed_days}
                unresolved_actions=[a for a in audit.actions if not (self.policy.continue_on_day_failure and
                    a.target=='DAILY' and str(a.date) in known_failed_dates)]
                if any(action.target!="REVIEW" for action in unresolved_actions):
                    self.event("REPAIR_REQUIRES_NEW_RUN",actions=[a.model_dump(mode="json") for a in audit.actions])
                    raise SchedulingFailure("Audit routed source/day repair after commit; V1 forbids automatic cross-day replanning")
                if unresolved_actions:
                    raise ValueError("Audit requested review repair: "+audit.analysis)
                changed = list(self.shifts)
                seen_shifts, seen_indices = set(), set()
                for idx in audit.approved_replacement_indices:
                    if idx<0 or idx>=len(review.replacements) or idx in seen_indices:
                        raise ValueError("Invalid/duplicate replacement index")
                    seen_indices.add(idx)
                    replacement = review.replacements[idx]
                    if replacement.shift_id in seen_shifts:
                        raise ValueError("Multiple replacements target same shift")
                    seen_shifts.add(replacement.shift_id)
                    found = next((i for i,s in enumerate(changed) if s.id==replacement.shift_id),None)
                    if found is None or changed[found].fixed:
                        raise ValueError("Replacement targets a missing or locked shift")
                    if changed[found].employee_id==replacement.employee_id:
                        raise ValueError("Replacement must change employee")
                    changed[found] = changed[found].model_copy(update={"employee_id":replacement.employee_id,
                        "reason":"REPLACE_EMPLOYEE: "+replacement.reason})
                if seen_indices:
                    replacement_report = self.commit(changed)
                    if not replacement_report.valid:
                        errors=[e.model_dump(mode="json") for e in replacement_report.errors]
                        raise ValueError("Replacement rejected by independent validator")
                self.review = review
                self.event("REVIEW_ACCEPTED",audit=audit.model_dump(mode="json"),review=review.model_dump(mode="json"),replacements=len(seen_indices))
                return
            except (SchemaError,ValueError) as error:
                errors=[*errors,{"code":"REVIEW_REPAIR","message":str(error)}]
                self.event("REPAIR_ROUTED",agent="review",attempt=attempt,errors=errors)
        raise SchedulingFailure("Review/audit exhausted repair budget")

    def serialize_calendar(self):
        from .serialization import serialize_calendar
        return serialize_calendar(self.snapshot,self.rules,self.run_id,self.roster_roles,self.shifts,self.start,self.end)

    def result(self,status,report,calendar):
        return FinalSchedule(run_id=self.run_id,status=status,source=self.snapshot.source,
            provider=self.provider.name,rule_version=self.rules.version,snapshot_version=self.snapshot.version,
            state_version=self.version,policy=self.policy,failed_days=self.failed_days,incomplete_dates=sorted(self.partial_dates),
            business_rule_report=business_report(self.snapshot,self.rules,self.policy,self.start,self.end,self.shifts) if self.context else None,
            context=self.context,assignments=self.shifts,ledger=self.ledger,
            review=self.review,validation=report,calendar=calendar)

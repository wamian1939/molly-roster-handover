"""Reuse Roster's read-only adapter and official Evaluate workforce authority."""
from adapters.real import (_roster_connection, _evaluate, _session_cookie,
    accessible_stores, effective_job_skill_requirements, load_snapshot,
    map_historical_shift_roles, read_roster_rule_hints, SourceReadError, SourceAccessError)
from api.storage import latest_rules, DATA_FILE
from .fixtures import example_rules, synthetic_snapshot


def require_access(store_id,cookie):
    if store_id not in {s["id"] for s in accessible_stores(cookie)}:
        raise SourceAccessError("Store is outside the signed-in account's access")


def real_inputs(store_id,start,end,cookie):
    require_access(store_id,cookie)
    rules=latest_rules(store_id) if DATA_FILE.is_file() else None
    if rules is None:
        raise SourceReadError("Save and confirm a RuleSet in the existing Lab first")
    hints=read_roster_rule_hints(store_id)
    source_zone=(hints.get("settings") or {}).get("timezone")
    if source_zone!=rules.timezone and not (source_zone is None and rules.timezone_source=="LAB_CONFIRMED"):
        raise SourceReadError("Saved rules and current Roster timezone differ")
    snapshot=load_snapshot(store_id,start,end,cookie,rules.timezone,timezone_source=rules.timezone_source)
    jobs=_evaluate(f"/store-jobs?storeId={store_id}",_session_cookie(cookie))
    with _roster_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute('''SELECT id, "storeId", code, "nameZh", "colorToken", "requiredSkillCodes", "isActive"
                FROM shift_roles WHERE ("storeId"=%s OR "storeId" IS NULL) AND "isActive"=TRUE''',(store_id,))
            rows=cursor.fetchall()
    mapping=map_historical_shift_roles(jobs,rows,store_id)
    by_job={}
    for row in rows:
        job=mapping.get(row["id"])
        if job is None:
            continue
        previous=by_job.get(job)
        job_code=next(j["code"] for j in jobs if j["id"]==job)
        rank=(row["code"]==job_code,row["storeId"]==store_id)
        if previous is not None:
            previous_rank=(previous["code"]==job_code,previous["storeId"]==store_id)
            if previous_rank==rank:
                raise SourceReadError("Ambiguous active Roster role mapping")
            if rank<previous_rank:
                continue
        by_job[job]={**row,"formalJobId":job}
    if snapshot.role_required_skills!=effective_job_skill_requirements(jobs,rows,store_id,mapping):
        raise SourceReadError("Role skill source changed during input preparation; reload")
    return rules,snapshot,by_job


def inputs(source,store_id,start,end,cookie,scenario="balanced"):
    if source=="REAL":
        return real_inputs(store_id,start,end,cookie)
    rules=example_rules()
    if store_id!=rules.store_id:
        raise ValueError("Synthetic fixture is scoped to the example RuleSet store")
    return rules,synthetic_snapshot(start,end,rules,scenario),{}

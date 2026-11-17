"""Build an independent scheduling input from the editable current calendar."""
from zoneinfo import ZoneInfo


def replan_snapshot(snapshot, start, end):
    # DRAFT/PUBLISHED are legacy storage labels, not calendar edit permissions.
    # Only an explicit LOCKED record is retained; never infer a lock from publication.
    zone=ZoneInfo(snapshot.timezone)
    result=snapshot.model_copy(deep=True)
    result.existing_shifts=[s for s in result.existing_shifts if not (
        s.store_id==snapshot.store_id and start<=s.start.astimezone(zone).date()<=end and s.status!='LOCKED')]
    removed=len(snapshot.existing_shifts)-len(result.existing_shifts)
    # Leave the shared legacy CP-SAT contract untouched; identify the new semantics
    # in this engine's version and integration scheduling_mode instead.
    result.version=f'{snapshot.version}|multi-agent-replan:{start}:{end}'
    return result,removed

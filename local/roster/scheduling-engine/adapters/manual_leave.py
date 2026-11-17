from __future__ import annotations

from datetime import timezone
from hashlib import sha256

from engine.models import Snapshot, TimeWindow


def apply_reviewed_leave(snapshot: Snapshot, reviewed: list[TimeWindow]) -> Snapshot:
    combined = [*snapshot.approved_leave, *reviewed]
    intervals = sorted((item.employee_id, item.start.astimezone(timezone.utc).isoformat(),
                        item.end.astimezone(timezone.utc).isoformat()) for item in combined)
    fingerprint = sha256(repr(intervals).encode()).hexdigest()[:20]
    return snapshot.model_copy(update={
        "approved_leave": combined,
        "version": f"{snapshot.version}|reviewed-leave:{fingerprint}",
    })

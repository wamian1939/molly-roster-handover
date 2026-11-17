"""Replay a pseudonymized real-size Hurstville snapshot; never exports names/IDs."""
import hashlib
import json
import pathlib
import sys
import time
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scheduling-engine"))
from engine.models import RuleSet, Snapshot, SolveMode
from engine.v2 import V2Policy, solve_v2, replay_coverage


def pseudonymize(snapshot):
    data = snapshot.model_dump(mode="json")
    ids = {employee["id"]: f"employee-{i:03}" for i, employee in enumerate(data["employees"])}
    for employee in data["employees"]:
        employee["id"] = ids[employee["id"]]
        employee["name"] = employee["id"]
        employee["hourly_cost_cents"] = None
    for key in ("availability", "approved_leave", "existing_shifts"):
        for row in data[key]:
            row["employee_id"] = ids[row["employee_id"]]
            if row.get("source_shift_id"): row["source_shift_id"] = "shift-" + hashlib.sha256(row["source_shift_id"].encode()).hexdigest()[:16]
    data["version"] = "pseudonymized-real-size-benchmark"
    return Snapshot.model_validate(data)


def main():
    source = ROOT / "multi-agent-engine/.data/live-real-targets-bob-v3"
    snapshot = pseudonymize(Snapshot.model_validate_json((source / "snapshot-scheduling.json").read_text(encoding="utf-8")))
    rules_data = json.loads((source / "rules.json").read_text(encoding="utf-8"))
    # Employee-specific rules must retain the same pseudonymous mapping.
    original = json.loads((source / "snapshot-scheduling.json").read_text(encoding="utf-8"))
    ids = {e["id"]:f"employee-{i:03}" for i,e in enumerate(original["employees"])}
    for key in ("employee_limits", "employee_preferences"):
        rules_data[key] = {ids.get(k,k):v for k,v in rules_data.get(key,{}).items()}
    rules = RuleSet.model_validate(rules_data)
    start, end = date(2026,10,26), date(2026,11,1)
    began = time.monotonic()
    result = solve_v2(snapshot, rules, start, end, SolveMode.BEST_EFFORT, V2Policy(solve_seconds=30))
    elapsed = time.monotonic()-began
    report = {"source": "historical-pseudonymized-real-size", "currentLiveSnapshot": False,
        "ruleVersion": rules.version, "requirementMode": rules.requirement_mode,
        "employees": len(snapshot.employees), "availabilityWindows": len(snapshot.availability),
        "from": str(start), "to": str(end), "seconds": elapsed, "status": result.status,
        "assignments": len(result.assignments), "validationErrors": len(result.validation_errors),
        "diagnosticCodes": sorted({d.code for d in result.diagnostics}), "parameters": result.parameters,
        "publishable": False}
    report["days"] = []
    from datetime import timedelta
    for offset in range(7):
        day=start+timedelta(days=offset)
        began=time.monotonic()
        daily=solve_v2(snapshot,rules,day,day,SolveMode.BEST_EFFORT,V2Policy(solve_seconds=5))
        report["days"].append({"date":str(day),"seconds":time.monotonic()-began,"status":daily.status,
            "assignments":len(daily.assignments),"validationErrors":len(daily.validation_errors),
            "diagnosticCodes":sorted({d.code for d in daily.diagnostics})})
    try:
        import psutil
        report["processPeakBytes"] = psutil.Process().memory_info().peak_wset
    except (ImportError, AttributeError):
        if sys.platform == "win32":
            import ctypes
            from ctypes import wintypes
            class MemoryCounters(ctypes.Structure):
                _fields_=[("cb",wintypes.DWORD),("PageFaultCount",wintypes.DWORD)]+[(k,ctypes.c_size_t) for k in ("PeakWorkingSetSize","WorkingSetSize","QuotaPeakPagedPoolUsage","QuotaPagedPoolUsage","QuotaPeakNonPagedPoolUsage","QuotaNonPagedPoolUsage","PagefileUsage","PeakPagefileUsage")]
            counters=MemoryCounters(); counters.cb=ctypes.sizeof(counters)
            ctypes.windll.kernel32.GetCurrentProcess.restype=wintypes.HANDLE
            ctypes.windll.psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(MemoryCounters),wintypes.DWORD]
            if ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(),ctypes.byref(counters),counters.cb):
                report["processPeakBytes"]=counters.PeakWorkingSetSize
    output = ROOT / "sites/roster/evidence/solver-benchmark.json"
    output.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__": main()

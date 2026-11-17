"""Aggregate-only cross-database audit. Never renames, merges or deletes records."""
import json
from collections import Counter
from data import HERE


def main():
    roster=json.loads((HERE/'.local/roster-export.json').read_text(encoding='utf-8'))['tables']
    evaluate=json.loads((HERE/'.local/evaluate-export.json').read_text(encoding='utf-8'))['tables']
    employees={e['id']:e for e in evaluate['employees']}
    stores={s['id'] for s in evaluate['stores']}
    result={
        'rosterTableCounts':{k:len(v) for k,v in roster.items()},
        'evaluateTableCounts':{k:len(v) for k,v in evaluate.items()},
        'accountPasswordAlgorithms':dict(Counter('argon2id' if a['passwordHash'].startswith('$argon2id$') else 'bcrypt' if a['passwordHash'].startswith('$2') else 'unknown' for a in evaluate['user_accounts'])),
        'assignmentRowsWithUnknownCanonicalEmployee':sum(a['employeeId'] not in employees for a in roster['shift_assignments']),
        'availabilityRowsWithUnknownCanonicalEmployee':sum(a['employeeId'] not in employees for a in roster['employee_availability']),
        'periodRowsWithUnknownCanonicalStore':sum(p['storeId'] not in stores for p in roster['roster_periods']),
        'availabilityRowsWithUnknownCanonicalStore':sum(p['storeId'] not in stores for p in roster['employee_availability']),
        'timezoneSettings':sorted({s['timezone'] for s in roster['roster_store_settings']}),
        'dateStorage':'DATE strings preserved; TIMESTAMP(3) treated as Prisma UTC and exported with Z',
        'crossDatabaseAtomicSnapshot':False,
        'cloudDataImported':False,
    }
    (HERE/'evidence/data-audit.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()

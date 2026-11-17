# Molly Roster Database Model

Database: independent PostgreSQL 16 schema managed by Prisma migrations.

## Authority boundary

There is deliberately no Employee, Store, Account, Session, Evaluation, Round, Tier, or SkillDefinition authority table. Store and employee identifiers are external Evaluate Molly IDs. Roster mutations revalidate those IDs through the authenticated integration API.

## Tables

| Table | Responsibility | Key invariants |
|---|---|---|
| `roster_periods` | Store week/fortnight draft and publication state | unique store/date range; optimistic `version` |
| `shift_roles` | Global/store configurable job tags and skill requirements | unique store/code; soft deactivation |
| `shifts` | Time, role and note for a period | store repeated for scoped predicates; start before end; period/date validation in service |
| `shift_assignments` | Many employees per shift and historical display/audit snapshots | unique shift/employee; no Employee relation/table |
| `employee_availability` | Roster-owned dated availability slots | employee/store/date indexes; `UNKNOWN` may have null times |
| `shift_templates` | Store time/break/role presets | unique store/name; soft deactivation |
| `availability_templates` | Named JSON sets of relative weekday/time slots | validated JSON at API boundary |
| `roster_publications` | Immutable publication snapshots | unique period/version; restrictive period delete |
| `roster_store_settings` | Hours, slot, cycle and warning thresholds | one row per external store ID |

## Snapshot policy

Every assignment captures display name, employee type, optional employment type, official score/Tier/round/closed time visible at scheduling time. Every shift captures role name/color. Published employee output excludes score/Tier regardless of stored audit snapshot.

## Time policy

- Period and availability dates use PostgreSQL `date`.
- Shift instants and timed availability are UTC `timestamp` values derived from `Australia/Sydney` or configured IANA timezone.
- Break is integer minutes.
- Service validation enforces positive duration, break shorter than duration, configured minimum/maximum, date inside period, and no employee overlap.

## Concurrency and deletion

- Mutable aggregate records carry integer versions.
- Update/delete predicates contain ID, store ID, and expected version.
- Zero updated rows returns HTTP 409 for a stale version.
- Published periods are not directly edited or deleted.
- Shift roles/templates are deactivated when referenced rather than hard deleted.


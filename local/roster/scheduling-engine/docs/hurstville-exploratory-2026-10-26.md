# Hurstville 2026-10-26 exploratory scheduling run

This is an isolated Lab experiment with real employee, formal-job, availability and surrounding-shift data. It is **not an accepted or publishable roster**. The approved-leave list and applicable work/break policy have not been reviewed. `OPTIMAL` applies only to the simulated model below.

## Source and run

- Latest run: `7aa1cb53-279e-4bac-90f4-b74711f80753`; engine `0.1.21`; `run_purpose=EXPLORATORY`; `mode=STRICT`; date-scoped rule `hurstville:v3`. The detailed candidate table below is from historical run `e92cc6b2-1f4e-4281-81cf-900187086f66` under engine `0.1.3`, and must not be mistaken for the current employee assignments or an approved schedule. Earlier runs remain in Lab history.
- Latest source: `evaluate:f40e5470d3fdbc2d0300c54321c0d39d|source:68d8253a9313098fa183`, read on 2026-10-25 Sydney time. The comparison copy adds `|lab-comparison:2026-10-26:2026-10-26` to its snapshot version. The source fingerprint changed from the preceding `0.1.14` run because the adapter now includes every Roster availability status row.
- Latest source preview: 25 active employees, 22 effective availability windows, 41 surrounding assignments. It was refreshed before the engine `0.1.21` run and had the same fingerprint. The 13 target-date published employee assignments were excluded only from the detached optimization copy; all remained in the same-read manual reference. Lab health reported `formal_roster_write=false`.
- Lab result metadata: `comparison_mode=REPLACE_TARGET_PUBLISHED`, `approved_leave_review=UNKNOWN`, `work_break_policy_review=UNKNOWN`, `staffing_rules_review=UNKNOWN`, `acceptance_gate=NOT_ELIGIBLE`. The latest saved run is `OPTIMAL` for the simulated model in 125 ms with 9 complete assignments (5 Early, 4 Late), 50.5 modeled net hours, 24 coverage slots, seven excess staff half-hour slots, zero modeled gaps, zero diagnostics and zero independent validation errors. The comparison excluded 13 target-date published assignments only from its detached optimization copy. These aggregates do not identify which individual employees should work.

The authenticated browser refreshed the real source immediately before this `0.1.21` run: 25 employees, 22 effective availability windows, 41 surrounding assignments and the same base fingerprint above. A repeatable-read, read-only digest through `molly_roster_schedule_ro` covered its seven granted Roster tables before and after the solve. Every row count and SHA-256 digest matched: availability 96, periods 6, settings 1, assignments 66, roles 9, templates 5, shifts 28. This corroborates that this Lab solve did not change those seven tables; it does not cover ungranted formal tables or prove that no external transaction was later reversed. The UI showed the run as exploratory and unpublishable, and the saved result independently records the `NOT_ELIGIBLE` gate.

The prior `0.1.14` run `2595e7ff-a09c-4b4b-aba3-937808ede95d` retains historical source hash `afa14b6cd9941cd2cf46`. The adapter now reads Roster's explicit unavailable intervals and removes them from effective availability; a one-week restricted-source aggregate found no unavailable rows in this interval. The new run verifies the revised end-to-end read but still does not establish an approved staffing or employment policy.

## Simulated rule assumptions

The manager confirmed **10:00 preparation and 11:00 public opening**. The supplied **3/4/4** and example grouping of weekdays have not yet established whether these are complete-shift counts, effective on-duty minimums, or both, nor exactly which dates they cover. The saved one-day Lab simulation interprets them as opening headcount 3, Early complete shifts 4 and Late complete shifts 4; that interpretation is not approved. Roster settings still record a 09:00 opening; that is an outdated source setting for this store, not evidence of a 09:00 staffing requirement. The remaining values below are simulation choices, not accepted operating or employment policy:

| Input | Lab `hurstville:v3` |
| --- | --- |
| Modeled work window | Manager-confirmed preparation 10:00 and public opening 11:00; simulated employee finish 22:00. Roster's current setting still says public opening 09:00. There is no confirmed work requirement from 09:00–10:00. |
| Effective headcount demand | 10:00–11:00 at least 3; 11:00–17:00 at least 4; 17:00–22:00 at least 4, each in 30-minute slots. These demands were chosen for the experiment and have not been confirmed by the manager. |
| Complete shift counts | At least four Early and four Late; Full minimum zero. Opening qualification minimum zero because the required number is unconfirmed. |
| Early | Formal job 莉小白, 10:00 or 11:00 to 17:00; a proposed 30-minute unpaid break may start from 12:00 and must end by 16:00. The published 10:00–17:00 group records zero break minutes; its legal and operational interpretation is unresolved. |
| Full | Formal job 全岗, 10:00–22:00 with a proposed 60-minute unpaid break between 12:00 and 20:00. The manager confirmed only that the published 60-minute break has **no fixed time**; the window and paid status here are simulation inputs. |
| Late | Formal job 莉小白, 16:00 or 17:00 to 22:00, no modeled break. |
| Other work limits | Seed values: 3–12 hour gross shift, 12-hour daily and 38-hour weekly modeled net limits, 10-hour minimum rest, at most one shift per day, break required after more than six hours. None has been confirmed as the applicable policy. |

The current Lab rule is `hurstville:v3`, with `valid_from=valid_through=2026-10-26`. Although its `base_day` contains values that would otherwise inherit into other weekdays, the UI, API and direct engine now reject a run outside that date. Historical `hurstville:v1` and `v2` remain readable and had no date scope; neither is the active rule or an accepted weekly configuration. A browser input event bug caused the unsuccessful `v2` scope save; the revised date editor and a read-only SQLite check confirmed `v3` stores both bounds. Independently configured daily rules are still required for a week run.

## Observed result versus published reference

The detailed historical `0.1.3` strict run returned `OPTIMAL` in 108 ms for this model: 9 complete employee shifts, 50.5 modeled net work hours, all 24 half-hour coverage slots at or above the simulated demand, no reported demand gap, no solver diagnostic and no independent replay validation error. Five Early shifts each receive a proposed 30-minute break; no Full shift was selected. The optimizer's later preference stage was proven within its modeled objective. The latest `0.1.16` exploratory run also yielded 9 complete shifts, 24 covered slots and zero replay errors. This does not establish that leave, labor rules or the demand curve are correct.

| Run-local employee label | Complete shift | Proposed break | Modeled net hours |
| --- | --- | --- | ---: |
| E01 | Early 10:00-17:00 | 14:30-15:00 | 6.5 |
| E02 | Early 10:00-17:00 | 14:00-14:30 | 6.5 |
| E03 | Early 10:00-17:00 | 15:30-16:00 | 6.5 |
| E04 | Early 11:00-17:00 | 12:00-12:30 | 5.5 |
| E05 | Early 11:00-17:00 | 12:30-13:00 | 5.5 |
| E06 | Late 17:00-22:00 | None modeled | 5.0 |
| E07 | Late 17:00-22:00 | None modeled | 5.0 |
| E08 | Late 17:00-22:00 | None modeled | 5.0 |
| E09 | Late 17:00-22:00 | None modeled | 5.0 |

These labels are local to this report. The saved run in the ignored Lab SQLite file and the authenticated Lab UI retain the employee mapping for authorized review; no mapping or employee ID is committed with this document.

The independent replay checked each person's formal-job grant, complete-shift pattern, full availability, source fixed-shift and cross-store overlap/rest constraints, modeled work limits, and break-adjusted 30-minute coverage; it returned no errors. There were no duplicate employee shifts in this candidate. Approved leave is unknown, so an empty leave list in the exploratory snapshot is **not** a leave clearance. The result has seven excess staff half-hour slots (3.5 effective person-hours) above the simulated demand and at most one excess person in any slot. The configured objective was proven optimal for this model; the extra coverage cannot be labelled unnecessary under unreviewed operating demand.

| Date/time, formal job, recorded or modeled break | Published people | Candidate people |
| --- | ---: | ---: |
| 10:00–17:00 莉小白, 0 min | 5 | 0 |
| 10:00–17:00 莉小白, 30 min | 0 | 3 |
| 11:00–17:00 莉小白, 30 min | 0 | 2 |
| 10:00–22:00 全岗, 60 min | 1 | 0 |
| 17:00–22:00 莉小白, 0 min | 7 | 4 |

The published reference has 13 employee assignments and 82 gross scheduled person-hours, including one 60-minute break whose time and paid status are unknown. The manager confirmed that its timing was never fixed: it is a duration-only rest, and no specific start or end time needs to be supplied for that historical shift. Subtracting recorded break durations gives 81 person-hours potentially at work in the published reference; the candidate has 53 gross and 50.5 modeled active person-hours. The Lab now shows these same complete-shift totals alongside the group comparison. They cannot establish coverage at a particular time for the published schedule, payroll cost, or unnecessary labor under unapproved demand and break policy. The apparent four-person difference is not a savings estimate. No generated interval is recorded as the historical break's actual timing. The manual effective-headcount display can give only a conservative instantaneous range of 5–6 from 10:00–17:00 and 7–8 from 17:00–22:00.

## Acceptance still open

The complete daily demand curve after 10:00, closing and employee finish times, Full minimum, opening-qualified minimum, permitted complete shifts, paid/unpaid break rule and placement window, approved leave, and applicable daily/weekly/rest limits must be reviewed. Thursday–Sunday staffing requirements are also outstanding for a week run. The outdated 09:00 Roster setting should be corrected through the formal Settings workflow separately; the Lab will not change it. A manager-reviewed rule and fresh source snapshot are required before a formal Phase 5 acceptance decision; this Lab run has no formal apply or publish path.

The `0.1.3` run used the same source snapshot version as the preceding `0.1.1` exploratory run. A read-only comparison of both saved Lab results found identical employee assignments, complete-shift boundaries and proposed break options. This confirms that the draft-stability correction did not change this particular simulated Hurstville result; it does not validate the unreviewed operating or employment assumptions.

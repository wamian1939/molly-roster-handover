# Molly Roster Functional Parity Matrix

| Reference capability | Status | Implementation and proof |
|---|---|---|
| Month | Complete | FullCalendar day grid; compact multi-name chips; real Hurstville event verified. |
| Week | Complete | Time grid, navigation, overlap layout, drag/drop and resize handlers. |
| Day | Complete | Exact 09:00–10:00 real pointer flow; summary and published-state lock. |
| Drag create | Complete | Selection snaps to configured interval; Cancel produced no DB write; Save persisted. |
| Add/Edit dialog | Complete | Accessible portal, focus trap, labeled controls, validation, save feedback and two-step delete. |
| Multi staff | Complete | Two-person 10:00–17:00 shift displayed in Day and compact Month. |
| Availability | Complete | Week/fortnight, templates, explicit unknown, outside-window and conflict warnings. |
| Staff score | Complete | Latest CLOSED `EvaluationRound.aggregateOverall/Tier` only; snapshot captured on save. |
| Skill visibility | Complete | Current category percentages, qualified codes and operations skills; role warning is advisory. |
| Preset shift | Complete | Store-scoped templates prefill time, break and optional role. |
| Batch | Complete | Versioned multi-select role update and delete; real two-shift batch update succeeded. |
| Publish | Complete | Non-empty validation, optimistic version, immutable snapshot, reopen, published write lock. |
| Copy week/fortnight | Complete | Transactional offset copy; archived employees and target overlap block the operation. |
| Summary | Complete | Shift/assignment/net-hour totals, employee and role hours, skill, daily, configured-week and default-break warnings. |
| Export | Complete | Employee-safe and ADMIN manager CSV/print; real downloads captured. |
| Staff page | Complete | Read-only Evaluate directory plus Roster availability and quick/saved templates. |
| Settings | Complete | Store rules visibly control week start, calendar window/interval, minimum shift, default break and hour warnings; server validation and optimistic versions. |
| Help | Complete | Chinese operational guidance for core workflows and data semantics. |
| Store context | Complete | Provider-held selection persists across routes without localStorage; evaluator scope is server-derived. |
| Responsive | Complete | Floating desktop shell, mobile bottom navigation, 390×844 core create flow without body overflow. |
| Scale | Complete | Picker initially renders 60 of 500 and search finds later employees; automated component proof. |

No parity claim extends to the explicit non-goals in the master contract.

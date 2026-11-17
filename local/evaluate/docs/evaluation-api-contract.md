# Live Evaluation API Contract

The evaluation workflow uses an OPEN round as the live scoring context and a CLOSED round as the immutable historical snapshot. There is no Draft lifecycle and opening a form never creates an Evaluation row.

## Scoring policy

| Employee type snapshot | Policy | Skill | Speed | Initiative | Attitude | Availability | Text |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `REGULAR` | `REGULAR_V3` | 60 | 15 | 5 | 5 | 10 | 5 |
| `TRAINING` | `TRAINING_V2` | 40 | 10 | 15 | 15 | 5 | 15 |

Tier policy v2 is shared by both employee types: `T5 < 40`, `T4 < 60`, `T3 < 70`, `T2 < 85`, `T1 >= 85`. Completed historical scores and policy snapshots are never recalculated.

Opening, closing, and weekly cleaning are weighted `BINARY` skills in the `OPERATIONS` category. They contribute to the Skill component and do not use qualification voting or consensus.

## Read-only endpoints

| Endpoint | Result |
| --- | --- |
| `GET /api/employees/:employeeId/evaluation-rounds/current` | Current OPEN round or `null`; no row is created. |
| `GET /api/evaluation-rounds/:roundId` | Round metadata and role-appropriate progress. |
| `GET /api/evaluation-rounds/:roundId/aggregate` | ADMIN-only store aggregate and evaluator breakdown. |
| `GET /api/evaluation-rounds/:roundId/evaluations` | ADMIN-only individual evaluation list. |
| `GET /api/evaluation-rounds/:roundId/my-evaluation` | Current account's latest submission or `null`. |
| `GET /api/evaluation-rounds/:roundId/scoring-context` | Form input, policy metadata, and existing own submission. |
| `GET /api/evaluations/v1/:evaluationId` | Authorized individual snapshot detail; CLOSED data is read-only. |

GET routes never create a round, Evaluation, membership, or skill row and never change progress.

## Mutating endpoints

| Endpoint | Result |
| --- | --- |
| `POST /api/employees/:employeeId/scoring-context` | Gets or creates the employee's single OPEN round; does not create a submission. |
| `POST /api/evaluation-rounds/:roundId/preview-my-evaluation` | Server-authoritative preview only; does not persist. |
| `POST /api/evaluation-rounds/:roundId/analyze-my-evaluation` | Advisory AI analysis; no Evaluation is created. |
| `PUT /api/evaluation-rounds/:roundId/my-evaluation` | UPSERTs the current account's one latest submission in the OPEN round. |
| `POST /api/evaluation-rounds/:roundId/close` | ADMIN-only transaction that freezes the round and its snapshots. |

The submission identity is unique by `roundId + evaluatorAccountId`. Re-submitting in an OPEN round updates the same row. Unsubmitted in-memory form changes are discarded on exit. CLOSED rounds and all owned snapshot rows are protected by database triggers.

## Round progress and aggregate

For an OPEN round, the denominator is the current count of active `STORE_EVALUATOR` accounts assigned to the employee's store. The numerator is the count of those accounts with a latest submission. ADMIN submissions are shown separately and never affect either progress or the store aggregate.

Closing snapshots the eligible evaluator set and completion state. A partial round may be closed; the final aggregate averages only submitted store evaluators. If no store evaluator submitted, the aggregate is `null`, not zero. The next score after close automatically creates the next OPEN round.

History and formal current score use CLOSED rounds only. The current formal score is the latest valid CLOSED round aggregate; an OPEN provisional aggregate is never substituted.

ADMIN aggregate responses include `itemAverages`, calculated only from submitted active `STORE_EVALUATOR` evaluations in that round. `components` exposes average component points together with the round policy denominator; `categories` exposes average skill mastery on a `/100` scale for back of house, water bar, front of house, and operations. ADMIN evaluations and unsubmitted accounts are excluded. A round is employee-specific and locks one `employeeTypeSnapshot` and policy snapshot, so component denominators never mix REGULAR and TRAINING policies inside a round. Empty averages are `null`, never zero.

## Navigation

Employee-list actions pass a safe internal `returnTo` target. Round detail passes itself when opening an individual Evaluation. The shared resolver accepts only paths beginning with a single `/` and rejects protocol-relative or external URLs. When context is absent after refresh or deep link, store and employee-type snapshots provide the semantic employee-list fallback.

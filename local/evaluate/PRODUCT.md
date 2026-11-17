# Product

## Register

product

## Users

Store managers, area managers, and administrators who evaluate employees across multiple retail locations. They need a fast view of current employee performance, evaluation coverage, skill capability, and recent movement.

## Product Purpose

Evaluate Molly is a multi-store employee evaluation and performance management system. Scoring System V1 has server-owned versioned policies by employee type: REGULAR_V3 uses 60/15/5/5/10/5 and TRAINING_V2 uses 40/10/15/15/5/15 across skill, speed, initiative, attitude, availability, and optional text. Each evaluator may update one latest submission while a round is OPEN; closing the round freezes its score, Tier, policy, evaluator membership, and skill snapshots. EmployeeSkill represents current capability.

Success means managers can complete an evaluation in a few minutes, understand why an employee received a score, see which roles they can perform, identify employees who have not been evaluated, and find current team skill gaps without treating missing data as poor performance.

## Brand Personality

Premium, calm, operational. The interface should feel like a polished modern SaaS dashboard: structured, data-driven, and focused on repeated manager workflows.

## Anti-references

Avoid traditional enterprise HR software, outdated table-heavy admin screens, cluttered KPI grids, excessive animation, legacy grade or risk concepts, and analytics that obscure their denominator.

## Design Principles

- Simple input, structured scoring: expose the skill matrix, four ratings, and one optional text field.
- Current state clarity: use each active employee's latest valid EvaluationRound aggregate for current score analytics, without averaging evaluations across rounds.
- Live scoring: an authorized evaluator maintains one latest submission per OPEN round. Unsubmitted form changes stay in browser memory, ADMIN close creates the immutable history snapshot, and the next score automatically opens the next round.
- Skill transparency: show current EmployeeSkill coverage and distinguish unknown skill data from explicit NotTrained status.
- Historical integrity: display CLOSED-round evaluation values and snapshots without recalculating them.
- Operational analytics: prioritize evaluation coverage, tier distribution, skill gaps, top employees, attention reasons, and recent score movement.
- Restrained motion: animation may clarify loading and state changes but must not delay manager actions.

## Accessibility & Inclusion

Use readable contrast, clear labels, visible focus states, responsive tables and panels, and reduced-motion fallbacks. Do not communicate tier, status, or attention reasons by color alone.

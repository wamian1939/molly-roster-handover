# Adversarial QA Report

Audit date: 2026-09-06
Environment: Chrome against frontend 5175/backend 4010 and PostgreSQL schema `codex_browser_acceptance_1788617534643` (disposable).

## Pass 1 — Exploratory business workflow

- Verified ADMIN and three active Store Evaluators, plus a second-store evaluator for negative scope checks.
- Every employee in the same active store showed a dynamic `/3` denominator; the second-store account could neither view nor score the main-store employees.
- Verified Training 20-point Skill policy, Regular V2 60-point Skill policy, operation skills, category summaries, T5, Training-to-Regular snapshot preservation, close, automatic next round, history, dashboard, analytics, management, source-aware navigation, deep links, and safe external-return rejection.
- Exact 390px emulation reported `innerWidth=390` and document `scrollWidth=390`.

## Pass 2 — Multi-account adversarial sequence

Employee: HandoverEmployee006; store: Browser Acceptance; eligible accounts: Evaluator A/B/C.

1. ADMIN opened Round Detail at `0 / 3`, returned to the Regular list, entered My Score, changed a Skill, and left without submission. Database count for ADMIN/HandoverEmployee006 remained zero; re-entry restored the persisted Independent state, not the abandoned Proficient input.
2. Evaluator A submitted 71.5. Evaluator B submitted 83.5. ADMIN saw `2 / 3`, Evaluator C unscored, and temporary store aggregate 77.5.
3. Evaluator A reopened the same round, loaded 71.5, changed it to 83.5, and used `更新评分`. Direct database evidence showed exactly one A row with 83.5; ADMIN no longer saw 71.5 and aggregate became 83.5 while progress remained `2 / 3`.
4. ADMIN close dialog showed `2 / 3`, missing Evaluator C, and 83.5. Closing produced a read-only final Round with the same values.
5. Evaluator A scored again after close. A different Round ID was created automatically and accepted 97.5/T1. History showed the closed 83.5 Round and excluded the new OPEN 97.5 Round.
6. ADMIN scoring remained separately labeled throughout and was never included in Store Evaluator progress or aggregate.

## Security and failure probes

- Wrong login rejected; refresh/session restoration and logout checked.
- Forged/test-only auth headers are rejected outside test mode by automated regression.
- Cross-store reads/writes returned authorization failures.
- Aggregate and individual-other-evaluator detail remained ADMIN-only.
- Hostile `returnTo` values (`https:`, protocol-relative, backslash-host and JavaScript forms) resolved to semantic internal fallbacks.
- Unknown API and unauthenticated API access failed closed; no mock fallback appeared.
- Server logs and 500 handling use redacted/sanitized output.

## Browser/tool limitations

- The connected Chrome automation requires a short settling interval after logout before controlled inputs reliably dispatch; retrying the same generated test credentials succeeds. This was not observed during manual UI use and did not expose credentials.
- Browser-native date controls and native JavaScript confirmation are unreliable through the automation surface. Product archive confirmations now use the shared accessible Dialog; the form's optional unsaved-change prompt is covered by memory-only persistence/database checks.

## Verdict

No P0/P1 defect remains from the adversarial pass. Final third-pass visual and production regression evidence is recorded in the final report.

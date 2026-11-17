> 交接注：下文为原项目历史 README，部分状态可能早于当前生产 version 5。请以交接根 README、docs/PROVENANCE.json 和 FEATURE_STATUS.md 为准；不要直接运行指向既有服务的启动/部署脚本。

# Molly Roster

Xero Payroll AU integration: see [setup, APIs, confirmation workflow and verification](docs/XERO_PAYROLL_INTEGRATION.md).

Molly Roster is a store scheduling product that shares authentication and read-only workforce facts with Evaluate Molly while keeping all roster state in its own PostgreSQL database.

## Local start

Prerequisites: Node 20.19–22, npm, Docker Desktop, and Evaluate Molly running on `127.0.0.1:4000`.

```powershell
Copy-Item backend\.env.example backend\.env
.\scripts\start-dev.ps1 -Install -Migrate
```

- Frontend: `http://127.0.0.1:5176`
- Roster API: `http://127.0.0.1:4020/api`
- Health: `http://127.0.0.1:4020/api/health`
- PostgreSQL: `127.0.0.1:5433`

Subsequent starts normally need only:

```powershell
.\scripts\start-dev.ps1
```

## Verification

```powershell
npm run lint
npm test
npm run build
npm audit --omit=dev

Push-Location backend
npm test
npm run build
npm run prisma:validate
npm run prisma:migrate:status
npm audit --omit=dev
Pop-Location
```

Do not use `prisma db push` as a release mechanism. Apply the checked-in migrations with `npm run prisma:migrate:deploy`.

## Product boundaries

- Evaluate Molly owns accounts, sessions, stores, employees, current skills and latest CLOSED-round official score/Tier.
- Molly Roster owns scheduling periods, shifts, assignments, availability, roles, templates, settings, publications and exports.
- Employee-safe exports exclude internal notes, scores and Tier. ADMIN manager exports may include roster-time snapshots.
- Qualification is scheduling context only and never changes score or Tier.

See `ROSTER_ARCHITECTURE.md`, `docs/EVALUATE_INTEGRATION_CONTRACT.md`, `ROSTER_QA_REPORT.md`, and `ROSTER_DEPLOYMENT_READINESS.md` before changing integration or deployment behavior.

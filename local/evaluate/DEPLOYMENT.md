# Evaluate Molly free deployment guide

This guide prepares a single Render Free Web Service backed by Supabase Free PostgreSQL. It does not deploy or modify either external account.

## Production shape

The browser talks only to `https://<app>.onrender.com`. Express serves both the authenticated `/api/*` routes and the Vite `dist` directory. React Router deep links fall back to `dist/index.html`. Production frontend requests use the relative `/api` base, so the existing HttpOnly session cookie remains first-party and same-origin.

Development remains split: Vite runs on `http://127.0.0.1:5174`, Express runs on `http://127.0.0.1:4000`, and root `.env` can set `VITE_API_BASE_URL=http://127.0.0.1:4000/api`.

## Required Render environment variables

| Variable | Example / purpose |
| --- | --- |
| `NODE_VERSION` | `20.19.0` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase Supavisor session-mode URI, including `sslmode=require` |
| `APP_ORIGIN` | Optional explicit origin override. Render automatically supplies `RENDER_EXTERNAL_HOSTNAME`, which is converted to the HTTPS origin. |
| `AUTH_SESSION_DAYS` | `7` unless a different session lifetime is intentionally selected |
| `AI_ANALYSIS_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL` | Only when the optional DeepSeek analysis provider is enabled |
| `AI_ANALYSIS_TIMEOUT_MS` | Optional provider timeout override |

Do not set `VITE_API_BASE_URL` in Render. Do not put database passwords, account passwords, session tokens, or API keys in `render.yaml` or Git.

## Supabase setup

1. Create a Free Supabase project in a region close to the Render service.
2. In Supabase SQL Editor, create a dedicated Prisma database user following Supabase's Prisma guide. Use a generated password.
3. In **Connect**, select the Supavisor **Session pooler** connection string on port `5432`. This mode is intended for a persistent server on an IPv4 network.
4. Append `sslmode=require` to the URI query string. Percent-encode reserved characters in the password.
5. Store the complete URI only in Render's `DATABASE_URL` secret field and in the temporary environment used to run migrations.

Example shape only:

```text
postgresql://prisma.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:5432/postgres?sslmode=require
```

## Apply production migrations

The Free Render Web Service does not provide the paid pre-deploy command. Do not put migrations in the application start command and do not use `prisma migrate dev`, `db push`, or the development seed against production.

Before the first deploy, and before deploying any future commit that adds a checked-in migration, identify the target database from its host, database name and project reference. Confirm it is the intended production instance. Take and verify a restorable backup, review the pending migration SQL and its data preconditions, and plan a write pause or compatible rollout for schema changes. From a trusted CI job or controlled local terminal, run:

```powershell
$env:DATABASE_URL = '<Supabase session-pooler URI with sslmode=require>'
try {
  npm --prefix backend ci --include=dev
  if ($LASTEXITCODE -ne 0) { throw 'Backend install failed' }
  npm --prefix backend run prisma:validate
  if ($LASTEXITCODE -ne 0) { throw 'Prisma validation failed' }
  npm --prefix backend run prisma:migrate:status
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
```

`prisma migrate status` is read-only and reports pending migrations with a nonzero exit code; a pending state before the approved deploy is expected. Do not proceed if the target, backup, migration SQL, or data preflight is unresolved. Once approved, use a separate controlled step:

```powershell
$env:DATABASE_URL = '<verified production URI>'
try {
  npm --prefix backend run prisma:migrate:deploy
  if ($LASTEXITCODE -ne 0) { throw 'Migration failed; investigate before starting the new application' }
  npm --prefix backend run prisma:migrate:status
  if ($LASTEXITCODE -ne 0) { throw 'Migration history is not current' }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
```

`prisma migrate deploy` applies checked-in migrations and does not run `prisma/seed.ts`. After deployment, verify application health and authenticated employee/score reads. A rollback of a data-changing migration requires its reviewed reverse procedure or a reconciled restore; do not reset the production database.

## Build and start commands

Render build command (read-only migration-status gate; never applies migrations):

```text
npm ci --include=dev && npm --prefix backend ci --include=dev && npm --prefix backend run prisma:migrate:status && npm run render:build
```

The build fails when checked-in migrations are pending or the configured database is unreachable. This gate checks migration history, not arbitrary PostgreSQL schema drift; compare live catalog structure separately during production preflight. A failed build must be investigated against the intended database before retrying.

Render start command:

```text
npm run render:start
```

Health check path:

```text
/api/health
```

The server binds to `0.0.0.0` and reads Render's `PORT` environment variable.

## First ADMIN bootstrap

After migrations are applied, set these three values only in the controlled terminal or temporary Render environment used for bootstrap:

```text
ADMIN_USERNAME
ADMIN_DISPLAY_NAME
ADMIN_INITIAL_PASSWORD
```

Run:

```powershell
npm --prefix backend run auth:bootstrap-admin
```

The command refuses to overwrite an existing ADMIN. Remove `ADMIN_INITIAL_PASSWORD` immediately after success. Never run `npm run prisma:seed` in production.

## Manual Render deployment

1. Initialize a private Git repository and confirm `.env`, `backend/.env`, `LOCAL_ACCOUNT_CREDENTIALS.md`, logs, build output, and generated Prisma files are ignored.
2. Commit the application, migration history, `render.yaml`, lockfiles, and this guide. Push to a private GitHub, GitLab, or Bitbucket repository.
3. Create the Supabase project and dedicated Prisma user, then copy the Session pooler URI.
4. Run `npm --prefix backend run prisma:migrate:deploy` against Supabase as described above.
5. In Render, choose **New > Blueprint** and connect the repository containing `render.yaml`.
6. Choose the Free instance and supply `DATABASE_URL` as a secret. Render's `RENDER_EXTERNAL_HOSTNAME` provides the same-origin allowlist automatically; set `APP_ORIGIN` only when intentionally overriding it.
7. Confirm the build and start commands from this document, then create the service.
8. Wait for `/api/health` to return HTTP 200 and confirm the Render log shows only the listening port and environment, never credentials.
9. Bootstrap the ADMIN once, then remove the bootstrap password variable.
10. Verify `/`, `/login`, `/evaluations`, `/employees/<valid-id>`, `/evaluations/v1/<valid-id>`, `/skill-board`, `/accounts`, and `/stores` load or redirect through the React application when opened directly and refreshed.
11. Verify ADMIN login, STORE_EVALUATOR login, logout, role restrictions, and store scope from the public HTTPS URL.

## Free-tier expectations

Render Free web services spin down after inactivity, so the first request after an idle period can be slow. Free services are appropriate for this internal pilot, not a final uptime commitment. Supabase and Render quotas must be monitored during the pilot.

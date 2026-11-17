# Local Roster read-only login for Scheduling Engine Lab

The Lab's first local real-data exercise used the existing Roster backend database login. Each Lab query requested a read-only transaction, but that backend login was verified on 2026-10-25 to be a PostgreSQL superuser with INSERT rights. The Lab should instead connect through a separate SELECT-only login.

## Scope and preflight

- Target: local Docker `molly_roster` at `127.0.0.1:5433`; no remote database is accepted by `scripts/provision_local_readonly.py`.
- Role: `molly_roster_schedule_ro`; no existing role of that name was found before provisioning.
- Grants: database CONNECT, public schema USAGE, and SELECT only on `employee_availability`, `roster_periods`, `roster_store_settings`, `shift_assignments`, `shift_roles`, `shift_templates` and `shifts`. No business rows or schemas are edited.
- A fresh custom-format database backup was made before provisioning at the ignored `.data/backups/molly-roster-before-lab-readonly-role-2026-10-25.dump`. `pg_restore -l` listed its catalog successfully; SHA-256 `3168651060D1A675612AAD6736A2BC3694210E036AA8B0C6514A674B3997BE2B`.
- The Lab `.env` does not exist before provisioning. The script refuses to overwrite one or modify an existing role.

After provisioning, a separate read-only privilege audit checked all 13 public tables: exactly the seven listed tables allow SELECT for the new role, and none of the 13 allow INSERT, UPDATE or DELETE. This is the verified state of this local database, not a grant guarantee for a different installation.

The 2026-10-25 recheck extended `--verify` to inspect every current public table, partition, view, materialized view and foreign table, plus public sequences. It now rejects unexpected SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER grants outside the seven permitted relations, any sequence USAGE/SELECT/UPDATE grant, role membership, inheritance, bypass-RLS or elevated role attributes. The existing local role passed: SELECT on the seven required relations and no other grants across 13 public relations and zero public sequences. This checks effective grants on current objects; future schema or privilege changes require a fresh `--verify` before relying on the role again.

## Apply and verify

From the repository root, run the Lab virtual environment's Python against `scheduling-engine/scripts/provision_local_readonly.py --apply`. It reads the existing backend connection privately, generates a random password, grants only the seven relations above, sets that role's default transaction mode to read only, verifies the grants through a new login, and writes `ROSTER_DATABASE_READONLY_URL` to ignored `scheduling-engine/.env`. It never prints the password or URL. Run the same script with `--verify` to recheck the saved local connection later. Stop and restart **only** the Lab so the process loads the restricted connection. Check the real authenticated source preview again after restart; a green health response alone does not prove the Roster adapter can read the source.

The role and `.env` are local security state and are not committed. The Lab still explicitly issues `REPEATABLE READ READ ONLY` transactions. The new role is an additional boundary against an accidental write to formal Roster tables. An Evaluate session and store authorization are still required to read real staff data through the Lab.

## Reversal

Stop only the Lab. Back up the ignored Lab `.env` securely, then remove that local file if the restricted connection should no longer be used. If no session or other service uses this dedicated role, an administrator can run `DROP ROLE molly_roster_schedule_ro` in `molly_roster`; the role has no business-table ownership and its creation did not change rows. Restart the Lab only after deliberately configuring another approved read-only connection. The database backup is for recovery from unexpected changes, not an instruction to restore over live user data.

## Current fail-closed connection boundary

The adapter now requires `ROSTER_DATABASE_READONLY_URL`; it will not use `ROSTER_DATABASE_URL` even if that legacy variable is present. `start-lab.ps1` no longer reads the backend `.env` as a fallback and removes the legacy variable from the Lab child environment. Without the restricted URL, Mock mode can run but real-source reads fail before opening PostgreSQL. An isolated regression first reproduced the old writer-URL fallback and then verified the refusal. On this local installation, `--verify` again confirmed the dedicated role has SELECT on seven required tables and no business-table write grants. After a controlled Lab-only restart, `/api/health` returned engine `0.1.4` with formal writes disabled, and a signed-in Hurstville preview read the unchanged 25 employees, 22 availability windows and 41 surrounding assignments with source hash `da28eb03dfcd3d903f60`.

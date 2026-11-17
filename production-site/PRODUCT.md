# Molly Tea workforce applications

## Register
Product: authenticated multi-store management tools, not a marketing site.

## Users and purpose
Administrators maintain stores, accounts, employee identity and current skills.
Store evaluators submit performance evaluations within assigned store scopes.
Roster managers maintain availability, drafts, publication and safe exports.

## Existing product and visual direction
Preserve the existing React/Tailwind application shells, Chinese labels,
Molly Tea branding, typography and responsive page hierarchy. Evaluate retains
Dashboard, employees, evaluation forms/history, analytics and account management.
Roster retains Calendar, Staff, templates and settings. Existing Framer Motion
and GSAP behavior is retained; this migration adds no new motion or redesign.

## Data and trust
Evaluate owns canonical employees, formal positions, current skills and official
valid CLOSED-round scores. Roster owns schedule state and immutable publication
snapshots. Roles, positions, skills and shift roles are distinct. Every server
request must check account/store/record authorization. Mock employee reporting
stays labeled and separate from formal data.

## Design principles
Operational clarity, familiar controls, visible loading/error/empty states,
readable scores and restrained semantic color. Do not replace the application
with a landing page, fabricate employee data or add decorative dashboard blocks.

## Migration scope
Preserve each existing interface and API contract under one origin. Evaluate
uses /evaluate/ and /api/evaluate/. Both applications share one D1 authority,
account sessions and atomic revision-controlled commits. Local source and
verified backups remain rollback assets.

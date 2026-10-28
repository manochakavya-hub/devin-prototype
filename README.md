# Internal tools prototype: KYC Review Queue, Refunds, Feature flags

A time-boxed proof of concept for replacing Power Apps with custom internal tools. It contains three small
apps built on one shared `/platform`:

- **KYC Review Queue** (`/kyc`): operations staff claim flagged KYC (know-your-customer) cases, compare
  the applicant's form with their ID and check results, then approve, reject or request more information.
- **Refunds** (`/refunds`): agents and finance approve or reject customer refund requests, with an approval
  limit and a two-person rule; finance marks approved refunds as paid.
- **Feature flags** (`/flags`): engineers create flags and switch them on/off in staging; release managers
  also control production (with a required reason) and archive flags.

Every state change and every denied attempt goes into one append-only audit log.

The point is to show two things:

1. A small team can build a production-*shaped* internal tool quickly: real server-side permissions,
   a real state machine, transactional audit, tests.
2. The shared pieces (auth/roles, audit log, data table, app shell) live in `/platform` and are reused by
   the other two apps. This is **not** a low-code platform: just a few plain libraries.

## Running it

Requires Node 20.19+ (tested on 22 and 24).

```bash
npm install && npm run seed && npm run dev
```

Open http://localhost:3000, pick a user on the dev login screen, then pick an app on the launcher.

| User | KYC role | Refunds role | Flags role |
| --- | --- | --- | --- |
| Alice Moreno | `reviewer` | `agent` | `engineer` |
| Ben Okafor | `reviewer` | `finance_approver` | none |
| Sara Lindqvist | `senior_reviewer` | none | `engineer` |
| Dev Patel | `senior_reviewer` | `agent` | `release_manager` |
| Grace Kim | `auditor` | `auditor` | `auditor` |
| Omar Haddad | none | `finance_approver` | none |

Other scripts: `npm test` (Vitest), `npm run lint`, `npm run typecheck`, `npm run build`.

`npm run seed` deletes and recreates `data/app.db` (path overridable with `DATABASE_PATH`). **Stop the dev
server before re-seeding**: a running server keeps the old, deleted file open. If you switch Node versions,
re-run `npm install` (or `npm rebuild better-sqlite3`) because the SQLite driver is a native module.

## KYC Review Queue

- **Queue** (`/kyc`): oldest-first cases with status / risk / assignment filters, search and paging.
  Defaults to open (undecided) cases and shows how long each has been waiting (red past 72h).
- **Case detail** (`/kyc/cases/:id`): name on form vs name on ID side by side, ID document / selfie /
  sanctions results, the decision buttons the current user may use, and the case's audit history.
- **Audit log** (`/kyc/audit`): filter by actor, action and case ID (URL params, so views are linkable).

```
pending ──claim──▶ in_review ──approve──▶ approved        (final)
   ▲                  │ ├────reject────▶ rejected        (final; reason code + note required)
   │                  │ └──request_info─▶ info_requested
   └──customer_replied (simulated button) ────────────────┘
```

| | reviewer | senior_reviewer | auditor |
| --- | --- | --- | --- |
| View queue, cases, audit log | yes | yes | yes |
| Claim / decide low & medium risk | yes | yes | no |
| Claim / decide high risk | no | yes | no |

Only the person who claimed a case can decide it. Concurrent claims: only one wins.

## Refunds

- **Requests** (`/refunds`): oldest-first refund requests with status / amount / requester filters and search.
  Defaults to open requests (requested or approved). Amounts over the limit are tagged "finance".
- **Refund detail** (`/refunds/:id`): amount, order, original payment, customer message, the decision
  buttons the current user may use (or why there are none), and the refund's audit history.
- **Audit log** (`/refunds/audit`): same shared viewer, showing only refunds rows (plus logins).

```
requested ──approve──▶ approved ──mark_paid──▶ paid   (final)
    └────────reject──▶ rejected                        (final; reason code + note required)
```

| | agent | finance_approver | auditor |
| --- | --- | --- | --- |
| View requests and audit log | yes | yes | yes |
| Approve / reject up to $500.00 | yes | yes | no |
| Approve / reject over $500.00 | no | yes | no |
| Mark approved refund as paid | no | yes | no |

Two-person rule: nobody can approve or reject a refund they requested, including finance approvers.
Refund requests are seeded; there is no "new request" form (see out of scope).

## Feature flags

- **Flags** (`/flags`): every flag with its staging and production state, owner and last change; filters for
  active/archived and on/off per environment. Engineers and release managers get a **New flag** form
  (lower_snake_case key + description; new flags start off everywhere).
- **Flag detail** (`/flags/:key`): a switch per environment (or why you can't use it), archive, and history.
- **Audit log** (`/flags/audit`): audit actions name the environment, e.g. `enable_production`.

| | engineer | release_manager | auditor |
| --- | --- | --- | --- |
| View flags and audit log | yes | yes | yes |
| Create flags | yes | yes | no |
| Turn on/off in staging | yes | yes | no |
| Turn on/off in production (reason required) | no | yes | no |
| Archive (only when off in production; final) | no | yes | no |

Turning a switch to the state it's already in, or changing an archived flag, gets 409. If two people flip
the same switch from the same view, only the first applies. There is no SDK/evaluation endpoint for
services to read flags yet (see out of scope).

## How rules are enforced (all apps)

Hidden buttons are a convenience only. Every API call re-checks everything on the server:

- No permission (wrong role, high-risk rule, approval limit, two-person rule, not your case, no role in the
  app): **403, logged as `denied`**.
- Invalid step (e.g. approving a finished case) or losing a race: **409, nothing logged**.
- Missing reject reason or note: **400, nothing logged**.
- No session or forged cookie: **401**.

Each state change and its audit row are written in one database transaction; if the audit write fails, the
change is rolled back. SQLite triggers block `UPDATE`, `DELETE` and overwriting rows in `audit_log`.

### API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ "userId": "u_alice" }`; dev login only, sets a signed session cookie |
| POST | `/api/auth/logout` | |
| GET | `/api/kyc/cases` | `?status=&risk=` |
| GET | `/api/kyc/cases/:id` | case, actions you may take, history |
| POST | `/api/kyc/cases/:id/actions` | `{ "action": "claim" \| "approve" \| "reject" \| "request_info" \| "customer_replied", "reasonCode"?, "note"? }` |
| GET | `/api/kyc/audit` | `?actor=&case=&action=` |
| GET | `/api/refunds` | `?status=` |
| GET | `/api/refunds/:id` | refund, actions you may take, history |
| POST | `/api/refunds/:id/actions` | `{ "action": "approve" \| "reject" \| "mark_paid", "reasonCode"?, "note"? }` |
| GET | `/api/refunds/audit` | `?actor=&case=&action=` |
| GET | `/api/flags` | all flags |
| POST | `/api/flags` | `{ "key", "description" }` → 201 |
| GET | `/api/flags/:key` | flag, what you may change, history |
| POST | `/api/flags/:key/actions` | `{ "action": "enable" \| "disable" \| "archive", "environment"?: "staging" \| "production", "reason"? }` |

## Architecture

```
app/                 Next.js routing only: thin files that mount screens and handlers from apps/*
platform/            Reusable, knows nothing about KYC or refunds
  auth/              users + user_roles (one role per user per app), signed session cookie,
                     dev login screen + handlers, requireAppUser / getCurrentAppUser, allow/deny helpers
  audit/             audit_log (+ append-only triggers, app column), appendAudit/recordDenied/queryAudit,
                     AuditLogTable, AuditLogViewer, AuditTimeline
  ui/                AppShell, DataTable (sort/filter/search/paginate), StatusBadge, ConfirmDialog, formatters
  db/                openDb(): SQLite + Drizzle (WAL, foreign keys, busy timeout); shared DB path
  http/              HttpError, withErrors, readJson
apps/
  registry.ts        list of apps shown on the launcher
  home/              login page and app launcher
  kyc/               db (schema, seed), domain (state machine, permissions, service), api, screens, components, test
  refunds/           same layout as kyc
  flags/             same layout as kyc
scripts/seed.ts      resets the DB, seeds users + per-app roles, then each app's data
```

The refunds and flags apps reuse from `/platform` without changes (flags needed no platform edits at all): dev login and sessions, the allow/deny
helpers, the audit log (writes, denied logging, viewer, timeline), DataTable, StatusBadge, ConfirmDialog,
AppShell, DB setup and HTTP error handling. To add a third app:

1. Create `apps/<name>/` with its own table DDL, domain rules and screens.
2. Call `requireAppUser(db, req, "<name>")` in API routes and `getCurrentAppUser` in pages.
3. Wrap each state change in a transaction and call `appendAudit(tx, { app: "<name>", ... })` inside it;
   call `recordDenied` on refusals. `audit_log.case_id` is a generic subject id.
4. Add rows to `user_roles` for the new app id and an entry in `apps/registry.ts`.

All apps share one SQLite file so an app's state change and its audit row can share a transaction.

## What is mocked

- **Login**: pick a seeded user, no password. The session cookie is HMAC-signed (it can't be forged by
  editing the cookie), but identity is whoever you click. Dev login is off when `NODE_ENV=production` unless
  `ENABLE_DEV_LOGIN=true`.
- **Session secret**: falls back to a hard-coded dev value unless `SESSION_SECRET` is set (required in production).
- **KYC check results** (ID document, selfie match, sanctions) are seeded values, not real integrations.
- **"Customer replied"** (KYC) is a button that stands in for a real customer response.
- **"Mark as paid"** (Refunds) records the payout; no money moves.
- **Data**: fictional people, `@example.com` emails, fake order and card references. No real personal data.

## Deliberately out of scope

Not built, on purpose:

- Real SSO / OIDC
- Deployment
- Environment separation (dev/staging/prod)
- Notifications / email
- File upload for ID documents
- Real sanctions screening integration
- Encryption at rest
- Data retention policy
- Accessibility audit
- Refunds: creating new refund requests in the UI, real payment-provider payouts, multiple currencies
- Flags: an SDK / evaluation API for services, percentage rollouts and targeting, more environments, scheduled changes

## Before production use

- **Identity**: replace dev login with SSO/OIDC; map per-app roles from IdP groups instead of the local
  `user_roles` table; remove the dev login handler; keep `SESSION_SECRET` in a secret store; consider
  server-side sessions so access can be revoked before the 8h cookie expires.
- **CSRF**: currently relies on `SameSite=Lax` cookies plus the API requiring `Content-Type: application/json`.
  Add explicit CSRF tokens or origin checks.
- **Database**: SQLite on local disk is single-node. Move to Postgres (or similar) with migrations
  (drizzle-kit) instead of `CREATE TABLE IF NOT EXISTS` at startup. Re-implement the append-only guarantees
  there (triggers *and* a DB role without UPDATE/DELETE/TRUNCATE/DDL on `audit_log`).
- **Audit integrity**: consider hash-chaining rows or shipping them to write-once storage so tampering by a
  DB admin is detectable. Decide what goes in `metadata` (it currently copies reviewer notes).
- **Policy review**: compliance/finance should sign off on the rules in `apps/kyc/domain/permissions.ts` and
  `apps/refunds/domain/permissions.ts` (e.g. the $500 limit, whether the approver may also mark as paid), and
  engineering on `apps/flags/domain/permissions.ts` (e.g. should production changes need a second approver?).
- **Real integrations**: ID verification, selfie match, sanctions screening, payment provider refunds, and a
  read-only, cached flag-evaluation endpoint (or a vendor like LaunchDarkly/Unleash) for services.
- **Operations**: logging/monitoring, backups, rate limiting, error reporting, load testing
  (DataTable filters client-side: fine for hundreds of rows, not tens of thousands).
- Plus everything in the out-of-scope list above.

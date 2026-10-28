# KYC Review Queue (prototype)

A time-boxed proof of concept for replacing a Power Apps tool with a custom internal app. Operations staff
work a queue of flagged KYC (know-your-customer) cases: claim a case, compare the applicant's form against
their ID and check results, then approve, reject or request more information. Every state change and every
denied attempt goes into an append-only audit log.

The point is to show two things:

1. A small team can build a production-*shaped* internal tool quickly: real server-side permissions,
   a real state machine, transactional audit, tests.
2. The shared pieces (auth/roles, audit log, data table) live in `/platform` and can be reused by the next
   internal app without edits. This is **not** a low-code platform: just a few plain libraries.

## Running it

Requires Node 20.19+ (tested on 22 and 24).

```bash
npm install && npm run seed && npm run dev
```

Open http://localhost:3000 and pick a user on the dev login screen.

| User | Role | Can |
| --- | --- | --- |
| Alice Moreno, Ben Okafor | `reviewer` | view; claim and decide low/medium risk cases |
| Sara Lindqvist, Dev Patel | `senior_reviewer` | everything a reviewer can, plus high-risk cases |
| Grace Kim | `auditor` | read-only access to cases and the audit log |

Other scripts: `npm test` (Vitest), `npm run lint`, `npm run typecheck`, `npm run build`.

`npm run seed` deletes and recreates `data/kyc.db` (path overridable with `DATABASE_PATH`). **Stop the dev
server before re-seeding**: a running server keeps the old, deleted file open. If you switch Node versions,
re-run `npm install` (or `npm rebuild better-sqlite3`) because the SQLite driver is a native module.

## What it does

- **Queue** (`/kyc`): oldest-first table of cases with status / risk / assignment filters, search and paging.
  Defaults to open (undecided) cases. Shows how long each open case has been waiting, red past 72h.
- **Case detail** (`/kyc/cases/:id`): name on form vs name on ID side by side, ID document / selfie match /
  sanctions results, the decision buttons the current user is actually allowed to use, and the case's history
  from the audit log (including denied attempts).
- **Audit log** (`/kyc/audit`): every audit row, filterable by actor, action and case ID. Filters are URL
  params, so filtered views are linkable (e.g. `/kyc/audit?action=denied`). Visible to all roles.

### State machine

```
pending ──claim──▶ in_review ──approve──▶ approved        (terminal)
   ▲                  │ ├────reject────▶ rejected        (terminal; reason code + note required)
   │                  │ └──request_info─▶ info_requested
   └──customer_replied (simulated admin button) ──────────┘
```

- Invalid transitions get `409 invalid_transition` and write nothing.
- Only the person who claimed a case can decide it (`403`, logged as `denied`).
- High-risk cases can only be claimed/decided by a `senior_reviewer` (`403`, logged as `denied`).
- Auditors can't change anything (`403`, logged as `denied`).
- Concurrent claims: a conditional `UPDATE ... WHERE status = 'pending' AND assigned_to IS NULL` inside an
  `IMMEDIATE` transaction; the loser gets `409 conflict`.

### API

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ "userId": "u_alice" }`; dev login only, sets a signed session cookie |
| POST | `/api/auth/logout` | |
| GET | `/api/kyc/cases` | `?status=&risk=` |
| GET | `/api/kyc/cases/:id` | case + its audit history |
| POST | `/api/kyc/cases/:id/actions` | `{ "action": "claim" \| "approve" \| "reject" \| "request_info" \| "customer_replied", "reasonCode"?, "note"? }` |
| GET | `/api/kyc/audit` | `?actor=&case=&action=` |

All routes require a session; the action route is the only way to change state, and it re-checks
everything server-side regardless of what the UI showed.

## Architecture

```
app/                 Next.js routing only: thin files that mount screens and handlers from apps/kyc
platform/            Reusable, knows nothing about KYC
  auth/              users table, signed session cookie, dev login screen + handlers, allow/deny helpers
  audit/             audit_log table + append-only triggers, appendAudit/recordDenied/queryAudit,
                     AuditLogTable, AuditLogViewer, AuditTimeline
  ui/                DataTable (sort/filter/search/paginate), StatusBadge, ConfirmDialog, formatters
  db/                openDb(): SQLite + Drizzle with WAL, foreign keys, busy timeout
  http/              HttpError, withErrors, readJson
apps/kyc/
  db/                kyc_cases schema, DB wiring, seed
  domain/            constants, state machine, permission policy, service (the one place state changes)
  api/               route handlers
  screens/, components/  pages and KYC-specific UI
  test/              domain, permission, atomicity, concurrency and API tests
```

`app/` has to sit at the repo root because that's where Next.js looks for routes; it contains no logic.

How a second app (e.g. a feature-flag panel) would reuse `/platform` without editing it:

- Call `openDb(file, [USERS_DDL, AUDIT_DDL, ...its own DDL])` to get the shared `users` and `audit_log` tables.
- Mount `createLoginHandler(getDb)` / `createLogoutHandler()` and render `<LoginScreen>`.
- Write its own policy functions returning `allow()` / `deny(reason)`; call `requireUser(db, req)` in routes.
- Wrap each state change in a transaction and call `appendAudit(tx, ...)` inside it; `recordDenied` on refusals.
  `audit_log.case_id` is a generic subject id (e.g. a flag key).
- Use `<DataTable>`, `<StatusBadge>`, `<ConfirmDialog>`, `<AuditLogViewer>`, `<AuditTimeline>` as-is.

Roles are app-defined strings in `users.role`; `/platform` never interprets them.

## What is mocked

- **Login**: pick a seeded user, no password. The session cookie is HMAC-signed (so it can't be forged by
  editing the cookie), but identity is whoever you click. Dev login is off when `NODE_ENV=production` unless
  `ENABLE_DEV_LOGIN=true`.
- **Session secret**: falls back to a hard-coded dev value unless `SESSION_SECRET` is set (required in production).
- **Check results** (ID document status, selfie match %, sanctions result) are seeded fields, not real integrations.
- **"Customer replied"** is a button that any reviewer can press to move `info_requested -> pending`.
- **Data**: 25 fictional cases and 5 fictional users (`@example.com`). No real personal data.

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

## Before production use

- **Identity**: replace dev login with SSO/OIDC; map roles from the IdP (groups) instead of a local column;
  remove or hard-disable the dev login handler; manage `SESSION_SECRET` in a secret store; consider server-side
  sessions so a user can be revoked before the 8h cookie expires.
- **CSRF**: currently relies on `SameSite=Lax` cookies plus the API requiring `Content-Type: application/json`.
  Add explicit CSRF tokens or origin checks.
- **Database**: SQLite on local disk is single-node. Move to Postgres (or similar) with migrations
  (drizzle-kit) instead of `CREATE TABLE IF NOT EXISTS` at startup. Re-implement the append-only guarantees
  there (triggers *and* a DB role without UPDATE/DELETE/TRUNCATE/DDL on `audit_log`); triggers alone don't stop
  someone with write access to the DB file or DDL rights.
- **Audit integrity**: consider hash-chaining rows or shipping them to write-once storage so tampering by a
  DB admin is detectable. Decide what goes in `metadata` (it currently copies reviewer notes).
- **Policy review**: compliance should sign off on the rules encoded in `apps/kyc/domain/permissions.ts`
  (e.g. should a reviewer be able to *claim* a high-risk case? currently no; four-eyes on rejections? currently no).
- **Real integrations** for ID verification, selfie match and sanctions screening; a real customer-reply flow.
- **Operations**: logging/monitoring, backups, rate limiting, error reporting, load testing the queue
  (DataTable filters client-side, fine for hundreds of rows, not for tens of thousands).
- Plus everything in the out-of-scope list above.

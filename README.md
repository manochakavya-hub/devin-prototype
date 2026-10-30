# Internal tools prototype: KYC Review Queue, Refunds, Feature flags

This contains three POC
apps built on one shared `/platform`:

- **KYC Review Queue** (`/kyc`): operations staff claim flagged KYC (know-your-customer) cases, compare
  the applicant's form with their ID and check results, then approve, reject or request more information.
- **Refunds** (`/refunds`): agents and finance approve or reject customer refund requests; finance marks approved refunds as paid.
- **Feature flags** (`/flags`): engineers create flags and switch them on/off in staging; release managers
  also control production (with a required reason) and archive flags.

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

## How rules are enforced (all apps)

Hidden buttons are a convenience only. Every API call re-checks everything on the server:

- No permission (wrong role, high-risk rule, approval limit, not your case, no role in the
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

## What is mocked

- **Login**: pick a seeded user, no password. The session cookie is HMAC-signed (it can't be forged by
  editing the cookie), but identity is whoever you click. Dev login is off when `NODE_ENV=production` unless
  `ENABLE_DEV_LOGIN=true`.
- **Session secret**: falls back to a hard-coded dev value unless `SESSION_SECRET` is set (required in production).
- **KYC check results** (ID document, selfie match, sanctions) are seeded values, not real integrations.
- **"Customer replied"** (KYC) is a button that stands in for a real customer response.
- **"Mark as paid"** (Refunds) records the payout; no money moves.
- **Data**: fictional people, `@example.com` emails, fake order and card references. No real personal data.

- **Operations**: logging/monitoring, backups, rate limiting, error reporting, load testing
  (DataTable filters client-side: fine for hundreds of rows, not tens of thousands).
- Plus everything in the out-of-scope list above.

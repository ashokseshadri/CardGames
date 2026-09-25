# Persistent Career Mode — Implementation Plan

Last updated: 2026-08-26T17:16:00-07:00

## Outcome

Add a clearly fictional-chip career mode to Poker Study Lab. A single local career starts at zero, asks the learner to borrow 100 chips before the first round, has a durable bankroll and story/history, records the actual signed result from each 100-chip table stack, supports unlimited borrowing in exact 100-chip increments, allows repayment, and accrues both savings and debt interest once per elapsed real day. Data survives browser restarts in an embedded SQLite database and is accessed through a narrow localhost API that can later be replaced by a hosted repository.

## Scope and non-goals

- In scope: practice/career mode switch; zero-chip starting balance; required first 100-chip borrow; 100-chip round results; totals won, lost, borrowed, repaid, interest earned, and interest charged; wins/losses/ties; 100-chip borrow and repay controls; daily 5% savings yield; daily-compounded marginal debt interest; chronological career story; SQLite schema/migration; idempotent hand settlement; three collapsible dashboard sections; responsive UI; tests and runbook.
- Non-goals: real money, currency conversion, deposits, payments, prizes, authentication, cloud synchronization, multi-user accounts, credit checks, collections, legal lending, or financial advice.
- Product boundary: all values are fictional training chips. Interest exists only as a career-game mechanic.

## Current-state evidence

- The existing React/Vite app is browser-memory-only and has no API, persistence, account, or database.
- `usePokerTrainer` already determines an exact `win | tie | loss` at showdown, and `handId` gives an idempotency key.
- The game already uses a 100-chip training pot, advances through a pure state machine, and has a responsive component system.
- Installed Node 25.6 exposes embedded `node:sqlite`; no database or web-framework dependency is required.

## Decisions and assumptions

| Decision | Status | Resolution |
|---|---|---|
| Career clock | User resolved | Use elapsed real UTC days. No accrual for partial days or backward clock movement. |
| Savings yield | User resolved | Available, unused chips earn 5% APR, compounded daily. |
| Borrowing | User resolved | No maximum; each borrow action adds exactly 100 chips. |
| Debt yield | User resolved | Daily-compounded marginal APR: first 1,000 at 15%, next 4,000 at 20%, amount above 5,000 at 40%. |
| Round accounting | User revised/approved | Every round starts with a 100-chip table stack and persists the learner’s actual integer net result from −100 through +500. |
| Starting chips | User revised | New career begins with 0 fictional chips; the learner borrows 100 before playing. |
| Dashboard disclosure | User resolved | Career Ledger, Marginal Debt Bracket, and Career Story appear as three buttons that independently expand/collapse their section. |
| Current ledger reset | User authorized | Stop the server, preserve a recoverable local backup, remove the active SQLite/WAL files, and restart to create the zero-chip profile. |
| Persistence | Lead decision | Embedded SQLite in `data/career.sqlite`; single local profile; client preference may use localStorage but accounting truth does not. |
| Repayment | Lead assumption | Repay up to 100 chips per action, applying payment to accrued interest before principal. |

## Architecture and lifecycle

### Data ownership and precision

- SQLite is the source of truth. `career_profile` owns the current snapshot; `career_transactions` is the append-only story ledger; settled `hand_id` values are unique.
- Monetary values are rounded to four decimal places after every daily calculation and mutation, then rendered to two decimals.
- `loanPrincipal` and `loanInterestOwed` are tracked separately; interest brackets use total outstanding debt and accrue into interest owed.

### Daily accrual

On every read or mutation, calculate full UTC days since `lastAccruedAt`. For each elapsed day:

`savings = availableChips × 0.05 / 365`

`debtInterest = min(debt,1000) × 0.15/365 + min(max(debt−1000,0),4000) × 0.20/365 + max(debt−5000,0) × 0.40/365`

Add savings to available chips and debt interest to interest owed, repeat for every elapsed day, advance the anchor by the same number of full days, and append one aggregated history entry. This is deterministic, retry-safe inside one SQLite transaction, and ignores negative clock deltas.

### API

- `GET /api/career` — accrue due days and return snapshot plus recent story.
- `POST /api/career/borrow` — borrow exactly 100 chips.
- `POST /api/career/repay` — repay up to 100 chips, interest first.
- `POST /api/career/round` — settle one unique `handId` with `win | loss | tie`; reject malformed, duplicate, or underfunded settlements without partial writes.
- JSON only, same-origin localhost, bounded request bodies, explicit error responses. No remote calls or credentials.

### UI and game integration

- Practice/Career switch near the lesson header. Entering career starts a fresh trackable hand.
- Career dashboard shows available chips, debt, lifetime won/lost/borrowed, interest earned/charged, record, effective debt band, borrow/repay controls, and chronological story.
- Career requires at least 100 available chips to play a new round and explains when borrowing is needed.
- The hook settles exactly once when showdown is reached, refreshes the career, and prevents a career hand from being silently abandoned via New Hand before showdown.
- API/network errors preserve the poker hand and show a retryable, non-destructive status.

### Compatibility, migration, rollback, and recovery

- Practice mode remains available and does not mutate career data.
- Database migration uses `PRAGMA user_version`; schema creation is idempotent. No legacy data exists to backfill.
- SQLite file lives under ignored `data/`; deletion/reset is not exposed in this milestone.
- Rollback is code reversion plus retaining the SQLite file. If the database cannot open, practice mode remains usable and career mode reports unavailable.
- A future hosted database replaces the API implementation without changing the client contracts.

## Workstreams and agents

| ID | Workstream | Agent/model | Owned files | Dependencies | Deliverable | Verification | Status |
|---|---|---|---|---|---|---|---|
| C0 | Contracts and architecture | Lead / high reasoning | `src/career/contracts.ts`, plan/tracker | None | Frozen API and accounting semantics | Typecheck + review | Complete |
| C1 | SQLite ledger and API | Poker engine / inherited | `server/**`, `server.mjs` | C0 | Schema, accrual, mutations, HTTP API | 11 focused server tests | Complete |
| C2 | Career client and dashboard | Poker UI / inherited | `src/career/**` except contracts, `src/components/CareerDashboard.tsx`, `src/styles/career.css` | C0 | Repository hook and responsive UI | 5 focused client tests + lint | Complete |
| C3 | Integration and docs | Lead / high reasoning | `package.json`, `src/App.tsx`, `src/hooks/**`, shared seams, README | C1,C2 | End-to-end career mode | 62 tests + lint/build + browser | Complete |
| C4 | Independent verification | Independent reviewer / inherited | Read-only | C3 | Release judgment | Two-pass code/database/browser audit | Complete |
| R0 | Reset contracts and plan | Lead / high reasoning | contracts, plan/tracker | User rules | Zero-start and reset semantics | Review | Complete |
| R1 | Zero-start ledger | Poker engine / inherited | `server/careerLedger.mjs`, ledger tests | R0 | Fresh careers start at zero | Focused tests | Complete |
| R2 | Three-button dashboard | Poker UI / inherited | `CareerDashboard.tsx`, career CSS/tests | R0 | Accessible independent disclosures | Component/lint | Complete |
| R3 | Integration, backup/reset, docs | Lead / high reasoning | seams, README, active data | R1,R2 | Reset running app | Full suite/component/data | Complete |
| R4 | Independent reset review | Independent reviewer / inherited | Read-only | R3 | Release judgment | Code/data audit | Complete — RELEASE |

## Dependency waves

1. C0 discovery, rules, contracts, and schema semantics.
2. C1 SQLite/API and C2 client/dashboard in parallel.
3. C3 integration, lifecycle reconciliation, documentation, and browser validation.
4. C4 independent release audit.

Critical path: `C0 → (C1 ∥ C2) → C3 → C4`.

Reset refinement critical path: `R0 → (R1 ∥ R2) → R3 → R4`.

## Acceptance criteria and verification

- [x] Career/practice switch works without changing practice results.
- [x] New career starts with 0 fictional chips and persists across reload/server restart.
- [x] Every unique terminal hand records its actual signed table-stack result once; duplicates are idempotent.
- [x] Borrow adds exactly 100 to chips, principal, lifetime borrowed, and history with no maximum.
- [x] Repayment applies to interest first, then principal, without overdrawing chips.
- [x] Full elapsed days accrue 5% savings and marginal 15%/20%/40% debt interest accurately and compound daily.
- [x] Totals won, lost, borrowed, interest earned/charged, record, debt, and history are visible and responsive.
- [x] SQLite migration and restart behavior pass; malformed requests and database/API failures do not partially mutate data.
- [x] Career data remains local; product continues to state that chips and interest are fictional.
- [x] Focused tests, full tests, lint, TypeScript, production build, browser flow, and independent review pass.
- [x] Fresh and reset careers display 0 available chips and cannot advance until Borrow 100 succeeds.
- [x] Career Ledger, Marginal Debt Bracket, and Career Story are three keyboard-accessible buttons with correct `aria-expanded` state and independent content visibility.
- [x] The former active SQLite files are preserved in a timestamped local backup and the restarted active database contains only the new zero-chip career-start event.
- [x] Reset-refinement tests, lint, build, component/data validation, and independent review pass.

## Risks and mitigations

| Risk | Mitigation | Rollback / recovery |
|---|---|---|
| Clock manipulation changes accrual | Use persisted UTC anchor, full-day increments, and no negative accrual; disclose local-clock model. | Restore system clock; next positive elapsed day resumes. |
| Floating-point drift | Round every monetary mutation to four decimals and test bracket boundaries. | Future migration can convert to integer microchips. |
| Duplicate React effects double-settle | Unique `hand_id` plus idempotent API response. | Re-fetch authoritative snapshot. |
| Database corruption/unavailable runtime | WAL, transactions, narrow repository, practice fallback. | Preserve/copy `data/career.sqlite`; recreate only by explicit operator action. |
| Fictional lending resembles finance | Persistent learning-simulation labels; no currency, payment, or real-world credit language. | Disable career UI without deleting ledger. |

## Operator actions

- Required/run during development: restart the local app with the new combined SQLite/Vite server.
- Automatic: create `data/career.sqlite` and schema when the combined local server first starts after this upgrade.
- No destructive reset, external deployment, secret, account, or manual DDL is authorized.

## Progress log

- 2026-08-26T14:45:40-07:00 — Tracker initialized.
- 2026-08-26T14:50:00-07:00 — User resolved unlimited 100-chip borrowing and marginal daily debt brackets.
- 2026-08-26T14:52:00-07:00 — Node SQLite capability verified; architecture and contracts frozen; parallel implementation lanes released.
- 2026-08-26T15:04:00-07:00 — SQLite/API and client/dashboard integrated. Isolated browser verified borrow, exact showdown settlement, repayment, reload persistence, and 390px layout. Full 59-test suite, lint, TypeScript, and production build passed; independent review started.
- 2026-08-26T15:13:00-07:00 — Review blockers resolved: SQLite failure now preserves Practice mode and active career hands cannot be abandoned through mode switching. Three lifecycle integration tests added; 62 tests and all release gates passed. Independent reviewer recommends RELEASE.
- 2026-08-26T15:21:00-07:00 — User authorized full career reset, changed starting balance to zero/first borrow 100, and requested three collapsible dashboard buttons. Reset contracts frozen; independent ledger and UI lanes started.
- 2026-08-26T17:16:00-07:00 — Ledger and dashboard refinements integrated. Active SQLite/WAL/SHM preserved under `data/backups/2026-08-26-1522-reset`; restarted profile verified at zero with only the career-start event. Full 66-test suite, lint, production build, and server syntax checks passed. Automated local-browser inspection was blocked by browser URL policy, so interaction/ARIA validation relies on passing component tests; independent audit started.
- 2026-08-26T17:18:00-07:00 — Independent audit recommends RELEASE with no blockers. Reviewer confirmed active and backup SQLite integrity, zero-to-borrow gating, all three accessible independent disclosures, lifecycle locking, marginal interest behavior, documentation, and every release gate.

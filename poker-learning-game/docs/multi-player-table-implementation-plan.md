# Configurable Six-Player Hold’em Trainer — Implementation Plan

> Historical milestone: the fixed-pot betting abstraction documented below was superseded on 2026-08-27 by [`betting-rounds-implementation-plan.md`](betting-rounds-implementation-plan.md), which now describes the active 5/10 blind, 100-stack, turn-order engine.

Last updated: 2026-08-24T16:38:00-07:00

## Outcome

Expand Poker Study Lab from heads-up play to a configurable 2–6 seat Texas Hold’em learning table. Each simulated opponent receives unique hidden cards, occupies a real table position, takes an explainable fold/check/call/raise action on every street, and receives an individual probability profile describing likely holdings. Every street also produces a detailed “what to watch” briefing covering board texture, multiway danger, draws, blockers, position, action signals, and the limits of the estimate.

## Scope and non-goals

- In scope: 2–6 total seats including the learner; rotating dealer/button, small blind, and big blind markers; 100-chip initial training pot; automatic opponent actions; folded/active state; multiway hero equity; per-opponent range-category probabilities; top likely holdings; detailed street briefing; configurable player count; responsive six-seat table; reveal actual hands only at showdown; regression and integration tests.
- Non-goals: real-money play, human multiplayer, account state, exact no-limit betting rounds, side pots, stack depletion, all-ins, authoritative GTO ranges, opponent collusion modeling, or production server RNG.
- Training abstraction: the opening pot is fixed at 100 fictional chips as requested. Blind labels establish position and action order; exact chip contribution arithmetic remains simplified until a later betting-engine milestone.

## Current-state evidence

- The current `GameState` stores one hero and one opponent, while the deck/evaluator/equity/coaching modules are pure and reusable.
- Equity currently samples one uniformly random opponent, and the UI has one fixed opponent seat.
- The existing immutable street state machine, card evaluator, draw analysis, difficulty modes, responsive design system, and 17-test suite provide the extension base.
- No database, account, external API, or personal data exists; state remains local to the browser tab.

## Decisions and assumptions

| Decision | Status | Resolution |
|---|---|---|
| Seat count | User resolved | Configurable 2–6 total players, including the learner. |
| Card privacy | User resolved | All opponents’ actual cards hidden until showdown. |
| Opponent behavior | User resolved | Automatic street actions drive individual probability estimates. |
| Positions | User resolved | Dealer/button, small blind, and big blind are shown; remaining seats receive standard six-max labels adapted to table size. |
| Opening pot | User resolved | Fixed at 100 fictional chips. |
| Range probabilities | Lead assumption | Fixed educational weights based on position and observed simulated actions; clearly labeled heuristic, not sampled, exact, or solver-grade. |
| Folded cards | Lead assumption | Remain hidden during play and reveal at showdown for learning review, marked as folded. |

## Architecture and contracts

### State model

- Replace `playerCards/opponentCards` with `players: TablePlayer[]`, retaining `heroId`, `dealerSeat`, `playerCount`, pot, street, board, deck, and timeline.
- `TablePlayer` owns stable id/name/seat, position label, hero flag, hidden hole cards, active/folded state, and structured action history.
- A compatibility selector supplies the hero and active opponents to analysis/UI; no actual opponent cards enter pre-showdown equity or range inference.

### Domain services

- `positions.ts`: assigns BTN/SB/BB/UTG/HJ/CO labels for 2–6 seats, including heads-up dealer/SB semantics.
- `opponentModel.ts`: generates reproducible-by-input action tendencies, simulated street actions, fixed educational holding-category weights, and action-signal explanations. These percentages are heuristic teaching aids, not sampled or solver-derived ranges.
- `equity.ts`: generalizes Monte Carlo equity to N active random/weighted opponents without consuming their actual hole cards.
- `streetBriefing.ts`: composes board texture, made-hand/draw state, multiway risk, position, street-aware next-card or final-board threats, and per-player watchouts into difficulty-aware sections.
- `gameEngine.ts`: deals two unique cards to every configured seat, rotates positions on new hands, applies opponent actions, preserves at least one contesting opponent for the learning flow, and advances 3/1/1/showdown.

### UI

- Six-seat responsive oval table with seat positions, action badges, folded states, dealer/blind chips, player-count control, shared board, pot, and controls.
- Analysis column keeps hero equity/hand/coach and adds a detailed street briefing plus expandable opponent probability cards.
- Each opponent card shows top three likely holding categories with percentages, action history, and a “why this changed” explanation. Actual cards appear only at showdown.

### Lifecycle and failure behavior

`new hand(playerCount) → preflop actions → flop actions → turn actions → river actions → showdown`. Changing player count starts a fresh hand to avoid invalid mid-hand seat/deck transitions. Invalid counts are clamped/rejected at the engine boundary. If all modeled opponents would fold, the strongest remaining opponent stays active so the learner can continue through the board; this is disclosed as a training simplification.

### Data, authorization, audit, compatibility, rollout

- Browser-memory state only; no authentication, remote API, storage, telemetry, or audit log.
- Existing hand evaluation contracts stay compatible. `GameState` changes are internal to this local MVP; no migration or persisted data exists.
- Rollout is local through the existing Vite app. Rollback is file reversion; there is no external state.

## Workstreams and ownership

| ID | Workstream | Agent/model | Exact ownership | Dependencies | Deliverable | Verification | Status |
|---|---|---|---|---|---|---|---|
| M0 | Contracts and integration design | Lead / GPT-5 high | `src/domain/cards.ts`, this plan/tracker | None | Frozen player, action, probability, briefing contracts | Typecheck + review | Complete |
| M1 | Multiplayer engine and inference | Worker / GPT-5.6 Terra high | `src/domain/positions.ts`, `opponentModel.ts`, `streetBriefing.ts`, `equity.ts`, `src/game/gameEngine.ts`, matching tests | M0 | 2–6 dealing, actions, equity, ranges, briefings | 43-test integrated suite | Complete |
| M2 | Six-seat learning UI | Worker / GPT-5.6 Terra medium | `src/components/**`, `src/styles/**` | M0 | Responsive table, seat states, range cards, briefing | Lint + desktop/mobile browser | Complete |
| M3 | Hook/app integration and docs | Lead / GPT-5 high | `src/hooks/**`, `src/App.tsx`, README, seam fixes | M1, M2 | Configurable working app | Tests/lint/build/browser | Complete |
| M4 | Independent verification | Worker / GPT-5.6 Terra high | Read-only | M3 | Defect/risk review | Two-pass independent commands and code audit | Complete |

## Dependency waves

1. M0 contracts and frozen semantics.
2. M1 engine/inference and M2 presentation in parallel.
3. M3 integration and browser validation.
4. M4 independent review and release.

Critical path: `M0 → (M1 ∥ M2) → M3 → M4`.

## Acceptance criteria

- [x] Player-count selector supports every total from 2 through 6 and starts a valid fresh hand.
- [x] Every dealt card is unique; five-opponent games leave enough cards for the full board.
- [x] BTN/dealer, SB, and BB are visibly and correctly assigned for each table size.
- [x] Initial practice pot is 100 chips.
- [x] Opponents act on each street and folded state persists.
- [x] Actual opponent cards never affect pre-showdown equity/inference and remain visually hidden.
- [x] Multiway equity includes every active opponent and is explicitly approximate.
- [x] Every active opponent shows top likely holding categories with percentages totaling approximately 100% and action-based reasoning.
- [x] Every street displays detailed, difficulty-aware watchouts for board texture, threats, draws, position, and multiway effects; river/showdown guidance explicitly avoids nonexistent future cards.
- [x] Showdown reveals each actual hand and evaluation, including folded players for study.
- [x] Desktop and mobile layouts remain usable with 2–6 seats and no horizontal overflow.
- [x] Tests, lint, TypeScript, production build, browser flow, and independent review pass.

## Risks and mitigations

| Risk | Mitigation | Recovery |
|---|---|---|
| Probabilities imply false precision | Label fixed heuristic model basis and probability bands; avoid sampling or solver claims. | Reduce to broad categories and explanatory caveat. |
| Multiway Monte Carlo causes lag | Bound samples by player count/street; memoize only on cards/active ranges. | Lower samples or move calculation to a worker later. |
| Six-seat UI becomes cramped | Position seats around oval; collapse probability details below table on small screens. | Switch to stacked seat list below mobile table. |
| Simulated actions produce impossible narrative | Generate from concealed cards internally but infer only from visible action; validate no leak in tests. | Use deterministic strength bands and neutral explanations. |

## Operator actions

- No database, secrets, migration, accounts, deployment, or external system.
- Existing `npm install`; run with `npm run dev`.

## Progress log

- 2026-08-24T16:12:00-07:00 — User decisions recorded; configurable six-seat architecture and workstreams frozen.
- 2026-08-24T16:14:00-07:00 — Shared TypeScript contracts frozen; engine/inference and interface lanes started.
- 2026-08-24T16:25:45-07:00 — Engine and six-seat UI integrated; 38 tests, lint, and production build passed.
- 2026-08-24T16:28:02-07:00 — Preflop range labels refined; 39 tests passed. Browser validated all 2–6 counts, 100-chip pot, positions, 3/1/1 progression, per-street actions, hidden cards, exact showdown, desktop layout, and 390px mobile layout without horizontal overflow.
- 2026-08-24T16:29:00-07:00 — Independent release review started.
- 2026-08-24T16:38:00-07:00 — Two-pass independent review resolved all final-street wording issues. 43 tests, lint, TypeScript/build, and browser accuracy checks passed; feature accepted for local release.

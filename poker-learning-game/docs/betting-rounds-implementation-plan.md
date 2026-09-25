# Real Betting Rounds — Implementation Plan

Last updated: 2026-08-27T00:00:00-07:00

## Outcome

Replace the abstract “edit pot/call price, then deal the next street” flow with a simplified but internally consistent no-limit Texas Hold’em betting loop for 2–6 players. Every hand rotates the dealer, posts 5/10 blinds, gives every seat a 100-chip table stack, pauses at the learner’s legal decision, simulates opponents in order, closes streets correctly, awards the pot, and settles Career Mode by the learner’s actual net chips.

## Approved defaults

- The user approved the recommended rules on 2026-08-27: 5 small blind, 10 big blind, 100-chip starting stacks.
- Raise controls: minimum, half-pot, pot, and a validated custom total.
- Career settlement: actual net result, calculated as the learner’s ending table stack minus 100.
- This remains a local learning simulation with fictional chips only.

## Current evidence

- `assignPositions` already rotates BTN/SB/BB labels, including `BTN/SB` heads-up.
- Table seats already render small D/SB/BB markers and public opponent action badges.
- `GameState` only owns `pot` and a manually editable `toCall`; players have no stacks or contributions.
- `createNewGame` starts with a fixed 100 pot and immediately simulates every opponent once; `advanceStreet` reveals cards regardless of betting completion.
- The coach already consumes pot and call price, so it can use authoritative betting state without changing its public contract.
- Career round settlement currently accepts only `win | tie | loss` and applies a fixed ±100 result.

## Scope

- Stack, street contribution, total contribution, active/folded/all-in state, acting seat, current bet, minimum raise, last aggressor, and hand result.
- Automatic blind posting and correct preflop/postflop action order for 2–6 seats.
- Legal Fold/Check/Call/Raise actions and bot turns until the learner must act or the street/hand ends.
- Raise presets plus custom total, constrained by minimum raise and effective stack.
- Automatic flop/turn/river/showdown transitions only after action closes.
- Pot award for uncontested hands and showdown; tied winners split chips deterministically.
- Visible stacks, committed chips, acting-seat treatment, clearer D/SB/BB markers, action controls, and beginner legal-action explanations.
- Actual-net Career Mode settlement, idempotent by hand ID, with history and totals updated consistently.

## Non-goals

- Real money, payments, matchmaking, human multiplayer, rake, antes, rebuy tournaments, solver-grade bots, network synchronization, or side-pot training scenarios.
- Complex unequal-stack side pots. The engine caps raises at the smallest effective active stack so the MVP cannot create unmatched side pots.
- Persisting unfinished hands across reloads.

## Frozen rules and state machine

### Table rules

- Every seat starts each hand with 100 table chips; these are a per-hand simulation of the learner’s 100-chip Career round.
- 3–6 players: dealer is BTN, next seat posts 5 SB, next posts 10 BB. Heads-up: dealer posts 5 SB and acts first preflop; BB acts first postflop.
- Preflop begins left of BB; postflop begins at the first eligible seat left of BTN.
- A street closes when every non-folded, non-all-in seat has acted since the last full raise and matched the current bet.
- A raise’s total must be at least `currentBet + minRaise`, unless effective-stack capped. Raises are capped at the smallest matchable total among active seats; unmatched side pots are not created.
- If one player remains, award the pot immediately. Otherwise a closed river proceeds to showdown.

### State additions

- Player: `stack`, `streetContribution`, `totalContribution`, `hasActed`, status `active | folded | all-in`.
- Game: `actingSeat`, `currentBet`, `minRaise`, `lastAggressorSeat`, `phase`, `winnerIds`, `heroNet`, and immutable action/timeline records.
- `toCall` becomes derived for the acting player; manual pot and call-price controls are removed.

### Career contract

- `POST /api/career/round` accepts `{ handId, outcome, netChips }`.
- `netChips` must be a finite integer in `[-100, 500]`, consistent with a six-seat 100-chip table; outcome remains `win | loss | tie` for record/story wording.
- Settlement atomically adds the signed net to available chips. Positive net increments total won; negative net increments total lost by its magnitude; zero changes neither. The unique hand ID keeps retries idempotent.
- Existing historical entries remain valid; no destructive migration is required.

## UI behavior

- Strong dealer and blind chips sit beside each player; every seat shows stack and current committed amount.
- The acting player is visibly highlighted and announced to assistive technology.
- When it is the learner’s turn, show only legal buttons: Fold, Check or Call N, and Raise. Raise opens presets and a validated custom total.
- While bots act, controls are disabled and a short status explains the sequence. After a street closes, the next board card arrives automatically.
- Coaching remains educational and updates from authoritative pot odds before the learner acts.
- Career mode explains the 100-chip table stack and posts the actual signed result to the ledger when the hand ends, including early folds.

## Architecture and workstreams

| ID | Workstream | Owner | Owned files | Dependency | Deliverable | Verification | Status |
|---|---|---|---|---|---|---|---|
| B0 | Contracts/architecture | Lead | `cards.ts`, career contracts, this plan/tracker | User approval | Frozen state/API rules | Typecheck/review | Complete |
| B1 | Betting engine | Poker engine | `src/game/**`, `positions.ts`, `opponentModel.ts`, engine tests | B0 | Pure turn/blind/action engine | 25 focused tests | Complete |
| B2 | Table controls/UI | Poker UI | `MultiplayerPokerTrainerView.tsx`, poker CSS, component tests | B0 | Responsive legal-action UI | 5 component/a11y tests | Complete |
| B3 | Career/API settlement | Lead | `server/**`, `src/career/**`, App/hook seams | B0/B1 | Actual-net durable settlement | 18 focused tests | Complete |
| B4 | Integration/release | Lead | shared seams, README | B1/B2/B3 | Working local game | 81 tests/lint/build/startup | Complete |
| B5 | Independent verification | Independent reviewer | Read-only | B4 | RELEASE/HOLD decision | Code/data/UI audit | Complete — RELEASE |

Dependency graph: `B0 → (B1 ∥ B2) → B3 → B4 → B5`.

## Acceptance criteria

- [x] Dealer and blinds rotate correctly for every 2–6 player configuration.
- [x] Each seat starts at 100; blinds post 5/10 and the pot equals contributions.
- [x] Only the acting learner can use legal Fold/Check/Call/Raise controls.
- [x] Raises enforce minimum and effective-stack limits; no unmatched side pot can arise.
- [x] Bots act in seat order and each street advances only after betting closes.
- [x] Folded hands end immediately when one player remains; showdown awards or splits the pot.
- [x] Pot, stacks, bets, actions, position, equity, and coach guidance remain synchronized.
- [x] Career hands require 100 available chips and persist actual net results once per hand.
- [x] Practice behavior remains local and Career ledger/reset data is preserved.
- [x] Responsive keyboard-accessible UI, focused/full tests, lint, build, startup validation, and independent review pass. Automated visual browser inspection was policy-blocked and is recorded as a residual gap.

## Risks, migration, and rollback

- State-machine regressions: keep engine transitions pure and cover heads-up, multiway raises, folds, and street closure deterministically.
- Bot loops: use bounded seat-advance guards and tests that prove every sequence stops at hero or a terminal state.
- Career compatibility: add signed net without changing existing tables; preserve unique hand IDs and old history.
- UI density on mobile: use a compact action tray and existing seat breakpoints; verify at 390px.
- Rollback: revert code while retaining SQLite; the schema needs no destructive downgrade.

## Verification strategy

- Focused engine tests for all positions, blind posts, legal actions, action order, reopens, fold wins, showdown, and split pots.
- Career ledger/API tests for +/−/0 net, bounds, idempotency, insufficient funds, and old entries.
- Hook/App/component tests for bot-to-hero flow, career gating, early terminal settlement, legal controls, ARIA, and mobile layout.
- Full `npm test -- --run`, lint, production build, server syntax checks, live API check, and independent read-only audit.

## Progress log

- 2026-08-27 — User approved the recommended betting implementation. Discovery completed and contracts entered freeze.
- 2026-08-27 — Betting/player/career request contracts frozen; engine and UI lanes released in parallel.
- 2026-08-27 — Engine (25 focused tests), betting UI (5 focused tests), and actual-net Career lane (18 focused tests) integrated. TypeScript, lint, and 77-test full suite pass; combined live verification started.
- 2026-08-27 — Early-fold coaching corrected and coverage expanded to 79 passing tests. Lint, production build, server syntax, and live localhost API startup pass. Automated localhost browser inspection is blocked by browser URL policy; component/a11y tests are the verified UI evidence. Independent audit started.
- 2026-08-27 — Independent audit findings resolved: short all-in raises no longer reopen prior action, coaching is constrained to legal actions with neutral rule wording, terminal fold copy is accurate, tied equity uses the actual winner count, and superseded documentation is labeled historical. Full suite expanded to 81 tests.
- 2026-08-27 — Independent re-audit returned RELEASE with no blockers. All 81 tests, lint, production build, server syntax, startup, code/data review, component accessibility, and responsive CSS checks pass.
- 2026-08-27 — User requested a stronger terminal recap and approved official showdown-only runner-up ranking. Result-summary contract frozen; engine and UI refinement lanes released.

## End-of-hand recap refinement

### Outcome and scope

After every completed hand, show an unmistakable official result naming the winner or split winners and pot awarded, followed by a training replay that ranks every dealt hand from strongest to weakest on a completed five-card board. Folded hands remain excluded from the official result but appear in the explicitly counterfactual learning ranking.

### Contract and behavior

- `GameState.resultSummary` is `null` during betting and becomes immutable at completion.
- The summary owns `reason`, `potAwarded`, `winnerIds`, `winningHand`, `runnerUpIds`, `runnerUpHand`, `analysisBoard`, and individual `rankedHands` entries; tied hands retain their own best-five cards and share a rank number.
- Official winner and runner-up values rank only non-folded showdown contenders.
- The training ranking evaluates every player’s dealt cards, including folds, gives exact ties the same rank, and orders individual players strongest to weakest.
- If the official hand ended before five board cards, use the next cards from the already-shuffled deck to create a deterministic private analysis runout without changing the official pot result.
- If every showdown participant ties, there is no lower runner-up hand.
- Uncontested pots have no official winning/runner-up hand value because no showdown comparison occurred, but still receive the training runout and ranking.
- The UI separates “Official result” from “Training replay,” displays best-five cards, category, plain-language description, player names, rank, fold/official status, and pot amount, and explains the learner’s what-if rank after a fold.
- Counterfactual copy states that later betting could have changed decisions and pot size; it evaluates card strength only.

### Refinement workstreams

| ID | Workstream | Owner | Files | Dependency | Verification | Status |
|---|---|---|---|---|---|---|
| H0 | Result contract | Lead | `src/domain/cards.ts`, plan/tracker | User decision | Typecheck/review | Complete |
| H1 | Engine ranking | Lead (worker unavailable) | `src/game/gameEngine.ts`, engine tests | H0 | Showdown/tie/fold tests | Complete (16 focused tests) |
| H2 | Recap UI | Lead (worker unavailable) | trainer view/CSS/component tests | H0 | Component/a11y/mobile tests | Complete (8 focused tests) |
| H3 | Integration/release | Lead | hook/App seams, docs | H1/H2 | 85 tests, lint, build, syntax, HTTP 200 | Complete |
| H4 | Independent audit | Reviewer | Read-only | H3 | RELEASE — no blockers; 85/85 tests | Complete |

Release decision: **RELEASE**. Independent review found no defects or blockers. Residual risk is limited to visual browser inspection being unavailable to the reviewer; responsive behavior was assessed through semantic structure, CSS review, and component coverage.

Refinement critical path: `H0 → (H1 ∥ H2) → H3 → H4`.

### Recap acceptance criteria

- [ ] Winner(s), exact awarded pot, and completion reason are always visible.
- [ ] Showdowns display the official winning best-five hand and strongest distinct eligible losing hand with player names.
- [ ] Folded hands never appear as the official runner-up but do appear in the clearly labeled all-hand training ranking.
- [ ] Every dealt hand is ranked strongest to weakest, with exact ties grouped.
- [ ] A folded learner receives a deterministic board runout and explicit what-if card rank.
- [ ] All-tie and uncontested hands explain the official result and counterfactual distinction.
- [ ] Keyboard/screen-reader semantics and 390px layout pass.
- [ ] Full release gates and independent review pass.

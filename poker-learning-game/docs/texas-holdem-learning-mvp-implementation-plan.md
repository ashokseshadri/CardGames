# Texas Hold’em Learning Game MVP — Implementation Plan

Last updated: 2026-08-24T15:35:00-07:00

## Outcome

Deliver a polished, responsive, browser-based Texas Hold’em learning simulation that deals a heads-up hand, reveals streets, evaluates the player’s best five-card hand, estimates equity continuously, explains draws and outs, and recommends an educational action with transparent reasoning. The product is explicitly play-money learning software with no accounts, deposits, wagers, or cash-out behavior.

## Scope and non-goals

- In scope: a local React + TypeScript + Vite application; shuffled 52-card deck; preflop/flop/turn/river/showdown flow; deterministic hand evaluator; Monte Carlo equity versus one random opponent; draw/outs explanations; pot-odds-aware fold/check/call/raise coaching; beginner/intermediate/advanced explanation modes; responsive poker-table UI; tests; run documentation.
- Non-goals: real-money gambling, payments, accounts, networked multiplayer, persistent storage, authoritative server RNG, tournament rules, side pots, all-in logic, range editing, solver/GTO claims, production deployment, or regulated-gaming functionality.
- Future-ready seams: game engine, evaluator, equity calculator, coaching policy, and presentation are separate modules; the game state includes stable hand identifiers and an event-shaped action log suitable for later histories, quizzes, ranges, scenarios, and multiplayer transport.

## Current-state evidence

- Existing behavior: the approved destination was empty; the project is being created from scratch in its own `poker-learning-game` folder, separate from Darwin Shared AI.
- Reusable primitives: none in the destination. Standard browser APIs and the React/Vite toolchain will be used.
- Constraints: the prototype must run locally, remain simulation-only, and provide approximate—not solver-grade—equity. No external service or database is required.

## Decisions and assumptions

| Decision | Status | Owner | Resolution |
|---|---|---|---|
| Project location | Resolved | User | Separate `poker-learning-game` folder in this Codex workspace. |
| Client stack | Resolved | User | React 19, TypeScript, Vite. |
| Table model | Resolved | User | Heads-up player versus a concealed random opponent. |
| Betting abstraction | Chosen | Lead | Educational decision points use a configurable amount-to-call and pot; chips are illustrative only. |
| Equity | Chosen | Lead | Monte Carlo sampling from unseen cards; ties split; UI labels results approximate. |
| Recommendation policy | Chosen | Lead | Explainable heuristics using equity, pot odds, made-hand strength, and drawing potential—not a GTO/solver claim. |
| Difficulty | Chosen | Lead | Same underlying truth, with progressively more technical language and detail. |

## Architecture and lifecycle

### Modules

- `src/domain/cards.ts`: card, rank, suit, street, action, difficulty, and state contracts; deck construction and display helpers.
- `src/domain/evaluator.ts`: pure five-to-seven-card best-hand evaluation and comparison.
- `src/domain/equity.ts`: sampleable Monte Carlo equity estimation against one random opponent plus draw/outs analysis.
- `src/domain/coach.ts`: explainable recommendation policy, pot odds, confidence, and difficulty-aware teaching copy.
- `src/game/gameEngine.ts`: pure hand lifecycle and state transitions (`new hand → flop → turn → river → showdown`).
- `src/hooks/usePokerTrainer.ts`: UI orchestration and memoized analysis; replaceable later by a server or multiplayer state adapter.
- `src/components/*`: presentation-only table, cards, insight rail, controls, and learning content.

### State machine

`preflop → flop → turn → river → showdown`; “Deal next” advances exactly one street and “New hand” resets with a fresh shuffled deck. The opponent’s cards remain concealed until showdown. Analysis derives from player-visible cards only; equity samples unknown opponent cards and remaining board cards without leaking the actual opponent hand.

### Data, API, authorization, and audit

- All state is ephemeral and owned by the current browser tab. No personal data, login, remote API, database, telemetry, or durable audit trail exists in the MVP.
- Domain functions are pure where practical, so a future API can serialize `GameState` and return an `AnalysisSnapshot` without changing UI contracts.
- Action history is represented locally as structured timeline entries; persistence is deferred.

### Compatibility, rollout, and rollback

- Target current evergreen desktop and mobile browsers. Build output is static assets.
- Rollout is local-only via the Vite development server or built preview. Rollback is deletion/reversion of this isolated folder; no external state exists.

## Workstreams and agents

| ID | Workstream | Agent/model | Owned files | Dependencies | Deliverable | Verification | Status |
|---|---|---|---|---|---|---|---|
| A0 | Contracts and architecture | Lead / GPT-5 high reasoning | `docs/*`, shared contracts | None | Frozen module boundaries and acceptance criteria | Lead review | Complete |
| A1 | Poker domain engine | Worker / GPT-5.6 Terra medium | `src/domain/*`, `src/game/*`, domain tests | A0 | Evaluator, equity, outs, coach, lifecycle | 17/17 integrated tests + typecheck | Complete |
| A2 | Responsive interface | Worker / GPT-5.6 Terra medium | `src/components/*`, `src/styles/*` | A0 contracts | Polished table and teaching UI | Desktop/mobile browser inspection + build | Complete |
| A3 | App integration and docs | Lead / GPT-5 high reasoning | app shell, hook, configuration, README | A1, A2 | Working prototype and local guide | Test, lint, build, browser walkthrough | Complete |
| A4 | Independent verification | Worker / GPT-5.6 Terra medium | Read-only review; test notes | A3 | Defect/risk review | Independent test/lint/build review | Complete |

## Dependency waves

1. Wave 0 — discovery, user choices, isolated destination.
2. Wave 1 — freeze shared TypeScript contracts and file ownership.
3. Wave 2 — implement domain engine and responsive presentation independently.
4. Wave 3 — lead integration, browser checks, and focused seam fixes.
5. Wave 4 — independent verification, documentation, and handoff.

Critical path: `A0 → (A1 ∥ A2) → A3 → A4 → release`.

## Acceptance criteria and verification

- [x] New hand produces two player cards and a concealed opponent hand from a unique 52-card deck.
- [x] Street controls reveal exactly 3/1/1 community cards and terminate at showdown.
- [x] Best hand and category are evaluated correctly from available cards.
- [x] Equity is continuously visible, explicitly approximate, and recomputed without using concealed opponent cards.
- [x] Outs/draw information is sensible for the current street and avoids double-counting unseen ranks/suits.
- [x] Recommendation returns fold/check/call/raise with pot odds, equity, and plain-language reasoning.
- [x] Beginner, intermediate, and advanced modes materially change explanation depth.
- [x] Opponent cards reveal only at showdown; no real-money or gambling CTA appears.
- [x] Layout is usable at desktop and mobile widths with keyboard-visible controls.
- [x] Unit tests, TypeScript checks, lint, and production build pass.
- [x] README documents install, run, test, build, architecture, limitations, and extension seams.

## Risks and recovery

| Risk | Mitigation | Rollback / recovery |
|---|---|---|
| Monte Carlo sampling causes UI lag | Bound iterations by street and compute from memoized visible state. | Reduce samples without changing the analysis contract. |
| “Outs” overstates true clean outs | Label as estimated improvement cards and explain that opponent redraws can reduce value. | Hide detailed count for unsupported patterns; retain draw copy. |
| Coaching appears authoritative | Mark recommendations educational/heuristic and equity approximate. | Fall back to neutral “review the factors” guidance. |
| Hand evaluator edge cases | Pure evaluator with canonical category and tie-break unit tests. | Block release until failing fixtures are corrected. |

## Operator actions

- Required: install local npm dependencies once (`npm install`).
- Required: run the local application (`npm run dev`).
- No database, secrets, migrations, accounts, payments, deployment, or external-system actions.

## Progress log

- 2026-08-24T15:16:44-07:00 — Tracker initialized in isolated project folder.
- 2026-08-24T15:16:51-07:00 — User-approved defaults recorded; architecture, contracts, workstreams, and acceptance criteria frozen.
- 2026-08-24T15:25:52-07:00 — Domain and UI lanes integrated; 15 tests, lint, TypeScript, and production build passed.
- 2026-08-24T15:28:30-07:00 — Browser walkthrough verified street progression, hidden cards, showdown reveal, live analysis, desktop/mobile layout, no horizontal overflow, and no console errors. Currency notation replaced with fictional chips; showdown now shows the exact result.
- 2026-08-24T15:30:00-07:00 — Independent release verification started.
- 2026-08-24T15:33:55-07:00 — Review findings fixed: improvement cards now require a stronger evaluated best hand; card equity remains stable across teaching and betting controls. Two regression tests added; 17/17 passed.
- 2026-08-24T15:35:00-07:00 — Independent re-review confirmed both fixes; test, lint, and production build passed. Documentation refreshed for release.

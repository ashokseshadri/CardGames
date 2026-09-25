# Poker Study Lab

Poker Study Lab is a local, play-money Texas Hold’em learning simulation for two to six total players. It reveals each street, evaluates the learner’s best hand, estimates multiway equity, identifies improvement cards (“outs”), simulates opponent actions, shows what each opponent may hold with educational probabilities, and gives an explainable fold/check/call/raise recommendation. An optional SQLite-backed career mode adds a persistent fictional-chip bankroll, history, borrowing, repayment, and daily interest mechanics.

It is a teaching tool—not a real-money gambling product, poker solver, or source of guaranteed strategy. There are no accounts, deposits, prizes, payments, or online opponents.

## Run locally

Requirements: a current Node.js release with `node:sqlite` and npm. The career feature was verified with Node 25.6.

```bash
npm install
npm run dev
```

Open the local address printed by Vite, normally <http://localhost:5173>.

The first app start after this upgrade automatically creates `data/career.sqlite`. The `data/` directory is ignored by Git. Keep a copy of that SQLite file if you want to back up the career; do not copy it while the app is actively writing unless you also include its `-wal` file or stop the app first.

Useful checks:

```bash
npm test
npm run lint
npm run build
```

## What the trainer includes

- A fresh, uniquely shuffled 52-card deck for every hand.
- Pre-flop, flop, turn, river, and showdown progression.
- Configurable 2–6 seat tables with dealer/button, small blind, big blind, and six-max position labels.
- A real simplified betting loop with 100-chip seat stacks, automatic 5/10 blind posting, correct heads-up and multiway action order, and automatic opponent decisions.
- Every opponent’s cards hidden until showdown, including folded players.
- Correct best-five evaluation from five to seven cards, including wheel straights and kicker comparisons.
- Continuously updated multiway Monte Carlo equity against every active opponent; showdown resolves to the exact observed result.
- Individual action-conditioned probability profiles showing each opponent’s three most likely holding categories, examples, and visible action history.
- Detailed street briefings covering board texture, multiway pressure, draws, position, action signals, next-card threats, blockers, and model limits according to difficulty.
- Flush, straight, pair, two-pair, trips, full-house, and quads improvement-card explanations where applicable.
- Heuristic coaching based on equity, pot odds, current hand strength, and draws.
- Beginner, intermediate, and advanced explanation modes.
- Legal learner controls for Fold, Check, Call, and Raise, including minimum, half-pot, pot, and validated custom raise totals.
- Practice/Career switching: practice hands never change the saved career ledger.
- A career begins with 0 fictional chips; borrow exactly 100 to fund the first 100-chip table stack. Every completed hand records the learner’s actual signed table result.
- Unlimited fictional borrowing in exact 100-chip increments, with repayment applied to accrued interest before principal.
- Persistent totals for chips won, lost, borrowed, repaid, interest earned, interest charged, and the win/loss/tie record.
- A chronological career story stored locally in embedded SQLite and protected from duplicate hand settlement.
- Three compact, independently expandable sections for Career Ledger, Marginal Debt Bracket, and Career Story.
- Daily compounding for each full elapsed UTC day: available chips earn 5% APR; outstanding debt uses marginal 15%, 20%, and 40% APR brackets.
- Responsive, keyboard-accessible desktop and mobile layouts.

## Architecture

The app intentionally separates poker truth from presentation:

```text
src/domain/cards.ts       Shared contracts and deck helpers
src/domain/evaluator.ts   Pure hand evaluation and comparison
src/domain/equity.ts      Monte Carlo equity and draw analysis
src/domain/positions.ts   2–6 seat position and blind assignment
src/domain/opponentModel.ts Public-action simulation and opponent reads
src/domain/streetBriefing.ts Difficulty-aware street watchouts
src/domain/coach.ts       Explainable recommendation policy
src/game/gameEngine.ts    Immutable hand/state transitions
src/hooks/                React orchestration adapter
src/components/           Prop-driven presentation
src/styles/               Responsive visual system
src/career/               Career API contracts, repository, and hook
server/careerLedger.mjs   Embedded SQLite schema and accounting ledger
server/careerApi.mjs      Same-origin local JSON API
server.mjs                Combined career API and Vite development server
```

The domain and game modules do not depend on React. A future server, multiplayer transport, quiz runner, or scenario loader can reuse them and replace the current hook without rewriting the interface.

## Important limitations

- Equity is approximate before showdown and changes slightly between calculations.
- Equity opponents are sampled uniformly from unseen cards. The separate holding profiles use public position and simulated actions, but they are broad heuristics—not combo-exact ranges or solver output.
- “Outs” are unseen cards that improve the current hand category or draw. They are not guaranteed winning cards because an opponent can redraw or already hold a stronger hand.
- Coaching is intentionally transparent and educational, not GTO-certified advice.
- Betting uses real 5/10 blind contributions, 100-chip stacks, legal action order, minimum raises, street closure, all-in runouts, and pot awards. Unequal-stack side-pot scenarios, rake, antes, and tournament rules remain out of scope; raises are capped to prevent unmatched side pots.
- In-progress poker hand state and detailed card/action hand histories are still temporary, but completed career results and career transactions persist in local SQLite.
- Career accrual follows the local computer clock and counts only full elapsed 24-hour UTC periods. Backward clock movement does not subtract interest.
- Career values are rounded to four decimal places internally and displayed to two decimals.
- The embedded `node:sqlite` API is still labeled experimental by the installed Node runtime; the SQLite file format itself is standard.

## Extension path

- **Human multiplayer:** serialize `GameState`, move shuffling/dealing to a trusted server, and replace the hook with a realtime state adapter.
- **Hand history:** persist the existing `handId` and structured timeline events through a repository interface.
- **Career synchronization:** replace the localhost API repository with authenticated server storage while retaining the current client contracts.
- **Quizzes:** pause at any street, hide the coach panel, collect a learner choice, then reveal the same `AnalysisSnapshot` as feedback.
- **Ranges:** replace the uniform opponent sampler with weighted starting-hand combinations while retaining the equity result contract.
- **Scenarios:** add deterministic deck/state factories beside `createNewGame` and describe the learning objective as scenario metadata.
- **Training analytics:** record decisions and concepts locally or behind an opt-in account boundary; privacy and retention rules would need to be designed first.

The original multi-player table milestone is archived in [`docs/multi-player-table-implementation-plan.md`](docs/multi-player-table-implementation-plan.md), with its historical tracker at [`docs/multi-player-table-progress.html`](docs/multi-player-table-progress.html).

Career-mode architecture, lifecycle, and interest formulas are documented in [`docs/career-mode-implementation-plan.md`](docs/career-mode-implementation-plan.md). Its standalone tracker is [`docs/career-mode-progress.html`](docs/career-mode-progress.html).

The real betting-round state machine and Career settlement contract are documented in [`docs/betting-rounds-implementation-plan.md`](docs/betting-rounds-implementation-plan.md), with progress at [`docs/betting-rounds-progress.html`](docs/betting-rounds-progress.html).

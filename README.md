# RangeBench — Poker Strategy Simulation Platform

Play a small calibration sample yourself, let the system learn a behavioral model of *your* strategy, then backtest that model over hundreds of thousands of simulated hands against configurable opponent pools — and analyze the results like a quant.

6-max No-Limit Hold'em cash games. Next.js 15 · TypeScript (strict) · Tailwind v4 · Recharts · Zod · Vitest.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm test           # unit + integration tests (engine, side pots, seeds, turnover, model)
npm run typecheck  # tsc --noEmit
npm run lint
npm run build      # production build
```

No environment variables, database, or external services are required — the demo persists everything to browser `localStorage`.

## The workflow

1. **Calibrate** (`/calibrate`) — play 25 / 50 / 100 / 250 hands (or a custom count) at a full simulated table. Every decision is recorded with complete context: position, stack depth, pot size, bet faced, SPR, street, action history, hole cards.
2. **Profile** (`/profile`) — the system estimates your tendencies (VPIP, PFR, 3-bet, fold-to-3-bet, c-bet, check-raise, river calls, bet sizing, positional looseness…) with **Wilson 95% confidence intervals** and explicit sample-size warnings. It also trains a bucketed behavioral policy (street × position × situation × hand-strength) with hierarchical shrinkage toward a strength-aware prior.
3. **Experiment** (`/experiments/new`) — configure blinds, rake (% + cap + no-flop-no-drop), buy-ins, hand count (10 to 500,000), a reproducible seed, and an opponent pool built from 13 archetypes (TAG, LAG, calling station, nit, maniac, adaptive, …) with pool-level skill/looseness/aggression multipliers, realistic session lengths, stop-loss/stop-win departures, rebuys, and seat turnover.
4. **Analyze** (`/experiments/[id]`) — bb/100 with confidence interval and significance flag, standard deviation, max drawdown, profit factor, risk of ruin for any bankroll, showdown vs non-showdown (red line/blue line), win rate by position / stack depth / pot type, starting-hand heatmap, action mix, bet-size distribution, model-confidence per decision, manual-vs-simulated comparison, and a hand-history explorer with street-by-street replay.
5. **Iterate** — duplicate an experiment, change one variable (e.g. rake, pool skill), re-run, and compare runs side by side (`/compare`). Same seed ⇒ identical results, verified by tests.

## Honest limitations

- **Opponents are heuristic archetypes**, not learned models of real player populations. Their aggregate stats are realistic; their postflop play is simpler than strong humans.
- **Your model is a statistical imitation** of a small behavioral sample. It reproduces frequencies and sizing in bucketed situations; it does not capture deep hand-reading or exploitative adjustments you might make.
- **Equities are Monte Carlo estimates** (fast bitmask 7-card evaluator, cross-validated against a reference evaluator in tests).
- A positive simulated win rate is evidence about **this synthetic pool**, not a prediction of live results. The UI repeats this wherever results are shown.

## Performance

The hot path uses an allocation-free bitmask hand evaluator; the batch runner processes roughly **1,500–2,000 hands/sec** in-browser (single thread) and yields between chunks so the UI stays responsive with progress and cancellation. 100k hands ≈ 1 minute. See `docs/ARCHITECTURE.md` for the worker-service scaling path.

## Storage modes

- **Detailed** — every hand history stored (capped at 3,000 per experiment due to browser storage limits).
- **High-speed** — full aggregates plus 1-in-N sampled histories; automatic for runs over 20k hands.

Swapping `localStorage` for Postgres requires implementing one interface (`DataStore` in `lib/storage/store.ts`); the schema sketch is in `docs/ARCHITECTURE.md`.

## Deploying to Vercel

```bash
npm i -g vercel
vercel        # follow the prompts; zero env vars needed
```

Or connect the GitHub repo in the Vercel dashboard — the default Next.js settings work as-is.

## Pushing to GitHub

The repo is already committed locally. From the project directory:

```bash
git remote add origin https://github.com/kcurley06-pixel/Poker-Simulation.git
git branch -M main
git push -u origin main
```

(Use your own GitHub credentials / token when prompted.)

## Project layout

```
app/                  # Next.js App Router pages (all client-side; no server state)
components/           # PokerTable, HandReplayer, charts, UI primitives
lib/poker/            # deck, RNG (seeded, checkpointable), evaluator (+ fast path), equity, engine
lib/agents/           # 13 archetype profiles + decision logic
lib/player-model/     # tendency statistics (Wilson CIs) + bucketed behavioral policy
lib/simulation/       # table session (turnover), manual session, batch runner, defaults
lib/analytics/        # incremental aggregator, risk of ruin
lib/storage/          # DataStore interface + localStorage implementation
tests/                # engine correctness, side pots, seeds, turnover, model, analytics
docs/                 # PLAN, ARCHITECTURE, LIMITATIONS
```

## Docs

- `docs/PLAN.md` — the implementation plan and scope decisions
- `docs/ARCHITECTURE.md` — engine design, player model math, scaling path, DB schema sketch
- `docs/LIMITATIONS.md` — every simplification, stated plainly, with the roadmap

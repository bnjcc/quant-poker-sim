# RangeBench — Poker Strategy Simulation Platform

Play a small calibration sample yourself, let the system learn a behavioral model of *your* strategy, then backtest that model over hundreds of thousands of simulated hands against configurable opponent pools — and analyze the results like a quant.

6-max No-Limit Hold'em cash games. Next.js 15 · Supabase · TypeScript (strict) · Tailwind v4 · Recharts · Zod · Vitest.

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

Without environment variables the demo still works with browser storage. Configure Supabase for authenticated, private, cross-device persistence.

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`, then set the project URL and publishable key from the Supabase Connect dialog.
3. Apply the files in `supabase/migrations/` in timestamp order with the Supabase CLI (`supabase db push`) or paste them into the SQL editor.
4. Add `http://localhost:3000/auth/confirm` and the deployed equivalent to the Auth redirect URL allow list.
5. Start the app and create an account at `/login`.

The browser receives only the publishable key. Every table has row-level security tied to `auth.uid()`; never add a Supabase secret or service-role key to `NEXT_PUBLIC_*` variables.

## The workflow

1. **Calibrate** — either play a normal sample at `/calibrate`, or use `/range-calibrate` to select an exact 169-grid first-in range and play only those starting hands. Both flows run as online-paced matches with a 15-second action clock, paced opponent decisions, snap actions, and automatic check/fold on timeout. Every decision retains position, stack depth, pot size, bet faced, SPR, street, action history, hole cards, real response time, timeout state, and the most recent opponent timing cue.
2. **Profile** (`/profile`) — the system estimates your tendencies (VPIP, PFR, 3-bet, fold-to-3-bet, c-bet, check-raise, river calls, bet sizing, positional looseness…) with **Wilson 95% confidence intervals** and explicit sample-size warnings. Beginner-friendly expandable guides and the full `/glossary` explain every acronym with examples and advanced interpretation. The profile also reports average/median response time, snap rate, and timeouts, then trains a bucketed behavioral policy (street × position × situation × hand-strength × opponent-timing cue) with hierarchical shrinkage toward a strength-aware prior.
3. **Experiment** (`/experiments/new`) — configure blinds, rake (% + cap + no-flop-no-drop), buy-ins, hand count (10 to 500,000), a reproducible seed, and an opponent pool built from 13 archetypes (TAG, LAG, calling station, nit, maniac, adaptive, …) with pool-level skill/looseness/aggression multipliers, realistic session lengths, stop-loss/stop-win departures, rebuys, and seat turnover.
4. **Analyze** (`/experiments/[id]`) — bb/100 with confidence interval and significance flag, standard deviation, max drawdown, profit factor, risk of ruin for any bankroll, showdown vs non-showdown (red line/blue line), win rate by position / stack depth / pot type, starting-hand heatmap, action mix, bet-size distribution, model-confidence per decision, manual-vs-simulated comparison, and a hand-history explorer with street-by-street replay.
5. **Simulated Hand Review** — replay eight model decisions from different stored hands in the browser, confirm each decision or enter the action and size you would actually choose. Feedback is saved in the experiment and in the dedicated `strategy_reviews` dataset. Any corrections retrain an experiment-specific policy and automatically rerun the same seeded simulation; an all-accurate round stops without rerunning. `/accuracy` summarizes the saved feedback without exposing user exports.
6. **Iterate** — duplicate an experiment, change one variable (e.g. rake, pool skill), re-run, and compare runs side by side (`/compare`). Same seed ⇒ identical results within the same engine version, verified by tests.

## Honest limitations

- **Opponents are heuristic archetypes**, not learned models of real player populations. Their aggregate stats are realistic; their postflop play is simpler than strong humans.
- **Your model is a statistical imitation** of a small behavioral sample. It reproduces frequencies and sizing in bucketed situations; it does not capture deep hand-reading or exploitative adjustments you might make.
- **Equities are Monte Carlo estimates** (fast bitmask 7-card evaluator, cross-validated against a reference evaluator in tests).
- A positive simulated win rate is evidence about **this synthetic pool**, not a prediction of live results. The UI repeats this wherever results are shown.

## Performance

The hot path uses an allocation-free bitmask hand evaluator; the batch runner processes roughly **1,500–2,000 hands/sec** in-browser (single thread) and yields between chunks so the UI stays responsive with progress and cancellation. 100k hands ≈ 1 minute. See `docs/ARCHITECTURE.md` for the worker-service scaling path.

## Storage and run modes

- **Supabase cloud** — authenticated users get private calibrations, experiments, individually stored hand histories, and normalized strategy-review feedback. Reads are ordered and paginated; experiment deletion cascades to its hands and reviews. Project owners can analyze all tester feedback from the Supabase `strategy_reviews` table while public app access remains user-isolated by RLS.
- **Browser fallback** — when Supabase is not configured, the original zero-setup local store remains available with its ~3,000-hand cap.
- **Browser import** — after enabling Supabase, Settings can copy existing browser data into the signed-in account while retaining the local copy as a backup.

- **Detailed** — every hand history stored; browser fallback mode caps this at 3,000 per experiment.
- **High-speed** — full aggregates plus 1-in-N sampled histories; automatic for runs over 20k hands.

## Deploying to Vercel

```bash
npm i -g vercel
vercel        # add the two NEXT_PUBLIC_SUPABASE_* values for cloud mode
```

Or connect the GitHub repo in the Vercel dashboard — the default Next.js settings work as-is.

## Project layout

```
app/                  # Next.js App Router pages and auth confirmation endpoint
components/           # PokerTable, HandReplayer, charts, UI primitives
lib/poker/            # deck, RNG (seeded, checkpointable), evaluator (+ fast path), equity, engine
lib/agents/           # 13 archetype profiles + decision logic
lib/player-model/     # tendency statistics (Wilson CIs) + bucketed behavioral policy
lib/simulation/       # table session (turnover), manual session, batch runner, defaults
lib/analytics/        # incremental aggregator, risk of ruin
lib/storage/          # DataStore interface + local and Supabase implementations
lib/supabase/         # browser/server clients and auth session middleware
supabase/             # local config, schema migration, and database security tests
tests/                # engine correctness, side pots, seeds, turnover, model, analytics
docs/                 # PLAN, ARCHITECTURE, LIMITATIONS
```

## Docs

- `docs/PLAN.md` — the implementation plan and scope decisions
- `docs/ARCHITECTURE.md` — engine design, player model math, scaling path, DB schema sketch
- `docs/LIMITATIONS.md` — every simplification, stated plainly, with the roadmap

# Architecture

## Overview

Everything below `app/` is a pure TypeScript library with no DOM or Next.js dependencies. Pages are thin clients over `lib/`. This split is deliberate: the simulation core can be lifted into a worker service or CLI unchanged.

```
UI (app/, components/)      ← client components, charts, replay
        │
lib/simulation/             ← ManualSession, TableSession (turnover), runSimulation (chunked)
        │
lib/agents/  lib/player-model/   ← opponent policies · learned user policy
        │
lib/poker/                  ← engine, evaluator (+ fast path), equity, deck, seeded RNG
        │
lib/analytics/  lib/storage/     ← incremental aggregates · DataStore interface
```

## Poker engine (`lib/poker/engine.ts`)

A single `HandEngine` instance owns one hand: blinds, dealing, betting rounds, street progression with burn cards, all-in runouts, side pots, rake, settlement.

Correctness properties enforced by tests (`tests/engine.test.ts`):

- **Chip conservation**: for every hand, Σ net across seats = −rake. Verified on hand-crafted scenarios and a 50-hand randomized fuzz.
- **Min-raise rules**: raise size must be ≥ the last raise increment; an all-in below the minimum raise does **not** reopen betting sizes.
- **Side pots**: built from sorted commitment levels; folded players' chips stay in the pots they contributed to; overbet chips are refunded via a single-eligible pot. Verified with a rigged deck (injectable pop-order deck) so exact showdown outcomes are known.
- **Split pots**: odd chip goes to the first seat left of the button.
- **Rake**: percentage with cap, optional no-flop-no-drop.

Heads-up blind rules (button = SB, acts first preflop) are handled since turnover can briefly leave a table short-handed.

## Hand evaluation

Two evaluators, cross-validated against each other in tests over random samples:

- `evaluate5/evaluate7` — reference implementation, best-of-21 5-card combos, readable and used for showdown categories displayed in the UI.
- `fastScore7` — allocation-free bitmask evaluator (rank counts, suit masks, straight detection via bit runs) that produces scores on the same total order. Used in the Monte Carlo hot path; ~20–30× faster.

## Equity (`lib/poker/equity.ts`)

Monte Carlo: deal random opponent hands and runouts with the seeded RNG, score with `fastScore7`, average win/tie share. Iteration counts scale with agent skill (60–140). All equity figures in the product are labeled estimates.

## Seeded randomness (`lib/poker/rng.ts`)

mulberry32 with a string-hash seed. `getState()/setState()` allow checkpointing (each hand history stores the RNG state before the deal). One RNG instance drives an entire simulation, so a `(seed, config, version)` triple fully determines every card, every agent decision, and every pool event. Reproducibility is covered by tests.

## Opponent agents (`lib/agents/`)

Each archetype is a parameter vector (`vpip, pfr, threeBet, aggression, cbet, bluff, callPadding, betSizeMean/Std, positionalAwareness, stackAwareness, skill, adaptive, …`). Decisions:

- **Preflop**: Chen-style hand strength + skill-scaled noise + positional and stack adjustments, mapped through the profile's open/3-bet/call thresholds.
- **Postflop**: MC equity vs pot odds with profile-driven value betting, c-betting, bluffing, check-raising, and calling-station padding.
- **Adaptive** agents track observed fold rates and widen bluffing against tight opposition.

Per-instance jitter means two "TAGs" at the same table play slightly differently.

## Learned user model (`lib/player-model/`)

Two layers:

1. **Descriptive tendencies** (`stats.ts`) — classic HUD-style frequencies computed from recorded decisions, each reported as a Laplace-smoothed estimate with a **Wilson 95% interval** and a sample-size-based confidence weight. These power the profile page; nothing here feeds simulation directly.
2. **Behavioral policy** (`policy.ts`) — the generative model used in simulation. Decisions are bucketed by `street × position-class × facing-situation × hand-strength-quartile` (strength via MC equity at decision time). Each bucket stores action counts and observed bet sizes. At simulation time:
   - probabilities = shrinkage blend of bucket counts with a strength-aware prior, `weight = n / (n + K)` with `K = 8`;
   - hierarchical fallback to coarser buckets when the exact one is empty;
   - illegal actions get their mass redistributed to legal substitutes (e.g. bet→raise);
   - bet sizes are sampled from the user's empirical pot-fraction pool blended with a ⅔-pot prior.

   Every simulated decision logs its probabilities and its **confidence** (data-vs-prior weight); the experiment page reports the average so users can see how much of "their" play was actually theirs.

## Table session & turnover (`lib/simulation/table.ts`)

`TableSession` owns seats across hands: geometric session lengths, stop-loss/stop-win departures measured in buy-ins, rebuy probability when felted, random churn, and replacement draws from the weighted pool with pool-level skill/looseness/aggression multipliers. The user auto-rebuys and buy-ins are counted. Button rotation skips empty seats; short-handed play (down to HU) works.

## Batch runner (`lib/simulation/runner.ts`)

`runSimulation` is environment-agnostic: an async chunked loop (default 200 hands/chunk) that yields to the event loop, reports progress, honors a cancel callback, and returns aggregates + stored hands. In the browser it keeps the UI responsive; on a server it can run as-is inside a job worker.

## Analytics (`lib/analytics/aggregate.ts`)

`Aggregator` is incremental — O(1) per hand plus a downsampled equity curve (max ~2,000 points, stride doubling) — so 500k-hand runs don't hold 500k objects. Outputs: bb/100, per-hand σ, 95% CI, significance flag, max drawdown, profit factor, showdown/non-showdown split, rake, breakdowns by position/hole cards/stack depth/pot type, action mix, bet-size histogram. `riskOfRuin` uses the classical diffusion approximation `exp(−2·wr·bankroll/σ²)`.

## Storage (`lib/storage/store.ts`)

All persistence goes through the `DataStore` interface:

```ts
interface DataStore {
  listCalibrations(); getCalibration(id); saveCalibration(c); deleteCalibration(id);
  listExperiments(); getExperiment(id); saveExperiment(e); deleteExperiment(id);
  saveHands(experimentId, hands); getHands(experimentId);
}
```

The shipped implementation is `LocalStorageStore` (zero setup, demo-friendly, ~5 MB budget, 3,000-hand cap per experiment with eviction). A Postgres/Prisma implementation plugs in behind the same interface. Schema sketch:

```
calibrations(id pk, name, created_at, hands_played, tendencies jsonb, policy jsonb)
decisions(id pk, calibration_id fk, hand_number, context jsonb, action jsonb)
experiments(id pk, created_at, config jsonb, calibration_id fk, version, status, results jsonb)
hands(id pk, experiment_id fk, hand_number, history jsonb)          -- consider partitioning
```

With a DB, move `runSimulation` into a queue worker (the function needs no changes), stream progress over SSE/WebSocket, and drop the storage caps.

## Scaling path

1. **Now**: single-threaded in-browser, ~1.5–2k hands/sec, cancellable.
2. **Web Worker**: move the runner off the main thread (no code changes to `lib/`); parallel shards with per-shard seeds derived from the master seed, merged by the aggregator.
3. **Server workers**: same runner in Node workers behind a job queue; Vercel functions are a poor fit for hour-long jobs, so a small worker service (Fly/Railway/EC2) is the recommended target — documented, not implemented.

## Versioning & reproducibility

`SIMULATION_VERSION` is stamped on every experiment. Results are only comparable/reproducible within a version; any change to engine, agents, or model logic must bump it.

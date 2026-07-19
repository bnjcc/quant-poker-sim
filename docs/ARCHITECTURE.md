# Architecture

## Overview

Everything below `app/` is a pure JavaScript library with no DOM or Next.js dependencies. Pages are thin clients over `lib/`. This split is deliberate: the simulation core can be lifted into a worker service or CLI unchanged.

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

## Poker engine (`lib/poker/engine.js`)

A single `HandEngine` instance owns one hand: blinds, dealing, betting rounds, street progression with burn cards, all-in runouts, side pots, rake, settlement.

Correctness properties enforced by tests (`tests/engine.test.js`):

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

## Equity (`lib/poker/equity.js`)

Monte Carlo: deal random opponent hands and runouts with the seeded RNG, score with `fastScore7`, average win/tie share. Iteration counts scale with agent skill (60–140). All equity figures in the product are labeled estimates.

## Seeded randomness (`lib/poker/rng.js`)

mulberry32 with a string-hash seed. `getState()/setState()` allow checkpointing (each hand history stores the RNG state before the deal). One RNG instance drives an entire simulation, so a `(seed, config, version)` triple fully determines every card, every agent decision, and every pool event. Reproducibility is covered by tests.

## Opponent agents (`lib/agents/`)

Each archetype is a parameter vector (`vpip, pfr, threeBet, aggression, cbet, bluff, callPadding, betSizeMean/Std, positionalAwareness, stackAwareness, skill, adaptive, …`). Decisions:

- **Preflop**: Chen-style hand strength + skill-scaled noise + positional and stack adjustments, mapped through the profile's open/3-bet/call thresholds.
- **Postflop**: MC equity vs pot odds with profile-driven value betting, c-betting, bluffing, check-raising, and calling-station padding.
- **Adaptive** agents track observed fold rates and widen bluffing against tight opposition.

Per-instance jitter means two "TAGs" at the same table play slightly differently.

## Learned user model (`lib/player-model/`)

Two layers:

1. **Descriptive tendencies** (`stats.js`) — classic HUD-style frequencies computed from recorded decisions, each reported as a Laplace-smoothed estimate with a **Wilson 95% interval** and a sample-size-based confidence weight. These power the profile page; nothing here feeds simulation directly.
2. **Behavioral policy** (`policy.js`) — the generative model used in simulation. Decisions are bucketed by `street × position-class × facing-situation × hand-strength-quartile × opponent-timing` (strength via MC equity at decision time; timing is none/snap/normal/tank). Each bucket stores action counts, observed bet sizes, and response-time samples by action. At simulation time:
   - probabilities = shrinkage blend of bucket counts with a strength-aware prior, `weight = n / (n + K)` with `K = 8`;
   - hierarchical fallback to coarser buckets when the exact one is empty;
   - timing-specific buckets fall back to untimed v1-compatible buckets when samples are sparse;
   - illegal actions get their mass redistributed to legal substitutes (e.g. bet→raise);
   - bet sizes are sampled from the user's empirical pot-fraction pool blended with a ⅔-pot prior.
   - decision time is sampled from matching empirical action/context observations, with an online-style human prior when no timing data exists; learned timeouts produce the legal check/fold default.

Range-first calibrations add either one shared 169-hand first-in range or a chart keyed by exact table position to the serialized policy. Manual positional calibration forces a hand from the chart matching the user's current seat. Unselected hands fold when voluntarily entering an unraised pot (or check a free big-blind option); selected hands always continue and the learned policy chooses the action and size. The explicit chart is deliberately not applied when facing a raise, where recorded reactions and the normal model prior still govern play. Policy version 3 serializes position charts while remaining compatible with version 1 and 2 strategies.

Every simulated decision logs its probabilities and its **confidence** (data-vs-prior weight); the experiment page reports the average so users can see how much of "their" play was actually theirs.

## Table session & turnover (`lib/simulation/table.js`)

`TableSession` owns seats across hands: geometric session lengths, stop-loss/stop-win departures measured in buy-ins, rebuy probability when felted, random churn, and replacement draws from the weighted pool with pool-level skill/looseness/aggression multipliers. The user auto-rebuys and buy-ins are counted. Button rotation skips empty seats; short-handed play (down to HU) works.

Every voluntary action also carries a seeded virtual decision time. Manual calibration gives the user a real 15-second clock but compresses each opponent turn to a fixed 500ms preview; the opponent's full simulated time remains on the action and is shown at the seat. A per-hand Check/Fold shortcut records the initial intentional response, then automatically checks when free or folds to a wager for the rest of that hand without inventing zero-time timing samples. Batch runs record the same timing metadata without sleeping. `DecisionContext` exposes the most recent opponent action time on the current street. Learned user behavior conditions directly on that cue. Heuristic opponents use only a deliberately capped timing tell (a few equity points at most), because real-world timing signals are noisy.

Manual calibration wraps those heuristic opponents in an information-directed controller that is not used by batch experiments. Normal preflop decisions remain authoritative. When a bot's normal policy would fold to a user raise, it receives only a capped extra call chance based on its actual hole-card strength, pot odds, stack commitment, and profile looseness; no call is forced. Postflop hands rotate between passive showdown lines and pressure, while snap/normal/tank cues are balanced. Starting hands come from a shuffled combo-weighted bag, preserving natural 4/6/12 class frequencies while reducing redundant independent draws. Calibration results are therefore measurement data, not a realistic opponent-pool performance estimate.

## Batch runner (`lib/simulation/runner.js`)

`runSimulation` is environment-agnostic: an async chunked loop (default 200 hands/chunk) that yields to the event loop, reports progress, honors a cancel callback, and returns aggregates + stored hands. In the browser it keeps the UI responsive; on a server it can run as-is inside a job worker.

For multiplayer runs, `TableSession` owns a fixed map of real-user policy seats in addition to its replaceable heuristic-agent seats. Each real user has an independent learned-policy decider, stack, rebuy count, decision log, and incremental `Aggregator`. A **with bots** run requires two real users and fills the remaining configured seats from the bot pool. A **players only** run requires three real users, sizes the table to the selected participant count, and creates no agent seats. The first participant remains the experiment owner for backwards-compatible headline analytics; `participantResults` contains the complete real-user leaderboard.

## Usernames, friends, and shared strategies

Cloud accounts receive a unique lowercase username in `profiles`. Canonical unordered rows in `friendships` model pending and accepted connections. Security-definer RPCs handle requests and responses so clients cannot forge accepted relationships.

`multiplayer_strategies` contains at most one opt-in policy snapshot per account. It references an owned calibration but stores only the learned policy and presentation metadata—not raw recorded decisions. Its RLS read rule uses `is_multiplayer_connection` to allow the owner, accepted direct friends, and friends exactly one additional hop away. Removing a friendship immediately removes any access that depended on that path. The social-graph RPC returns direct friends, pending requests, and the nearest eligible two-hop players. Experiment creation copies selected policies as point-in-time participant snapshots into the creator's private experiment payload, so later friendship or strategy changes do not mutate a saved run.

## Post-simulation strategy review (`components/StrategyReview.jsx`, `lib/player-model/review.js`)

Completed runs retain the full `DecisionContext`, action index, sampled action, sizing, probabilities, and confidence for simulated-user decisions. Before a review starts, the tester chooses any count from one through the available eligible hands. The review UI selects one low-confidence decision from each chosen hand spread across the stored run, reconstructs the table immediately before that action, and reveals no future board cards while the tester judges the decision. For range-first strategies, every decision from a dealt hand outside the active explicit starting range is excluded as a redundant known fold.

Every confirmation or correction becomes a `RecordedDecision`. Direct review feedback is weighted more heavily than an ordinary calibration observation, then replayed from the immutable base calibration to build an experiment-specific serialized policy. Explicit range-first charts are also updated when first-in feedback adds or removes a starting hand. A correction round is persisted before the same seeded experiment reruns; an all-agree round marks the model accepted without another run. Rerun cancellation leaves a durable pending state that can be retried.

## Analytics (`lib/analytics/aggregate.js`)

`Aggregator` is incremental — O(1) per hand plus a downsampled equity curve (max ~2,000 points, stride doubling) — so 500k-hand runs don't hold 500k objects. Outputs: bb/100, per-hand σ, 95% CI, significance flag, max drawdown, profit factor, showdown/non-showdown split, rake, breakdowns by position/hole cards/stack depth/pot type, action mix, bet-size histogram. `riskOfRuin` uses the classical diffusion approximation `exp(−2·wr·bankroll/σ²)`.

## Storage (`lib/storage/store.js`)

All persistence goes through the shared data-store contract. In addition to calibration, experiment, and hand operations, it exposes strategy-review list/save operations and an atomic experiment-review commit:

```js
const dataStore = {
  getStrategyLeaderboard(limit) {},
  listCalibrations() {},
  getCalibration(id) {},
  saveCalibration(calibration) {},
  deleteCalibration(id) {},
  listExperiments() {},
  getExperiment(id) {},
  saveExperiment(experiment) {},
  deleteExperiment(id) {},
  saveHands(experimentId, hands) {},
  getHands(experimentId) {},
  saveExperimentRun(experiment, hands) {},
  listStrategyReviews() {},
  saveStrategyReview(review) {},
  saveExperimentReview(experiment, review) {},
  getStorageSummary() {},
  deleteAll() {},
};
```

Two implementations ship:

- `SupabaseStore` is selected when both public Supabase variables are configured. Supabase Auth owns identity; `calibrations`, `experiments`, and `experiment_hands` carry `user_id`, and RLS restricts every operation to `auth.uid()`. Large nested domain models remain JSONB payloads while query/order/status fields are normalized. Hand writes are batched into a new revision, which becomes active only after every batch succeeds; reads of the active revision are paginated.
- `strategy_reviews` stores one normalized row per review round plus the complete answer payload. The `save_experiment_strategy_review` database function commits that row together with the experiment's calibrated policy and pending-rerun state. Testers can read only their own rows in the app; the Supabase project owner can analyze all rows from the backend dashboard.
- `LocalStorageStore` remains the zero-setup fallback (~5 MB budget, 3,000-hand cap per experiment with eviction).

The dashboard leaderboard follows the same storage split. Browser mode derives the top three local strategies from completed experiments. Supabase mode calls `get_strategy_leaderboard`, a stable security-definer function that reads private completed rows and returns only username, strategy name, hand-weighted win rate, run count, and total hands. Direct experiment and hand access remains governed by the existing owner-only RLS policies.

The database definition is migration-driven in `supabase/migrations/`. Experiment hands cascade on experiment deletion. Calibration deletion sets the experiment's normalized calibration reference to null, preserving completed results while preventing a rerun. JSON storage uses a small codec so analytics values such as infinite profit factor do not degrade to `null`.

Existing browser data is never silently merged. A signed-in user can explicitly import it from Settings; the import is insert-only, skips IDs already present in the cloud, and keeps the browser copy as a backup.

Simulation still runs in-browser. A later queue worker can run the unchanged `runSimulation`, stream progress over SSE/WebSocket, and support much larger jobs.

## Scaling path

1. **Now**: single-threaded in-browser, ~1.5–2k hands/sec, cancellable.
2. **Web Worker**: move the runner off the main thread (no code changes to `lib/`); parallel shards with per-shard seeds derived from the master seed, merged by the aggregator.
3. **Server workers**: same runner in Node workers behind a job queue; Vercel functions are a poor fit for hour-long jobs, so a small worker service (Fly/Railway/EC2) is the recommended target — documented, not implemented.

## Versioning & reproducibility

`SIMULATION_VERSION` is stamped on every experiment. Results are only comparable/reproducible within a version; any change to engine, agents, or model logic must bump it.

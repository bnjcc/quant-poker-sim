# Implementation Plan (as built)

The plan agreed at the start of the build, kept for the record. Scope decisions were made explicitly rather than silently.

## Product

A calibrate → learn → simulate → analyze loop for 6-max NLHE cash games:

1. Manual calibration play (25/50/100/250 or custom hands) with full decision-context capture.
2. A learned behavioral model of the user: descriptive tendencies with Wilson CIs, plus a generative bucketed policy with shrinkage and confidence reporting.
3. Batch experiments (10–500,000 hands) against a 13-archetype opponent pool with realistic turnover, rebuys, stop-loss/win departures, and pool-level skill/looseness/aggression dials.
4. Quant-grade analytics: bb/100 ± CI, significance, σ, drawdown, profit factor, risk of ruin, red/blue line, positional/stack/pot-type/hole-card breakdowns, sizing distributions, model confidence.
5. Reproducibility: every experiment stores config + seed + engine version; same triple ⇒ identical run (tested).
6. Hand explorer with street-by-street replay; JSON exports; experiment duplication and comparison.

## Key decisions

- **Persistence (original MVP)**: `localStorage` behind a `DataStore` interface kept the demo zero-setup.
- **Persistence (current)**: Supabase Auth + Postgres now provide private per-user cloud storage behind the same interface. Row-level security is the authorization boundary; browser storage remains an explicit unconfigured fallback and import source.
- **Execution**: chunked in-browser runner with progress/cancel. The runner is environment-agnostic so the worker-service upgrade is a deployment change, not a rewrite.
- **Hand evaluation**: readable reference evaluator + allocation-free bitmask fast path, cross-validated in tests. Needed to hit ~2k hands/sec with MC equity inside agent decisions.
- **Equity**: Monte Carlo, always labeled an estimate.
- **Playwright**: omitted from the MVP in favor of a deep Vitest suite on the parts where silent bugs are catastrophic (pots, min-raises, chip conservation, seeds). Documented in LIMITATIONS.md with the intended smoke flows.
- **Honesty as a feature**: sample-size warnings, CI-first presentation, prior-vs-data confidence surfaced, and "this is a synthetic pool" disclaimers wherever results appear.

## Test strategy

- Engine: blinds/rotation, min-raise and all-in-below-min-raise rules, BB option, multi-way side pots with rigged decks, split pots, rake (cap + no-flop-no-drop), 50-hand chip-conservation fuzz.
- Evaluator: all categories, wheel, kickers, best-of-7, fast-path cross-validation over random samples.
- Simulation: seed reproducibility, divergence across seeds, turnover behavior, aggregate-vs-hand-sum consistency, cancellation, manual session flow.
- Player model: Wilson interval behavior, tendency computation sanity, policy legality/normalization, trained-vs-prior skew, serialization round-trip.
- Analytics: risk-of-ruin monotonicity and edge cases.

## Build order (executed)

types → RNG/deck/evaluator → engine (+tests) → equity fast path → agents → player model → table session/turnover → runner/manual session → aggregator → storage → tests (simulation/model) → UI (theme, table, calibrate, profile, experiments, results, replay, compare, opponents, settings, dashboard) → docs → build/lint/typecheck → git commit → package.

## Supabase incorporation plan (executed)

1. Audit the `DataStore` consumers and preserve their full-object contracts.
2. Add email/password authentication with cookie refresh for Next.js 15.
3. Add owner-scoped calibrations, experiments, and hand rows with foreign keys, indexes, grants, and RLS.
4. Select the Supabase adapter when configured; retain browser mode otherwise.
5. Page hand-history reads, batch writes, preserve non-finite analytics values, and allow an explicit local-to-cloud import.
6. Update Settings, docs, environment configuration, and regression tests, then run the complete validation suite.

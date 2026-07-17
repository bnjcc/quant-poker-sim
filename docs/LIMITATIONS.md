# Limitations & Roadmap

Stated plainly, because a simulation platform that hides its simplifications is worse than useless.

## What is simplified in this MVP

| Area | What ships | The honest gap | Production path |
|---|---|---|---|
| Persistence | Supabase Auth/Postgres with per-user RLS; browser fallback when unconfigured | Cloud writes still originate in the browser; a failed multi-batch hand upload can require retrying the run | Server-side jobs with transactional result finalization for very large runs |
| Batch execution | In-browser chunked runner, ~1.5–2k hands/sec, progress + cancel | Tab must stay open; single thread | Web Worker first, then a server-side job queue running the identical `runSimulation` |
| Opponents | 13 heuristic archetypes with realistic aggregate stats and per-instance jitter | Postflop play is simpler than strong humans; "adaptive" agent only tracks fold rates | Learned policies from hand-history corpora; richer opponent memory |
| User model | Bucketed frequency policy with shrinkage, sizing/timing imitation, opponent-timing reactions, confidence reporting | Buckets can't express card-specific nuance (blockers, combos), multi-street planning, or rich timing sequences | Finer bucketing with more data; sequence models once calibration samples are large |
| Equity | Monte Carlo estimates (fast bitmask evaluator, cross-validated) | Sampling noise (small, but present) in agent decisions and strength bucketing | Exact enumeration on turn/river; larger iteration budgets server-side |
| Statistics | Wilson CIs, bb/100 CI, significance flag, risk of ruin | Risk of ruin assumes stationary win rate/variance; per-hole-card samples are tiny | Bayesian shrinkage across the hand grid; block bootstrap for CI robustness |
| E2E tests | Vitest unit/integration suite (engine, pots, seeds, turnover, model, analytics) | Playwright smoke suite is **not included** in this repo | Add `@playwright/test` with a 3-flow smoke: calibrate 5 hands → build profile → run 200-hand experiment |
| Auth / multi-user | Supabase email/password accounts with cookie refresh and RLS | No password-reset UI, social login, teams, or sharing | Add recovery, OAuth, MFA, and explicit team-scoped policies as product needs emerge |

## Known modeling caveats

- **Small calibration samples produce prior-dominated models.** The UI warns below 100 hands and reports the average data-vs-prior confidence for every simulated run.
- **Timing tells are not ground truth.** The learned user model reproduces observed snap/tank reactions, while heuristic opponents receive only a small capped adjustment; neither should be read as a claim that a particular delay reliably means strength or weakness.
- **Manual-vs-simulated comparisons are directional only** — a 50-hand manual sample has a bb/100 interval hundreds of big blinds wide.
- **Rake sensitivity is real**: at low win rates the rake line dominates. That is a feature of the simulation, not a bug — duplicate an experiment and vary the rake to see it.
- Positive results here mean your learned style beats *this synthetic pool under these rules*. Treat it as a strategy-comparison instrument, not an earnings forecast.

## Roadmap (in order of leverage)

1. Web Worker execution + parallel sharded runs merged by the aggregator.
2. Server job queue for transactional, resumable 1M+ hand experiments.
3. Playwright smoke suite in CI.
4. Per-decision review: flag simulated spots where the model's chosen action had low confidence, and let the user correct them (active learning on the policy).
5. Opponent pools estimated from imported real hand histories.
6. Exact turn/river equity enumeration.

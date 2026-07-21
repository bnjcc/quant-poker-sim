# QuantPoker Project Context

> **Maintenance rule:** Update this file in the same session as every code, UI, test, configuration, schema, workflow, deployment, or documentation change. Record final behavior, affected files, validation, commit/deployment state, and new constraints. Do not wait to be asked.

Last updated: 2026-07-21

This is the concise handoff for maintainers and future Codex sessions. Read it before changing the repository, then consult [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/LIMITATIONS.md](docs/LIMITATIONS.md), and the relevant source.

## Current state

| Item | Value |
|---|---|
| Repository | `https://github.com/bnjcc/poker-sim` |
| Production URL | `https://poker-sim-iota.vercel.app` |
| Production/default branch | `agent/supabase-backend` |
| Local branch | `deploy/mobile-scroll-fix-20260719-030729` |
| Current local and remote HEAD | `b63cf05 Improve analytics and review actions` |
| Supabase project | `oxrqtwqkzkembnglhbtn` |
| Vercel project | `optvis/poker-sim` |
| Simulation version | `1.7.0` |
| Stack | Next.js 15.5.20, React 19.1, JavaScript/JSX, Tailwind CSS 4, Zod, Vitest, Supabase |

The local branch tracks `origin/agent/supabase-backend`; at the start of this documentation task they were synchronized.

### Current uncommitted work

The working tree contains two intentional groups of changes:

1. **Resumable calibration implementation** in both calibration flows, storage, settings, manual-session support, and tests. This work checkpoints after each completed hand and is not yet committed, pushed, deployed, or live-verified.
2. **Hackathon documentation refresh** in `README.md` and this file. The README now leads with the problem, demo flow, architecture, modeling details, evidence, limitations, and a transparent explanation of how Codex with GPT-5.6 supported development. This is documentation-only and is not yet committed or pushed.

Do not discard or overwrite the resumable-calibration changes when working on documentation or preparing a commit.

## Product in one paragraph

QuantPoker learns a statistical imitation of a player's No-Limit Hold'em behavior from manual calibration, then backtests it across seeded simulations against configurable heuristic opponent pools. It reports uncertainty-aware analytics and lets the user correct low-confidence simulated decisions before rerunning the same environment. It is a controlled strategy-comparison tool—not a GTO solver and not an earnings forecast.

## End-to-end workflow

1. **Calibrate** at `/range-calibrate` or `/calibrate` on a six- or nine-player table with 1/3 or 2/5 stakes.
2. **Profile** the strategy through smoothed tendency metrics, Wilson 95% intervals, timing data, sizing data, and a learned behavioral policy.
3. **Connect** at `/friends` and optionally publish one policy snapshot to the direct/two-hop social graph.
4. **Experiment** at `/experiments/new` with a seed, hand count, rake, stack, table, opponent mixture, and lifecycle controls.
5. **Analyze** aggregate win rate, confidence interval, volatility, drawdown, rake, action and matchup breakdowns, and stored hand histories.
6. **Review** low-confidence simulated decisions, convert corrections into high-weight training observations, and rerun the same seed.
7. **Compare** completed experiments side by side while treating differences inside the confidence intervals as noise.

## Architecture and invariants

Everything below `app/` is intended to remain pure JavaScript without DOM or Next.js coupling. Pages are thin clients over reusable libraries.

```text
app/ + components/       UI, calibration controls, charts, replay
        ↓
lib/simulation/          manual and batch sessions, table lifecycle
        ↓
lib/player-model/        learned user policy and review feedback
lib/agents/              fourteen heuristic opponent archetypes
        ↓
lib/poker/               engine, evaluator, equity, deck, seeded RNG
        ↓
lib/analytics/           bounded incremental aggregates
lib/storage/             browser/Supabase persistence contract
```

### Poker engine

`HandEngine` owns one hand: blind posting, dealing, betting rounds, burn cards, all-in runouts, side pots, rake, and settlement.

Preserve these tested rules:

- chip conservation: summed player net equals negative rake;
- a legal raise is at least the previous full raise increment;
- an incomplete all-in raise does not reopen raising;
- folded contributions remain in eligible pots;
- single-eligible overbet layers are refunded;
- odd split-pot chips go to the first eligible seat left of the button;
- heads-up button/small-blind and action-order rules remain correct.

The reference evaluator and allocation-free bitmask evaluator must stay cross-validated. Monte Carlo equity is explicitly an estimate.

### Reproducibility

One seeded Mulberry32 RNG drives the complete run: cards, equity samples, decisions, timing, turnover, and pool selection. Every history stores the RNG state before its deal. A `(seed, config, simulationVersion)` tuple must reproduce a run within a version. Any material engine, agent, or policy behavior change requires a simulation-version bump.

### Behavioral policy

The descriptive profile and generative policy are separate:

- `stats.js` produces smoothed HUD-style metrics and Wilson intervals for explanation only.
- `policy.js` models actions by street, position class, facing situation, strength quartile, and opponent-timing cue.

Policy inference blends bucket counts with a strength-aware prior using `n / (n + 8)`, falls back to broader contexts, redistributes illegal probability mass, and samples sizing/timing from empirical observations with priors. Serialized policy v3 adds exact position charts and remains compatible with v1/v2.

For range-first policies, explicit charts control first-in participation. They do not replace learned reactions when facing a raise. Every simulated decision must continue logging probabilities and confidence.

### Calibration

Calibration uses a fixed, full lineup and an information-directed controller that is not used by experiments. It increases useful coverage without forcing actions or pretending calibration profit is realistic.

The user receives a real 45-second clock. A timeout checks when free and folds otherwise. Opponent turns use a 500 ms visual preview while retaining their full seeded virtual time, capped separately at 15 seconds. Batch execution records virtual time without sleeping.

Starting hands use a shuffled, combo-weighted bag. Shared and position-specific 169-hand charts are supported. Stakes default to 1/3 with a 2/5 preset. Sizing remains chip-denominated with small-blind step controls, exact numeric entry, and an every-street 3× BB shortcut when legal.

### Resumable calibration — pending implementation

Both calibration methods now create a private draft before the first hand and checkpoint after every completed hand:

- browser mode stores the draft locally;
- cloud mode uses the existing RLS-protected `calibrations` table, with no migration;
- drafts restore table, stakes, target, decisions, bounded histories, per-hand user seats, and range configuration;
- the unfinished current hand is intentionally excluded;
- resumed sessions continue unique hand numbering;
- one draft per calibration method is exposed through the UI;
- drafts stay hidden from completed strategy lists, experiment setup, settings counts, dashboards, profiles, friends, leaderboards, and browser import;
- completion reuses the draft row and drains queued checkpoint writes before the final save.

Affected files: `app/(main)/calibrate/page.jsx`, `app/(main)/range-calibrate/page.jsx`, `app/(main)/settings/page.jsx`, `lib/simulation/manual.js`, `lib/storage/store.js`, `tests/simulation.test.js`, and `tests/storage.test.js`.

Fresh validation on 2026-07-21, after the documentation rewrite: 15 Vitest files / 104 tests passed, ESLint passed, and the production build succeeded across 19 routes.

### Table lifecycle and multiplayer

Normal experiments model geometric session length, stop-loss/stop-win departures, rebuy probability, random churn, weighted replacement profiles, and short-handed play. The user auto-rebuys. Calibration must not inherit this turnover behavior.

Multiplayer strategy testing supports:

- **Real users with bots:** owner plus at least one eligible real user; remaining seats use bots.
- **Players only:** at least three real users; the table is sized to the selected players and contains no bots.

Real-user policies keep stable seats, stacks, rebuy counts, logs, and independent incremental aggregators. Bots are excluded from the real-user leaderboard.

### Analytics

`Aggregator` performs O(1) work per hand and keeps bounded, stride-downsampled curves of roughly 2,000 points. It outputs bb/100, standard deviation, 95% interval, significance, drawdown, profit factor, showdown/non-showdown result, rake, and breakdowns by position, hand, stack depth, pot type, action, size, and opponent archetype.

Manual-versus-simulated results are directional only. Risk of ruin uses a stationary diffusion approximation and must keep its caveat visible.

### Simulated Hand Review

Review selects low-confidence decisions from separate stored hands across a run, reconstructs the state immediately before the action, and hides future cards. Range-first review omits known excluded first-in folds.

Confirmations/corrections become `RecordedDecision` entries with greater weight than ordinary calibration samples. Rebuilding always starts from the immutable base calibration plus persisted rounds. Corrections trigger the same seeded experiment; all-agree rounds can mark acceptance without rerunning. A cancelled rerun keeps a durable pending state.

## Persistence and security

All persistence must go through the shared store contract in `lib/storage/store.js`.

### Browser mode

`LocalStorageStore` is the zero-setup fallback, with an approximate 5 MB budget and a 3,000-hand cap per experiment. Existing browser data is never silently merged into cloud data. Import is explicit, insert-only, skips existing IDs, and retains the browser copy.

### Cloud mode

`SupabaseStore` is selected only when both public environment variables exist. Auth owns identity; RLS tied to `auth.uid()` is the authoritative private-data boundary. Never expose secret or service-role credentials through `NEXT_PUBLIC_*`.

Large nested domain data remains JSONB while query fields are normalized. Hand writes use a staged revision that becomes active only after all batches succeed. Calibration deletion preserves experiments by setting the reference to null. Experiment deletion cascades to hands and review data.

### Social sharing

Cloud accounts have unique lowercase usernames. Friendships are canonical unordered pairs managed through security-definer RPCs. Users explicitly publish at most one policy snapshot to direct friends and friends of friends. Raw decisions, private experiments, hand histories, and email remain private. Removing the supporting friendship removes access. Experiment participants are copied as point-in-time snapshots.

### Database migrations

- `20260717000000_initial_user_data.sql`: private calibrations, experiments, hands, RLS, and run finalization.
- `20260717010000_strategy_reviews.sql`: review rows, RLS, and atomic experiment/review commit.
- `20260718000000_social_multiplayer.sql`: profiles, friendships, published policies, social RPCs, and access rules.
- `20260719000000_strategy_leaderboard.sql`: authenticated aggregate leaderboard RPC.

The pgTAP file contains 28 schema, ownership, grant, isolation, cascade, and function assertions. It has been statically reviewed but has not been run in a local Supabase/Docker stack.

## Responsive UI constraints

- The fixed bottom tab bar is phone-only and explicitly hidden at 768 px and wider.
- Active calibration phases on phones below 768 px use a `100dvh` layout and hide the bottom tab so all legal controls remain visible.
- Desktop active calibration must stay vertically scrollable.
- Range selection must never receive the active-hand no-scroll lock.
- Phone seats use dedicated maps for two through nine players so opponents do not cover the board or pot.
- Opponent cards remain hidden unless that exact seat has `showedDown: true`; folded and uncontested cards never reveal.
- Starting-range selection must preserve accessible click/keyboard behavior and primary-pointer drag painting.
- Navigation must respect safe areas, lock background scrolling only while the drawer is open, and close on route change or Escape.

## Validation status

Most recent full validation, run on 2026-07-21 after this README/context rewrite:

- Vitest: 15 files / 104 tests passed.
- ESLint: passed.
- Next.js production build: passed across 19 routes.
- Direct mobile viewport check at 390×844: active calibration remained within the viewport and the bottom tab was hidden.

Database pgTAP and a repeatable browser E2E suite remain outstanding. After any implementation change run:

```bash
npm test
npm run lint
npm run build
```

## Deployment state

Vercel deploys production from `agent/supabase-backend`. Public Supabase variables are configured for Production and Preview. Hosted migrations through the social schema are recorded in remote history; the strategy leaderboard migration was applied through the SQL editor and remains checked in for reproducibility.

The production root redirects signed-out users to `/login`. Email confirmation is required. Exact live verification is still recommended for account creation, persistence across sign-out/sign-in, calibration draft resumption, experiment finalization, and review feedback.

Local provider links and public environment values live in ignored `.vercel/` and `.env.local` files.

## Source map

### Routes and UI

- `app/(main)/page.jsx` — dashboard, workflow entry, leaderboard, and recent experiments.
- `app/(main)/calibrate/page.jsx` — unrestricted timed calibration and draft checkpointing.
- `app/(main)/range-calibrate/page.jsx` — range charts, timed calibration, and draft checkpointing.
- `app/(main)/profile/page.jsx` — strategy selection, tendency confidence, timing, and sizing.
- `app/(main)/experiments/new/page.jsx` — experiment, pool, stake, and multiplayer configuration.
- `app/(main)/experiments/[id]/page.jsx` — run orchestration, analytics, hands, and review loop.
- `app/(main)/compare/page.jsx` — side-by-side completed-run comparison.
- `app/(main)/friends/page.jsx` — usernames, social graph, and strategy publishing.
- `app/(main)/settings/page.jsx` — storage summary, draft-aware counts, import, and deletion.
- `components/PokerTable.jsx` — responsive 2–9 seat layouts and card privacy.
- `components/StrategyReview.jsx` — reconstructed low-confidence decision review.
- `components/StartingHandGrid.jsx` — accessible 169-hand chart editor.
- `components/HandReplayer.jsx` — stored-history replay and timing labels.

### Core libraries

- `lib/poker/engine.js` — rules and settlement.
- `lib/poker/evaluator.js` — reference and bitmask evaluators.
- `lib/poker/equity.js` — seeded equity estimation.
- `lib/poker/rng.js` — checkpointable deterministic RNG.
- `lib/agents/profiles.js` / `agent.js` — fourteen archetypes and decisions.
- `lib/player-model/stats.js` — descriptive tendency statistics.
- `lib/player-model/policy.js` — v3 learned behavioral policy.
- `lib/player-model/review.js` — review selection and policy rebuilding.
- `lib/simulation/manual.js` — resumable manual calibration orchestration.
- `lib/simulation/table.js` — seats, lifecycle, participants, and contexts.
- `lib/simulation/runner.js` — chunked environment-independent batch runner.
- `lib/analytics/aggregate.js` — bounded incremental analytics.
- `lib/storage/store.js` — local/cloud store implementations and drafts.
- `lib/supabase/` — public clients, cookie-aware server access, and middleware.

### Tests and documentation

- `tests/` — engine, evaluator, timing, simulation, model, review, storage, UI helpers, and social logic.
- `supabase/tests/database/schema_and_rls.test.sql` — 28 pgTAP assertions.
- `README.md` — judge-facing product, demo, technical evidence, Codex usage, and setup.
- `docs/ARCHITECTURE.md` — implementation-level design.
- `docs/LIMITATIONS.md` — gap analysis and roadmap.
- `docs/PLAN.md` — original implementation plan and scope decisions.

## Do-not-regress checklist

- Keep RLS authoritative and service credentials off the client.
- Preserve explicit browser-only mode and never silently switch storage after a cloud error.
- Keep imports insert-only and hand revisions atomic with experiment finalization.
- Preserve versioned policy compatibility and optional timing fields for legacy data.
- Never sleep for virtual action timing during batch simulation.
- Keep heuristic timing tells weak and present them as noisy, not reliable strength signals.
- Keep range-first calibration as the default while retaining **All hands**.
- Keep drafts private, partial-hand-free, serialized, and absent from completed-data consumers.
- Keep calibration opponents measurement-oriented and experiment opponents lifecycle-oriented.
- Keep beginner explanations beside advanced statistical detail.
- Keep simulation conclusions scoped to the configured synthetic environment.

## Highest-leverage next work

1. Commit and deploy the resumable-calibration implementation after fresh test/lint/build validation.
2. Run pgTAP against a local Supabase stack and add a browser E2E smoke test.
3. Move execution to Web Workers with deterministic shard seeds and aggregate merging.
4. Add a durable job queue for resumable million-hand experiments.
5. Add production monitoring for auth, database, and abandoned hand-revision failures.
6. Replace or augment heuristic pools with distributions learned from real hand histories.

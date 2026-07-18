# QuantPoker Project Context

Last updated: 2026-07-18

This file is the handoff for future maintainers and LLM conversations. Read it before changing the project, then consult `README.md`, `docs/ARCHITECTURE.md`, and the relevant source files for implementation detail.

## Current repository state

- GitHub repository: `https://github.com/bnjcc/poker-sim`
- Active branch: `agent/strategy-review-calibration`
- Branch tracks: `origin/agent/strategy-review-calibration`
- Latest committed implementation: `e5e7d2f Simplify dashboard and accelerate range calibration`
- Previous calibration/UI commits: `92cd415 Refine calibration pacing and table visuals`, `91687fe Add timed calibration and analytics glossary`, then `a9200d2 Add range-first betting calibration`
- Supabase backend commit: `23935e6 Add Supabase user data backend`
- Original application commit: `b70bffa RangeBench: poker strategy simulation platform`
- The GitHub repository was empty when the Supabase branch was first pushed, so `agent/supabase-backend` became its first/default branch. There was no base branch for a pull request.
- Application commit `91687fe`, including the prior version of this context file, is pushed to the remote default branch. This handoff was refreshed afterward to document that commit accurately.
- Hosted Supabase project: `oxrqtwqkzkembnglhbtn` (`https://oxrqtwqkzkembnglhbtn.supabase.co`)
- Vercel project: `optvis/poker-sim`
- Production site: `https://poker-sim-iota.vercel.app`
- Local provider links and public environment values live in ignored `.vercel/` and `.env.local` files.

## Product summary

QuantPoker is a Next.js 15 application for modeling and backtesting a user's 6-max No-Limit Hold'em strategy.

The workflow is:

1. The user manually plays an online-paced calibration sample. Range-first calibration is the default path; unrestricted deals remain available as **All hands**.
2. The app records actions, sizing, response time, timeout behavior, and reactions to opponent timing, then trains a bucketed behavioral policy.
3. The user configures an experiment against a weighted pool of heuristic opponent profiles.
4. The browser runs a reproducible seeded simulation.
5. The app stores and displays aggregate analytics, decision confidence, and replayable hand histories.

The poker engine, evaluator, agents, player model, simulator, and analytics remain browser-executed TypeScript. Supabase provides user authentication and persistence; it does not run simulations.

## Main technology

- Next.js `15.5.20`, App Router, Turbopack
- React `19.1.0`
- TypeScript in strict mode
- Tailwind CSS 4
- Recharts
- Zod
- Vitest
- Supabase Auth and Postgres
- `@supabase/supabase-js` and `@supabase/ssr`

## Timing-aware calibration and simulation completed

The full-session and range-first calibration flows now behave like paced online poker tables.

### Manual calibration experience

- Every user decision has a 15-second action clock.
- A timeout checks when checking is legal and folds otherwise.
- Opponents have seeded virtual decision times, including snap decisions, normal decisions, occasional tanks, and rare timeouts.
- Manual calibration shows each opponent turn for a fixed 500ms preview without rendering a countdown for that preview. The full simulated decision time is still preserved and displayed beside the resulting action.
- Seat action labels show elapsed decision time and timeout state.
- The action panel identifies the most recent opponent action as `snap`, `normal`, or `tank`.
- Both calibration pages record the user's real elapsed response time from when an action becomes available.

### Timing data model

- `RecordedDecision` optionally stores `responseTimeMs` and `timedOut` for legacy-data compatibility.
- Voluntary engine actions optionally store `decisionTimeMs` and `timedOut`; forced blind posts remain untimed.
- `DecisionContext.lastOpponentAction` exposes the most recent timed voluntary action by another player on the current street.
- Hand histories therefore retain timing for in-browser replays, review, and future analysis.
- No database migration was required because calibrations, experiment payloads, and hand histories already persist as versioned JSON payloads.

### Learned timing policy

- Behavioral policy serialization is now version 2 and remains able to deserialize version 1 policies.
- Action buckets add an opponent-timing dimension: `none`, `snap`, `normal`, or `tank`.
- Timing-specific buckets fall back to the original untimed hierarchy when samples are sparse.
- Response-time samples are stored by chosen action and context, so simulated check/folds, calls, bets, and raises reproduce the user's observed pacing.
- Learned timeouts reproduce the legal automatic check/fold behavior.
- Batch experiments record virtual decision times but do not sleep, preserving high-speed simulation performance.
- Heuristic opponents use only a deliberately weak, skill-scaled timing read capped to a few equity points. Timing tells are treated as noisy signals, not ground truth.
- The initial timing work introduced simulation version `1.2.0`; pending experiments are always stamped with the current version when run.

### Timing analytics surfaced in the UI

- Strategy profiles show average/median decision time, snap-decision rate, timeout rate, and the count of decisions made after an opponent timing cue.
- Experiment results show simulated average decision time and timeout rate.
- Hand replays display action timing and timeouts.

## Calibration legality, Simulated Hand Review, and experiment history completed

The current working tree closes the calibration and post-run review gaps identified after the strategy-review feature landed.

### Legal, human-paced calibration opponents

- `HandEngine` remains the final poker-rules authority and rejects actions outside the acting seat's legal set.
- Short all-in raises make prior actors answer the extra chips but no longer reopen their raise option; a later full raise still reopens action correctly.
- `ContextTracker` now normalizes any stale bot or policy proposal into the current legal vocabulary before it reaches the engine. In particular, a passive `check` proposal becomes a `call` when a bet is being faced; a bot can never check behind a live bet.
- Calibration tables hide a seat's earlier action label while that seat is deciding again. This prevents an earlier check from appearing to be an illegal response to the user's later bet.
- Stored opponent timings center on multi-second human decisions, with a smaller set of genuine 0.7-1.2 second snaps, later-street/raised-pot complexity, tanks, and rare timeouts. These values are displayed after the fixed 500ms live preview rather than making the user wait for them.
- Batch simulations still record virtual timing without sleeping.

### Calibration presentation

- The poker-table felt defaults to red and derives its color from the selected interface theme.
- The user's hole cards render at the large card size in both calibration flows while opponent cards and other compact card displays remain unchanged.
- Opponent turns use a fixed 500ms live preview in both calibration pages, but the action clock renders only for the user's 15-second decision window. The seeded virtual timing is still stored on the action, shown beside the decision under the player's name, and used by the timing-aware model.

### Calibration entry and range-selection usability

- Dashboard calibration calls to action and the main navigation now present **Range-first calibration** as the primary/default path.
- Unrestricted calibration remains at `/calibrate` and is labeled **All hands** in the dashboard and navigation.
- Range shortcuts include **+ Aces**, which adds all 25 Ace-containing starting-hand classes including `AA`, and **+ Face cards**, which adds the nine J/Q/K-only pair, suited, and offsuit classes.
- The 169-hand grid supports primary-mouse drag painting. Starting on an unselected cell selects every visited cell; starting on a selected cell erases every visited cell.
- Each cell is applied at most once per drag. Ordinary single clicks, keyboard activation, ARIA pressed state, secondary mouse buttons, and touch horizontal scrolling retain their previous behavior.

### Dashboard and typography refinement

- The dashboard hero headline is now **Computerize Your Poker Playing.**
- The hero keeps its two queen-card motifs as transparent, accent-outline-only cards; the former white card fill, orbit rings, signal chips, metadata strip, grid texture, and unused animations were removed for a simpler presentation.
- Core calibration/profile calls to action, workflow cards, recent experiment data, and responsive behavior remain intact.
- The global interface font stack now prefers rounded system faces and uses `Trebuchet MS` as the dependable softer Windows fallback. Monospaced analytics and playing-card typography remain unchanged.

### In-browser Simulated Hand Review

- Every completed experiment presents an explicit **Simulated Hand Review** button instead of opening the review automatically.
- The survey replays eight decisions drawn from stored hands spread across the run, reveals no future board cards, and asks the tester either to confirm the simulated action or enter their own legal action and size.
- The bounded decision log is evenly sampled across the stored run rather than truncating the beginning, so long experiments remain broadly reviewable.
- Review answers are stored with experiment, seed, engine version, decision context, model probabilities/confidence, agreement, and correction details.
- Cloud feedback is normalized into `strategy_reviews`, protected by RLS, and available to the project owner for learning-model analysis. Browser fallback retains the same records locally.
- Corrections rebuild an experiment-specific policy from the immutable base calibration and all review rounds, then rerun the same seed. All-agree rounds are saved without an unnecessary rerun.
- User-facing JSON/CSV export buttons were removed; review and hand verification stay in the browser.

### Previous experiments

- `/experiments` is now labeled **Previous experiments**, includes completed, pending, and cancelled runs, handles load/delete failures visibly, and provides an explicit **View** action for each saved run.
- The dashboard links back to previous experiments, experiment details include a history link, and small screens now receive a scrollable navigation bar instead of losing navigation entirely.
- `SIMULATION_VERSION` is now `1.4.0` because bot timing changes can alter timing-conditioned decisions and therefore seeded results.

## Beginner analytics education completed

QuantPoker now explains its poker acronyms and advanced analytics without removing statistical depth.

- `/glossary` provides the full beginner-friendly poker and analytics glossary.
- The main navigation includes a **Stats glossary** link.
- Reusable expandable guides appear on strategy profiles, opponent profiles, experiment results, and experiment comparisons.
- Each glossary entry includes the acronym or term, full name, plain-English meaning, a concrete example, and an advanced interpretation.
- Covered topics include VPIP, PFR, 3-bet, c-bet, AF, SPR, bb/BB, table-position abbreviations, bb/100, 95% CI, standard deviation, drawdown, profit factor, risk of ruin, rake, statistical significance, Wilson intervals, priors, sample size, model confidence, and reproducible seeds.
- Important inline labels now expand unfamiliar terms, for example `PFR — preflop raise`, `C-bet — continuation bet`, `Volatility (std dev)`, and `SPR (stack/pot)`.
- The glossary explicitly teaches users to interpret a statistic together with its opportunity count, uncertainty interval, and strategic context.

## Supabase work completed

### Authentication

- Email/password sign-up and sign-in are implemented at `app/login/page.tsx`.
- Sign-out is available in `components/Nav.tsx`.
- `app/auth/confirm/route.ts` handles PKCE codes and email OTP confirmation links.
- `middleware.ts` and `lib/supabase/middleware.ts` refresh the cookie-backed session and redirect unauthenticated cloud-mode users to `/login`.
- This repository uses Next.js 15, so the entry point is `middleware.ts`, not the Next.js 16 `proxy.ts` convention.
- Authentication redirects pass through `lib/auth/redirect.ts`. The validator rejects absolute, scheme-relative, and backslash-based external redirect attempts.
- No service-role or Supabase secret key is used by browser code.

### Environment and mode selection

Cloud mode is enabled only when both variables are present:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

- The template is committed as `.env.example`.
- With both variables configured, the app requires authentication and uses `SupabaseStore`.
- With either variable absent, the app retains the original zero-setup `LocalStorageStore` behavior.
- Cloud failures never silently fall back to browser storage because that would fork the user's data.

### Database schema

The initial migration is:

`supabase/migrations/20260717000000_initial_user_data.sql`

The strategy-review follow-up migration is:

`supabase/migrations/20260717010000_strategy_reviews.sql`

It creates:

- `public.calibrations`
  - Text application ID
  - `user_id` ownership
  - Normalized name, timestamps, and hand count
  - Full calibration object in JSONB
- `public.experiments`
  - Text application ID
  - `user_id` ownership
  - Nullable calibration reference
  - Normalized status, timestamps, and active hand-set revision
  - Full experiment object in JSONB
- `public.experiment_hands`
  - Experiment and owner reference
  - Revision UUID (`hand_set_id`)
  - Hand number
  - Full hand history in JSONB

Important database behavior:

- Every exposed table has RLS enabled.
- Anonymous table access is revoked.
- Authenticated CRUD policies require `(select auth.uid()) = user_id`.
- Ownership columns used by RLS are indexed.
- Composite foreign keys prevent cross-user calibration and hand associations.
- Deleting an experiment cascades to all its hand revisions.
- Deleting a calibration retains experiment results and sets only `calibration_id` to null.
- `Experiment.calibrationId` is consequently typed as `string | null`.
- Updated timestamps are maintained by a trigger.
- `finalize_experiment_run` atomically commits the active hand revision, experiment status, and experiment payload.

### Storage adapter

All persistence remains behind `DataStore` in `lib/storage/store.ts`.

Implemented operations include:

- Calibration list/get/save/delete
- Experiment list/get/save/delete
- Hand-history save/get
- Atomic experiment-run finalization
- Storage summary
- Delete all active-mode data
- Explicit browser-to-cloud import

`SupabaseStore` behavior:

- Lists are ordered newest first to preserve existing UI assumptions.
- Large hand writes are uploaded in batches.
- Hand reads are paginated to stay below the Supabase API row limit.
- Experiment runs use revisioned hand sets.
- A new revision is staged without touching the active revision.
- The database finalizer locks the experiment row, atomically activates the new revision with its matching payload/status, and deletes only the previously active revision.
- Concurrent writers therefore resolve coherently as last-writer-wins.
- If the finalizer response is lost after the database commits, the client verifies `hand_set_id` and treats the matching revision as success.
- Ambiguous failures retain staged rows so a delayed server commit can never activate an empty revision.
- Inactive revisions left by rare failed requests are harmless operational litter. A future age-based garbage-collection job may remove them.

Data serialization uses `encodeStorageJson`/`decodeStorageJson` so `Infinity`, `-Infinity`, and `NaN` do not silently become JSON `null`. This matters for analytics such as infinite profit factor.

### Existing browser data

Settings includes an explicit browser-data import when cloud mode is active.

- Import is insert-only.
- Existing cloud IDs are skipped and never overwritten.
- Calibrations are imported before experiments.
- Hands and matching experiment metadata are finalized together.
- A failed new experiment import is removed so retrying remains possible.
- The browser copy remains as a backup.
- A per-user migration marker is written locally after a successful import.

## Security and correctness review

The implementation was reviewed by a separate agent and iterated until no blocking issue remained.

Issues found and fixed during review:

- Post-auth open redirect through backslash URL normalization.
- Destructive delete-before-upload hand replacement.
- Stale browser imports overwriting newer cloud data.
- Concurrent writers deleting each other's active revisions.
- Lost RPC responses causing deletion of a revision that may already be active.
- Error rollback paths overwriting another writer's finalized experiment payload.

The resulting persistent run state changes only through the row-locked database finalizer.

## Validation status

Validation on source commit `e5e7d2f` passed:

- TypeScript: clean (`tsc --noEmit`)
- ESLint: clean
- Vitest: 8 test files, 63 tests passed
- Next.js production build: passed
- `git diff --check`: clean apart from expected Windows LF/CRLF notices
- Secret scan: no Supabase secret/service key or private key was committed
- Browser smoke check: default felt rendered red, switching to blue changed the felt, the user's two cards rendered at the larger calibration size, and opponent action labels retained their simulated times after the 500ms preview.

New application tests include:

- `tests/storage.test.ts`
  - Non-finite JSON values round-trip correctly
  - Normalized database fields override stale JSON payload metadata
  - Calibration deletion maps to a nullable experiment reference
- `tests/redirect.test.ts`
  - Local redirect paths are retained
  - Absolute, scheme-relative, backslash, and JavaScript redirect attempts are rejected
- `tests/timing.test.ts`
  - Snap, normal, and tank classification plus legal timeout defaults
  - Timing propagation from actions into subsequent opponent contexts
  - Fixed 500ms live opponent previews preserve the full simulated decision time on applied actions
  - Learned user reactions differ after snap and tank timing cues
  - Behavioral policy v1 deserialization remains compatible with the v2 timing model
  - High-speed simulations record bounded virtual action timing without waiting
- `tests/review.test.ts`
  - Review candidates are spread across stored hands and exclude missing histories
  - Bounded decision logs retain coverage from the start through the end of a run
  - Corrections measurably move the experiment-specific learned policy

Database security tests are committed at:

`supabase/tests/database/schema_and_rls.test.sql`

The pgTAP file contains 28 assertions covering all four tables, RLS, grants, ownership defaults, user isolation, cross-owner rejection, calibration `SET NULL`, experiment/review cascades, and review feedback behavior. It was statically reviewed but has not yet been run in a local Supabase/Docker stack. The earlier detailed remote verification confirmed the three initial tables, 12 initial policies, and the original finalizer function; Supabase CLI migration history now also confirms the strategy-review migration is applied.

## Hosted deployment status

The production backend and deployment are connected:

- The repository is linked to Supabase project `oxrqtwqkzkembnglhbtn`.
- Migrations `20260717000000_initial_user_data.sql` and `20260717010000_strategy_reviews.sql` are both recorded in remote migration history and applied. A follow-up `supabase db push` reports the remote database is up to date.
- The earlier detailed remote verification found the 3 initial application tables, 3 RLS-enabled tables, 12 policies, and `finalize_experiment_run`; the applied follow-up migration adds `strategy_reviews` and `save_experiment_strategy_review`.
- Supabase Auth Site URL is `https://poker-sim-iota.vercel.app`.
- Local, production, stable Vercel alias, and `*-optvis.vercel.app` preview confirmation URLs are allowed.
- Email signup is enabled and email confirmation is required.
- The original TOTP enrollment/verification and 8-digit, one-minute email OTP settings were preserved.
- Vercel `optvis/poker-sim` has both public Supabase variables in Production and Preview.
- Production deployment `dpl_2oWgVatr8KYLx1XwQbAJWtUfQx9v` is Ready and aliased to `https://poker-sim-iota.vercel.app`.
- The production root redirects signed-out visitors to `/login`; `/login` returns HTTP 200.
- Source commit `e5e7d2f` is pushed to `origin/agent/strategy-review-calibration` and published to the production Vercel deployment. It includes range-first defaults, **All hands**, hidden opponent-preview clocks, larger user cards, additive range shortcuts, drag painting, rounded typography, and the simplified dashboard hero.

Remaining external verification:

1. Create the first real account and confirm its email.
2. Save a calibration/experiment/review and verify persistence after sign-out/sign-in.
3. Run the committed pgTAP suite in a local Supabase/Docker stack.

Never expose a Supabase secret or service-role key through `NEXT_PUBLIC_*`.

## Important source map

- `app/page.tsx` — dashboard hero, default calibration entry, workflow, and recent experiment summary
- `app/calibrate/page.tsx` — creates and saves calibration datasets
- `app/range-calibrate/page.tsx` — explicit 169-hand range selection plus timed betting calibration
- `app/glossary/page.tsx` — full beginner-friendly poker and advanced analytics glossary
- `app/experiments/new/page.tsx` — creates experiments
- `app/experiments/[id]/page.tsx` — runs simulations and atomically finalizes results/hands
- `app/experiments/page.tsx` — previous-experiment history and saved-run entry points
- `app/accuracy/page.tsx` — in-browser review-feedback summary
- `app/settings/page.tsx` — active storage summary, delete operations, browser import
- `app/login/page.tsx` — sign-in/sign-up UI
- `app/auth/confirm/route.ts` — authentication callback
- `components/Nav.tsx` — navigation, storage/account indicator, glossary link, and sign-out
- `components/ActionClock.tsx` — reusable online-style decision countdown
- `components/PokerTable.tsx` — shared table layout, seat/action display, and calibration-specific user card sizing
- `components/StartingHandGrid.tsx` — accessible 169-hand grid with single-click and primary-mouse drag painting
- `components/AnalyticsGlossary.tsx` — reusable glossary data, expandable contextual guides, and full glossary renderer
- `components/HandReplayer.tsx` — hand replay including voluntary-action timing and timeout labels
- `components/StrategyReview.tsx` — in-browser simulated-decision survey over stored hands
- `lib/simulation/timing.ts` — action clock constants, timing buckets, formatting, timeout defaults, and fallback timing samples
- `lib/simulation/manual.ts` — manual calibration loop with real user timing and paced opponents
- `lib/simulation/table.ts` — virtual timing propagation, timing-aware decision contexts, and user decision logs
- `lib/player-model/policy.ts` — v2 timing-aware behavioral policy with v1 compatibility
- `lib/player-model/review.ts` — review sampling, answer conversion, feedback weighting, and calibrated-policy rebuilding
- `lib/agents/agent.ts` — heuristic decisions, virtual pacing, and deliberately weak timing reads
- `lib/poker/engine.ts` — optional timing metadata on voluntary actions
- `lib/storage/store.ts` — local and Supabase storage implementations
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — cookie-aware server client
- `lib/supabase/middleware.ts` — session refresh and route protection
- `lib/supabase/config.ts` — environment detection
- `lib/auth/redirect.ts` — safe internal redirect validation
- `types/database.ts` — database client types
- `types/decision.ts` — decision context, opponent timing cue, user response timing, and timeout fields
- `types/experiment.ts` — domain types, nullable calibration reference, timing-aware logs, and simulation version
- `types/poker.ts` — poker domain models including optional action timing metadata
- `supabase/migrations/20260717000000_initial_user_data.sql` — schema, RLS, triggers, finalizer
- `supabase/migrations/20260717010000_strategy_reviews.sql` — normalized review feedback, RLS, and atomic experiment/review save function
- `supabase/tests/database/schema_and_rls.test.sql` — pgTAP database tests
- `tests/timing.test.ts` — timing classification, propagation, learning, compatibility, and batch-run coverage
- `tests/review.test.ts` — run-spanning review sampling, feedback accuracy, and policy recalibration coverage
- `README.md` — operator setup
- `docs/ARCHITECTURE.md` — system design
- `docs/PLAN.md` — original build and executed Supabase plan
- `docs/LIMITATIONS.md` — honest gaps and roadmap

## Existing limitations and sensible next work

The most useful follow-ups are:

1. Run the pgTAP suite and add a production end-to-end account/persistence smoke test.
2. Add an end-to-end browser smoke test for sign-up/sign-in, calibration save, experiment finalization, reload, and cross-user isolation.
3. Add password recovery, OAuth, MFA, or account deletion only if product requirements call for them.
4. Add an age-based cleanup function/job for inactive staged hand revisions.
5. Move long simulations to a Web Worker, then eventually a server job queue for resumable very large runs.
6. Add production monitoring for auth failures, database errors, and abandoned simulation uploads.
7. Add browser-level tests for the visible action-clock countdown, timeout auto-action, paced opponent transitions, and glossary disclosure controls.

Do not regress these design constraints:

- Keep RLS as the authoritative data boundary.
- Never expose service credentials to the client.
- Do not silently switch storage modes after a cloud error.
- Do not overwrite existing cloud data during browser import.
- Do not activate a hand revision separately from its matching experiment payload/status.
- Preserve the browser-only fallback unless the product explicitly drops zero-setup mode.
- Keep timing fields optional when reading legacy calibrations and hand histories.
- Keep high-speed simulations virtual-time only; never make batch execution sleep for recorded action delays.
- Keep the opponent preview clock hidden; the visible action clock is for the user's decisions only. Preserve the 500ms preview and stored full opponent timing.
- Keep range-first calibration as the default entry while retaining unrestricted calibration as **All hands**.
- Preserve both drag-paint selection/erasing and accessible single-cell click/keyboard operation in the starting-hand grid.
- Treat heuristic timing tells as weak/noisy and do not present them as reliable indicators of hand strength.
- Preserve beginner explanations alongside advanced metrics rather than hiding or removing the statistical detail.

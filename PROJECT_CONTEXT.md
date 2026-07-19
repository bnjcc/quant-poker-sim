# QuantPoker Project Context

Last updated: 2026-07-18

This file is the handoff for future maintainers and LLM conversations. Read it before changing the project, then consult `README.md`, `docs/ARCHITECTURE.md`, and the relevant source files for implementation detail.

## Current repository state

- GitHub repository: `https://github.com/bnjcc/poker-sim`
- Active branch: `agent/strategy-review-calibration`
- Branch tracks: `origin/agent/strategy-review-calibration`
- Latest implementation: `7a8c247 Convert application to JavaScript`
- Latest pre-migration feature implementation: `10e698c Improve calibration controls and full-ring review`
- Main beginner-analytics/calibration release: `2511582 Make analytics and calibration more approachable`
- Previous workflow release: `a55a741 Improve calibration, reviews, and strategy profiles`
- Earlier calibration/UI commits: `e5e7d2f Simplify dashboard and accelerate range calibration`, `92cd415 Refine calibration pacing and table visuals`, `91687fe Add timed calibration and analytics glossary`, then `a9200d2 Add range-first betting calibration`
- Supabase backend commit: `23935e6 Add Supabase user data backend`
- Original application commit: `b70bffa RangeBench: poker strategy simulation platform`
- The GitHub repository was empty when the Supabase branch was first pushed, so `agent/supabase-backend` became its first/default branch. There was no base branch for a pull request.
- `origin/agent/strategy-review-calibration`, the remote default/production branch `origin/agent/supabase-backend`, and `origin/HEAD` all point to JavaScript migration commit `7a8c247` before this documentation-only update.
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

The poker engine, evaluator, agents, player model, simulator, and analytics remain browser-executed JavaScript. Supabase provides user authentication and persistence; it does not run simulations.

## Main technology

- Next.js `15.5.20`, App Router, Turbopack
- React `19.1.0`
- JavaScript and JSX
- Tailwind CSS 4
- Recharts
- Zod
- Vitest
- Supabase Auth and Postgres
- `@supabase/supabase-js` and `@supabase/ssr`

## JavaScript migration completed

- All application routes, components, libraries, middleware, configuration, and tests now use `.js` or `.jsx` files.
- The migration removed compile-time annotations while preserving the same runtime expressions, component tree, styling, routes, storage behavior, seeded simulation behavior, and test coverage.
- `jsconfig.json` retains the existing `@/*` import alias without enabling JavaScript type checking.
- TypeScript-only dependencies, generated declarations, compile-only domain files, and the TypeScript check script were removed.
- Post-migration validation passes all 72 Vitest tests, ESLint, and the full Next.js production build across every existing route.
- A repository scan confirms no `.ts`, `.tsx`, or `.d.ts` source files remain.
- Migration commit `7a8c247` is pushed to both the working branch and the default production branch connected to Vercel.
- No CSS or visual assets changed during the migration; the JSX component structure, class names, routes, and runtime logic were preserved.

## Usernames, friends, and multiplayer strategy testing

- Cloud accounts have unique lowercase `@usernames`; sign-up checks availability, existing accounts receive a deterministic fallback, and usernames can be changed from `/friends`.
- Accepted friendships are mutual. Multiplayer discovery includes direct friends and friends of friends, so participants in one experiment do not need to be friends with one another.
- Users explicitly publish one saved learned policy for their two-hop network. Raw calibration decisions, private experiment history, and account email remain unshared.
- **Real users with bots** requires at least two real users total (the creator plus one eligible player) and fills the remaining configured seats with heuristic bots.
- **Players only** requires at least three real users total (the creator plus two eligible players), sizes the table to those users, and seats no bots.
- Every real-user policy keeps a fixed seat, stack, rebuy count, decision log, and incremental analytics during a run.
- Completed multiplayer experiments rank the real users by normalized win rate and compare total big blinds, hands won, and maximum drawdown. Bots are explicitly excluded from the leaderboard.
- `supabase/migrations/20260718000000_social_multiplayer.sql` adds profiles, canonical friend connections, opt-in strategy snapshots, two-hop access checks, social RPCs, triggers, grants, and RLS.
- Simulation version `1.6.0` covers the multiplayer seat/aggregation behavior.

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
- Both calibration flows expose **Check / Fold rest of hand**. The initial intentional action retains the user's real response time; later actions check when free or fold to a wager automatically and omit timing so they do not create an artificial 0ms timing tell. The mode resets after the hand.

### Calibration entry and range-selection usability

- Dashboard calibration calls to action and the main navigation now present **Range-first calibration** as the primary/default path.
- Unrestricted calibration remains at `/calibrate`, but it is reached through the **Calibrate all hands** button inside range-first calibration instead of occupying dashboard or navigation space.
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
- Before the survey starts, the user chooses how many eligible hands to review, from one through the available candidate count. Decisions remain spread across stored hands, reveal no future board cards, and ask the tester either to confirm the simulated action or enter their own legal action and size.
- Range-first surveys exclude every decision from a dealt hand outside the active explicit starting range, including later-street decisions reached after a free big-blind check.
- The bounded decision log is evenly sampled across the stored run rather than truncating the beginning, so long experiments remain broadly reviewable.
- Review answers are stored with experiment, seed, engine version, decision context, model probabilities/confidence, agreement, and correction details.
- Cloud feedback is normalized into `strategy_reviews`, protected by RLS, and available to the project owner for learning-model analysis. Browser fallback retains the same records locally.
- Corrections rebuild an experiment-specific policy from the immutable base calibration and all review rounds, then rerun the same seed. All-agree rounds are saved without an unnecessary rerun.
- User-facing JSON/CSV export buttons were removed; review and hand verification stay in the browser.

### Multiple saved strategies per user

- A calibration dataset is a saved strategy, and one local or cloud account can retain any number of them under distinct IDs.
- The strategy profile always shows the saved-strategy selector, supports renaming, and offers an explicit **Add strategy** action.
- **Use in an experiment** carries the selected strategy ID into experiment creation instead of silently falling back to the newest strategy.
- New experiments retain the strategy association plus point-in-time name/method snapshots. Previous experiments and experiment details show the associated strategy even if its source calibration is later deleted.
- Settings lists saved strategies separately and warns how many experiments will lose rerun capability before a strategy is deleted.

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

## Beginner-first results, expanded reviews, and calibration feedback completed

- User-facing normalized win-rate analytics now display as percentages instead of `bb/100`. The underlying aggregate field and math remain unchanged for storage and backwards compatibility.
- Experiment results reveal complexity progressively: a plain-English outcome and four basic result cards appear first; bankroll curves, result sources, and strategic breakdowns follow; confidence ranges, volatility, drawdown, profit factor, model confidence, timing, and bankroll-risk calculations sit in a clearly labeled advanced section farther down.
- Dashboard, experiment history, comparison tables, chart tooltips, starting-hand heatmaps, manual comparisons, and the glossary use the same percentage presentation.
- Strategy profiles show their simple overview before the glossary and detailed statistical interpretation.
- Simulated Hand Review makes review lengths above eight discoverable with 8, 16, 25, 50, and all-available shortcuts while retaining an exact custom count.
- An accepted all-agree review no longer closes the workflow permanently; the results page keeps a **Review more simulated hands** action for another round over the stored run.
- A corrected review bet or raise automatically starts at the calibration flow's legal two-thirds-pot suggestion. Review corrections also expose the same sizing slider and 50%, 66%, pot, and all-in shortcuts.
- Both all-hands and range-first calibration synthesize lightweight card-deal and decision sounds without external media files. Sounds default on after a user gesture, persist their mute state locally, and have an in-session toggle.
- Calibration hole cards and newly revealed board cards turn into view with staggered card animation. Reduced-motion preferences continue to collapse animation duration globally.

## Supabase work completed

### Authentication

- Email/password sign-up and sign-in are implemented at `app/login/page.jsx`.
- Sign-out is available in `components/Nav.jsx`.
- `app/auth/confirm/route.js` handles PKCE codes and email OTP confirmation links.
- `middleware.js` and `lib/supabase/middleware.js` refresh the cookie-backed session and redirect unauthenticated cloud-mode users to `/login`.
- This repository uses Next.js 15, so the entry point is `middleware.js`, not the Next.js 16 `proxy.js` convention.
- Authentication redirects pass through `lib/auth/redirect.js`. The validator rejects absolute, scheme-relative, and backslash-based external redirect attempts.
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

All persistence remains behind the shared data-store contract in `lib/storage/store.js`.

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

Validation on deployed JavaScript migration commit `7a8c247` passed:

- Pre-migration baseline TypeScript check: clean (`tsc --noEmit`)
- ESLint: clean
- Vitest: 10 test files, 72 tests passed
- Next.js production build: passed for all existing application routes and middleware
- JavaScript migration scan: no `.ts`, `.tsx`, or `.d.ts` source files remain
- `git diff --check`: clean apart from expected Windows LF/CRLF notices
- Secret scan: no Supabase secret/service key or private key was committed
- Browser smoke check: range-first selection loaded in browser-storage mode; starting a selected-hand calibration showed the red felt, large user cards, sound toggle, animated card classes, legal action panel, and 15-second decision clock.
- Production verification after the JavaScript production-branch push: `/login` returned HTTP 200 from Vercel. Earlier live verification also confirmed the stylesheet contained `card-turn-in`/`cardTurnIn`, the calibration bundle contained the persisted audio-preference key, and the final experiment bundle contained **Review more simulated hands**.

New application tests include:

- `tests/storage.test.js`
  - Non-finite JSON values round-trip correctly
  - Normalized database fields override stale JSON payload metadata
  - Calibration deletion maps to a nullable experiment reference
- `tests/redirect.test.js`
  - Local redirect paths are retained
  - Absolute, scheme-relative, backslash, and JavaScript redirect attempts are rejected
- `tests/timing.test.js`
  - Snap, normal, and tank classification plus legal timeout defaults
  - Timing propagation from actions into subsequent opponent contexts
  - Fixed 500ms live opponent previews preserve the full simulated decision time on applied actions
  - Learned user reactions differ after snap and tank timing cues
  - Behavioral policy v1 deserialization remains compatible with the v2 timing model
  - High-speed simulations record bounded virtual action timing without waiting
  - Per-hand Check/Fold records an intentional first action, omits artificial timing on automatic follow-ups, and resets for the next hand
- `tests/review.test.js`
  - Review candidates are spread across stored hands and exclude missing histories
  - User-selected review counts are honored and safely bounded
  - Range-first review excludes the entire dealt hand when its starting class is outside the explicit range
  - Bounded decision logs retain coverage from the start through the end of a run
  - Corrections measurably move the experiment-specific learned policy

Database security tests are committed at:

`supabase/tests/database/schema_and_rls.test.sql`

The pgTAP file contains 28 assertions covering all four tables, RLS, grants, ownership defaults, user isolation, cross-owner rejection, calibration `SET NULL`, experiment/review cascades, and review feedback behavior. It was statically reviewed but has not yet been run in a local Supabase/Docker stack. The earlier detailed remote verification confirmed the three initial tables, 12 initial policies, and the original finalizer function; Supabase CLI migration history now also confirms the strategy-review migration is applied.

## Hosted deployment status

The production backend and deployment are connected:

- The repository is linked to Supabase project `oxrqtwqkzkembnglhbtn`.
- Migrations `20260717000000_initial_user_data.sql`, `20260717010000_strategy_reviews.sql`, and `20260718000000_social_multiplayer.sql` are recorded in remote migration history and applied. The multiplayer migration was pushed and verified against the linked project on 2026-07-18.
- The earlier detailed remote verification found the 3 initial application tables, 3 RLS-enabled tables, 12 policies, and `finalize_experiment_run`; the applied follow-up migration adds `strategy_reviews` and `save_experiment_strategy_review`.
- Supabase Auth Site URL is `https://poker-sim-iota.vercel.app`.
- Local, production, stable Vercel alias, and `*-optvis.vercel.app` preview confirmation URLs are allowed.
- Email signup is enabled and email confirmation is required.
- The original TOTP enrollment/verification and 8-digit, one-minute email OTP settings were preserved.
- Vercel `optvis/poker-sim` has both public Supabase variables in Production and Preview.
- The production deployment is aliased to `https://poker-sim-iota.vercel.app`.
- The production root redirects signed-out visitors to `/login`; `/login` returned HTTP 200 after the JavaScript migration was pushed to the production branch.
- JavaScript migration commit `7a8c247` is pushed to both `origin/agent/strategy-review-calibration` and the default production branch `origin/agent/supabase-backend`.
- Production serves the beginner-first percentage analytics, expandable review counts, repeatable post-acceptance reviews, calibration-style correction sizing, calibration sounds, and card-turn animation. Exact live asset fingerprints were checked after the final branch push.

Remaining external verification:

1. Create the first real account and confirm its email.
2. Save a calibration/experiment/review and verify persistence after sign-out/sign-in.
3. Run the committed pgTAP suite in a local Supabase/Docker stack.

Never expose a Supabase secret or service-role key through `NEXT_PUBLIC_*`.

## Important source map

- `app/page.jsx` — dashboard hero, default calibration entry, workflow, and recent experiment summary
- `app/calibrate/page.jsx` — creates and saves calibration datasets
- `app/range-calibrate/page.jsx` — explicit 169-hand range selection plus timed betting calibration
- `app/glossary/page.jsx` — full beginner-friendly poker and advanced analytics glossary
- `app/experiments/new/page.jsx` — creates experiments
- `app/experiments/[id]/page.jsx` — runs simulations and atomically finalizes results/hands
- `app/experiments/page.jsx` — previous-experiment history and saved-run entry points
- `app/accuracy/page.jsx` — in-browser review-feedback summary
- `app/settings/page.jsx` — active storage summary, delete operations, browser import
- `app/login/page.jsx` — sign-in/sign-up UI
- `app/auth/confirm/route.js` — authentication callback
- `components/Nav.jsx` — navigation, storage/account indicator, glossary link, and sign-out
- `components/ActionClock.jsx` — reusable online-style decision countdown
- `components/PokerTable.jsx` — shared table layout, seat/action display, and calibration-specific user card sizing
- `components/StartingHandGrid.jsx` — accessible 169-hand grid with single-click and primary-mouse drag painting
- `lib/audio/poker-sounds.js` — browser-safe synthesized deal/action audio plus persisted calibration sound preference
- `components/AnalyticsGlossary.jsx` — reusable glossary data, expandable contextual guides, and full glossary renderer
- `components/HandReplayer.jsx` — hand replay including voluntary-action timing and timeout labels
- `components/StrategyReview.jsx` — in-browser simulated-decision survey over stored hands
- `lib/simulation/timing.js` — action clock constants, timing buckets, formatting, timeout defaults, and fallback timing samples
- `lib/simulation/manual.js` — manual calibration loop with real user timing and paced opponents
- `lib/simulation/table.js` — virtual timing propagation, timing-aware decision contexts, and user decision logs
- `lib/player-model/policy.js` — v2 timing-aware behavioral policy with v1 compatibility
- `lib/player-model/review.js` — review sampling, answer conversion, feedback weighting, and calibrated-policy rebuilding
- `lib/agents/agent.js` — heuristic decisions, virtual pacing, and deliberately weak timing reads
- `lib/poker/engine.js` — optional timing metadata on voluntary actions
- `lib/storage/store.js` — local and Supabase storage implementations
- `lib/supabase/client.js` — browser client
- `lib/supabase/server.js` — cookie-aware server client
- `lib/supabase/middleware.js` — session refresh and route protection
- `lib/supabase/config.js` — environment detection
- `lib/auth/redirect.js` — safe internal redirect validation
- `types/experiment.js` — runtime validation schemas and simulation version
- `types/poker.js` — shared poker constants
- `supabase/migrations/20260717000000_initial_user_data.sql` — schema, RLS, triggers, finalizer
- `supabase/migrations/20260717010000_strategy_reviews.sql` — normalized review feedback, RLS, and atomic experiment/review save function
- `supabase/tests/database/schema_and_rls.test.sql` — pgTAP database tests
- `tests/timing.test.js` — timing classification, propagation, learning, compatibility, and batch-run coverage
- `tests/review.test.js` — run-spanning review sampling, feedback accuracy, and policy recalibration coverage
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

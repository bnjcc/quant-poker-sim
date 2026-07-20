# QuantPoker Project Context

> **Required maintenance rule:** Update this file after every project change. A code, UI, test, configuration, schema, workflow, deployment, or documentation task is not complete until `PROJECT_CONTEXT.md` records the final behavior, affected source files, validation results, commit/deployment state when known, and any new constraints. Future maintainers and LLM conversations must apply this update automatically in the same working session without waiting to be asked.

Last updated: 2026-07-19

This file is the handoff for future maintainers and LLM conversations. Read it before changing the project, then consult `README.md`, `docs/ARCHITECTURE.md`, and the relevant source files for implementation detail.

## Current repository state

- GitHub repository: `https://github.com/bnjcc/poker-sim`
- Main live/production branch: `agent/supabase-backend` (`origin/agent/supabase-backend`). Vercel production deploys from this branch, and `origin/HEAD` points to it.
- Active branch: `deploy/mobile-scroll-fix-20260719-030729`
- Branch tracks: `origin/agent/supabase-backend`
- Latest committed production implementation: `de2035f Restore desktop calibration scrolling`
- Current uncommitted working tree: calibration opponents now keep their hole cards hidden unless that exact seat's engine result has `showedDown: true`. At showdown, compact opponent seats render both cards with the existing card-turn animation; folded players and winners of uncontested pots remain hidden. The behavior is implemented in both calibration flows and covered by rendering/privacy tests. These changes have not been committed, pushed, or deployed.
- Previous information-rich calibration and one-chip sizing implementation: `cb88e15 Improve calibration learning and chip sizing controls`
- Previous opponent-type analytics implementation: `ae95054 Add opponent-type strategy analytics`
- Previous calibration viewport-stability implementation: `ae4c1ab Keep mobile calibration controls in view`
- Previous mobile poker-table implementation: `6efeda4 Fix mobile poker table visibility`
- Initial phone-layout implementation: `2f1d327 Optimize phone viewing`
- Latest pre-migration feature implementation: `10e698c Improve calibration controls and full-ring review`
- Main beginner-analytics/calibration release: `2511582 Make analytics and calibration more approachable`
- Previous workflow release: `a55a741 Improve calibration, reviews, and strategy profiles`
- Earlier calibration/UI commits: `e5e7d2f Simplify dashboard and accelerate range calibration`, `92cd415 Refine calibration pacing and table visuals`, `91687fe Add timed calibration and analytics glossary`, then `a9200d2 Add range-first betting calibration`
- Supabase backend commit: `23935e6 Add Supabase user data backend`
- Original application commit: `b70bffa RangeBench: poker strategy simulation platform`
- The GitHub repository was empty when the Supabase branch was first pushed, so `agent/supabase-backend` became its first/default branch. There was no base branch for a pull request.
- `origin/agent/strategy-review-calibration` points to `6efeda4`. The remote default/production branch `origin/agent/supabase-backend` and `origin/HEAD` point to `de2035f`, which restores desktop active-calibration scrolling on top of range-selection scrolling, desktop navigation suppression, completed-hand navigation fixes, the persistent 3× BB shortcut, compact mobile calibration table, 45-second user clock, calibration stakes/table-size selection, PokerStars-style sizing, selective-aggressor, opponent-type analytics, calibration viewport-stability, and mobile poker-table work.
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

## Position-specific ranges and strategy leaderboard

- Range-first calibration now offers **Same at every position** and **Set by position** modes. Positional mode stores independent UTG, UTG+1, MP, LJ, HJ, CO, BTN, SB, and BB charts, shows combination coverage for each, and can copy one chart to every seat as a starting point.
- Manual calibration deals a starting hand from the chart matching the user's actual position for that hand. Behavioral-policy serialization is version 3 and applies the matching position chart to first-in decisions while retaining the shared chart as a compatibility fallback.
- Strategy review filtering and corrections retain the position-specific charts, and the strategy profile displays each chart separately.
- The dashboard shows the top three strategies. Browser mode ranks local completed runs; cloud mode calls the authenticated `get_strategy_leaderboard` database function, which returns only rank, username, strategy name, hand-weighted win rate, experiment count, and total hands. Private experiments and hand histories remain protected by RLS.
- `supabase/migrations/20260719000000_strategy_leaderboard.sql` adds the read-only leaderboard function. It was applied to hosted Supabase through the SQL editor on 2026-07-19.
- `SIMULATION_VERSION` is `1.7.0` because position-specific range selection can change seeded decisions.

## Phone-first interface and mobile calibration stability

The application now has a dedicated phone experience instead of relying on compressed desktop layouts.

### Mobile navigation and shared layout

- The former horizontally scrolling mobile navigation was replaced with a compact sticky top bar, a five-item bottom tab bar for the most common destinations, and a full grouped navigation drawer for secondary pages. The bottom tab bar is explicitly phone-only: it is suppressed at 768px and wider so the component's custom grid display cannot override the desktop hide utility.
- The drawer locks background scrolling while open, closes after route changes or Escape, retains active-route indicators, and includes cloud sign-out when available.
- Top and bottom navigation account for device safe areas. Main content reserves bottom space so the fixed tab bar never covers page actions.
- Phone buttons use larger touch targets, form controls use a 16px input size to prevent unwanted mobile zoom, page headers and hero actions stack vertically, and dense two-column forms collapse where needed.

### Mobile data and workflow views

- Previous experiments and model-accuracy history render as readable cards on phones while retaining their desktop tables at larger widths.
- The comparison table remains horizontally explorable on phones and keeps the metric column sticky while scrolling.
- Charts, captions, empty states, profile controls, experiment configuration, and the hand-replay dialog use narrower spacing and phone-safe wrapping.
- The 169-hand starting-range grid retains its touch-friendly horizontal scrolling and now shows a phone-only swipe instruction.

### Poker-table visibility on phones

- `PokerTable` has explicit phone seat maps for tables with two through nine players. Seats occupy dedicated outer lanes rather than using the desktop ellipse, keeping the community-card and pot area clear.
- Opponents render as compact two-line ovals containing their name plus chip stack/action state; hidden-card backs are omitted from those non-interactive seats. The user's larger seat keeps the visible hole cards and full chip stack.
- Phone opponent ovals shrink further for full-ring tables, and redundant `chips` suffixes are hidden inside seat boxes to reduce width without hiding numeric stack or committed amounts.
- The board and pot occupy a centered foreground layer. The flop, turn, river, and pot total therefore remain visible instead of being covered by player boxes.
- Opponent ovals expose a complete accessible label and title with name, chip stack, action state, and committed chips even when the visual text is truncated.
- Opponent hole cards remain absent from compact calibration seats during play and after uncontested pots. When the engine marks that specific opponent as having reached showdown, the oval reveals both cards with the normal staggered card-turn animation; opponents that folded earlier remain hidden even if other players reach showdown.

### Calibration scroll-position stability

- During an active hand on screens below 768px, both `/calibrate` and `/range-calibrate` lock the app shell to `100dvh` and use a four-row grid for session status, progress, a flexible felt, and the action panel. The phone page itself cannot scroll, while the felt expands or contracts into the space remaining after the controls.
- At 768px and wider, active calibration returns to normal document flow: the body, app shell, and main content can overflow vertically; the calibration grid uses auto height; and the felt uses its natural 16:9 height. This allows mouse-wheel scrolling after a selected range starts betting calibration instead of compressing and locking the desktop document to the viewport.
- The body-level active-session marker is limited to actual hand phases: `playing`, `opponent-acting`, and `hand-done`. The range-selection phase never receives the no-scroll lock, so its game selector, position controls, full 169-hand grid, and setup actions remain vertically scrollable.
- The prior 22rem mobile action-panel reservation is removed. Phone buttons, chip entry, sizing shortcuts, clock, and pot context use a compact layout; the redundant sizing slider is hidden on narrow or short screens while direct chip entry, increment buttons, 3× BB, percentage, pot, and all-in shortcuts remain available. The 3× BB shortcut stays present on every street when betting controls are available and is disabled only when its fixed chip total is outside the current legal range.
- Completed-hand controls wrap safely instead of squeezing the primary action. On phones the next-hand button occupies its own full-width, taller row, while wider viewports retain a prominent fixed-width action beside the hand result.
- The fixed phone tab bar is hidden for every active calibration phase, including the completed-hand screen, to return vertical space to the table and keep the next-hand button unobstructed. Both calibration pages apply an explicit `calibration-session-active` body class as a robust fallback to the relational layout selector, and the hide plus safe-area rules cover the complete sub-768px mobile navigation range. The sticky header and full hamburger navigation remain available.
- Scroll anchoring stays disabled for the calibration table and action panel, and the existing next-hand viewport restoration remains as a defensive fallback.

### Mobile validation

- The current responsive implementation passes ESLint, all 15 Vitest files / 99 tests, and the Next.js production build across all 19 routes.
- Headless Chrome verification at 390×844 confirms active betting calibration remains exactly viewport-locked, the fixed bottom tab is hidden, and the controls end at 837.6px inside the 844px viewport.
- A repeatable browser-level responsive test in the project suite remains a sensible follow-up; the current change received direct headless-Chrome verification in addition to source, lint, unit/integration, and production-build checks.

## Timing-aware calibration and simulation completed

The full-session and range-first calibration flows now behave like paced online poker tables.

### Manual calibration experience

- Every user decision has a 45-second action clock so users have time to calculate odds.
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
- The user's hole cards render at the large card size in both calibration flows. Opponent calibration seats omit decorative hidden-card backs and use compact oval summaries instead.
- Opponent turns use a fixed 500ms live preview in both calibration pages, but the action clock renders only for the user's 45-second decision window. Heuristic opponents retain a separate 15-second virtual timing ceiling; their seeded timing is still stored on the action, shown beside the decision under the player's name, and used by the timing-aware model.
- Both calibration flows expose **Check / Fold rest of hand**. The initial intentional action retains the user's real response time; later actions check when free or fold to a wager automatically and omit timing so they do not create an artificial 0ms timing tell. The mode resets after the hand.
- Calibration table card visibility follows the engine's per-seat result metadata rather than the broad hand-complete flag. The user's cards remain visible throughout; an opponent's cards are passed to the table only when that opponent's result has `showedDown: true`.

### Information-rich calibration and precise bet sizing

- Manual calibration now uses a calibration-only information controller in `lib/simulation/calibration.js`; high-speed and detailed experiments continue to use the ordinary configured heuristic opponents without this wrapper.
- A bot's normal hand-based preflop action remains authoritative. When that normal policy would fold to a normal-sized user raise, the bot receives only a capped extra call chance based on its actual hole-card strength, pot odds, stack commitment, and profile looseness. Weak hands usually still fold, stronger hands defend more frequently, large raises and all-ins receive the normal policy, and no preflop call is forced.
- `selective-aggressor` is the fourteenth heuristic archetype. It plays a moderately loose range, raises playable hands at a mixed hand-gated frequency, and occasionally 3-bets near the top of its normal defending range; it does not raise every hand like the maniac profile.
- Every new 6-player manual calibration table receives one selective aggressor plus TAG, calling-station, recreational, and loose-passive opponents. A 9-player table adds LAG, nit, and balanced-reg opponents without duplicating the selective aggressor. This guarantees some preflop pressure capability without forcing an aggressive action on any deal; the selective aggressor still checks, calls, or folds when its cards and seeded frequency dictate.
- The selectable experiment-opponent list includes the new archetype at weight zero by default. Existing experiment defaults do not add it automatically, and the zero-pressure guard avoids consuming extra RNG draws for all pre-existing profiles, so `SIMULATION_VERSION` remains `1.7.0`.
- The first bot that actually continues can become the hand's postflop measurement opponent. Postflop calibration rotates between passive showdown-oriented lines and pressure lines so the sample observes both checked-to decisions and decisions facing bets while retaining ordinary handling for large commitments.
- Calibration opponent timing rotates evenly through snap, normal, and tank cues so short samples can observe timing-conditioned user reactions instead of receiving almost exclusively normal cues.
- Range-first and all-hands calibration starting cards come from shuffled combo-weighted bags. The sampler retains natural suited/pair/offsuit 4/6/12 combination proportions while reducing redundant independent repeats in short sessions. Positional range mode maintains an independent bag for each position.
- New calibrations store `calibrationDesign: "information-rich-v1"`. The setup and results UI explains that calibration hands are optimized for learning coverage rather than realistic opponent-pool profitability.
- `ChipAmountInput` places explicit **−** and **+** buttons around the numeric chip field, supports a caller-selected chip increment, disables at the current legal minimum/maximum, and remains synchronized with the slider, manual number entry, sizing shortcuts, and all-in shortcut.
- Unrestricted and range-first calibration use the selected small blind as the increment; corrected bet/raise sizing inside Simulated Hand Review retains exact one-chip controls.
- `SIMULATION_VERSION` remains `1.7.0` because these changes affect manual calibration data collection and controls, not seeded batch-simulation decisions.

### Stakes and PokerStars-style calibration sizing

- New calibration sessions and experiments default to 1/3 chips. Reusable stake buttons offer 1/3 and 2/5 in unrestricted calibration, range-first calibration, and experiment setup; experiment blind fields remain editable for custom stakes.
- Range-first calibration presents the game selector before the range grid. Users choose both stakes and either a 6-player (6-max) or 9-player (full-ring) table before selecting hands; unrestricted all-hands calibration exposes the same game choices before dealing.
- Position-specific editing follows the selected table: 6-max requires and displays UTG, HJ, CO, BTN, SB, and BB, while full ring requires and displays all nine positions. Switching table sizes keeps existing charts but moves the active tab to a valid position when necessary.
- Both calibration flows persist the selected table configuration with the saved strategy, use a 300-chip buy-in at 1/3 or a 500-chip buy-in at 2/5, and continue to display stacks, calls, bets, raises, pots, and shortcut amounts in chips.
- Calibration tables stay at exactly the selected seat count. Their fixed lineup does not use normal experiment turnover or random sit-outs; a felted calibration bot rebuys into the same seat and profile. Six-max retains the original five-opponent lineup, while full ring adds LAG, nit, and balanced-reg opponents and still contains exactly one selective aggressor. Batch experiments retain ordinary turnover and sit-out behavior.
- The calibration slider, numeric-input arrow behavior, and explicit **−**/**+** buttons move in small-blind increments: one chip at 1/3 and two chips at 2/5. Direct numeric entry can still select any exact legal whole-chip amount.
- A persistent shortcut prepares a total bet or raise of three big blinds: 9 chips at 1/3 and 15 chips at 2/5. It remains visible on preflop, flop, turn, and river whenever betting or raising is legal, and is disabled when that amount is outside the current legal minimum/maximum; the poker engine remains the final legality authority.
- The glossary's blind examples now use 1/3. `SIMULATION_VERSION` remains `1.7.0` because the new default affects newly configured games, while versioned seeded decision logic is unchanged.

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

## Opponent-type strategy performance analytics completed

- Completed solo and real-users-with-bots experiments now show which heuristic player archetypes the selected strategy performed best and worst against.
- `TableSession` preserves each heuristic player's stable archetype ID and name in completed hand histories. Analytics therefore use explicit metadata instead of parsing randomized display names such as `Miko (tag)`.
- `Aggregator` emits `byOpponentType` results containing opponent-hand encounter counts, decisive encounters, attributed chips and big blinds, a normalized matchup score, and an approximate 95% range.
- Multiway results use proportional chip-transfer attribution: user gains are apportioned among opponents that lost chips, while user losses are apportioned among opponents that won chips. Scores are normalized per 100 opponent-seat encounters so frequently selected pool types are not favored merely because several copies shared a table.
- The results page presents beginner-friendly **Best matchup result** and **Hardest matchup result** cards plus a full ranked table with relative bars, matchup score, attributed result, encounter count, and the archetype description.
- The UI explains that this is a directional comparison inside the configured mixed simulated table, not a pure heads-up test. Players-only experiments omit this bot-archetype section.
- Existing saved runs do not contain archetype metadata, so matchup analytics appear after a new run or rerun. No database migration was required because experiment results and hand histories are stored as versioned JSON payloads.
- `SIMULATION_VERSION` remains `1.7.0`: this feature adds metadata and result analysis without changing seeded decisions or hand outcomes.

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
- Browser smoke check: range-first selection loaded in browser-storage mode; starting a selected-hand calibration showed the red felt, large user cards, sound toggle, animated card classes, legal action panel, and visible decision clock.
- Production verification after the JavaScript production-branch push: `/login` returned HTTP 200 from Vercel. Earlier live verification also confirmed the stylesheet contained `card-turn-in`/`cardTurnIn`, the calibration bundle contained the persisted audio-preference key, and the final experiment bundle contained **Review more simulated hands**.

New application tests include:

- Current working-tree validation after adding showdown-only opponent reveals: all 15 Vitest files / 102 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices. Tests verify that user cards remain visible, opponents stay hidden without a showdown or with `showedDown: false`, true-showdown cards render inside compact calibration seats, the two card glyphs are accessible, and the card-turn animation is present.
- Current working-tree validation after restoring desktop active-calibration scrolling: headless Chrome at 1440×900 reports `bodyOverflowY: auto`, a 931px document with the full betting panel visible, and a real mouse-wheel change from `scrollTop: 0` to `31`. At 1366×768 the document is 889px tall and the completed scroll position is 121px, with controls ending at 736.1px inside the viewport. The paired 390×844 phone check retains `overflow-y: hidden`, an 844px document, hidden bottom tabs, and fully visible controls. All 15 Vitest files / 99 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices.
- Current working-tree validation after restoring range-selection scrolling: all 15 Vitest files / 99 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices. Both calibration flows now enumerate the three active-hand phases explicitly instead of treating every non-setup phase as scroll-locked.
- Current working-tree validation after making the bottom tab bar strictly phone-only: all 15 Vitest files / 99 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices. The new `min-width: 768px` rule changes only desktop/tablet-width rendering; phone navigation remains unchanged.
- Current working-tree validation after preventing the fixed bottom tab bar from covering completed-hand controls: all 15 Vitest files / 99 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices. Both calibration pages retain the active-session body marker through `hand-done`, and `app/globals.css` hides the tab bar and removes its reserved bottom padding across the full mobile navigation breakpoint.
- Current working-tree validation after the persistent 3× BB shortcut and prominent next-hand controls: all 15 Vitest files / 99 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices. The behavior is implemented in both unrestricted and range-first calibration flows, with shared responsive styling in `app/globals.css`.
- Current working-tree validation after the no-scroll calibration layout and oval-opponent-seat work: 15 test files and 99 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices. Poker-table rendering tests confirm calibration-only opponent ovals, accessible chip/action labels, and unchanged full opponent-card rendering outside calibration.
- Validation after increasing the calibration user clock to 45 seconds: 14 test files and 97 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices. Timing tests assert the 45-second user clock and unchanged 15-second heuristic-opponent ceiling.
- Current working-tree validation after the upfront stake/table-size selector and fixed calibration lineup work: 14 test files and 97 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices.
- `tests/calibration.test.js`
  - Actual engine actions post exactly 1/3 or 2/5 blinds on both 6-player and 9-player calibration tables.
  - Full-ring calibration receives eight distinct bot profiles with exactly one selective aggressor.
- `tests/config.test.js`
  - Calibration table-size choices are restricted to 6 and 9 players.
- Current working-tree validation after the 1/3 and 2/5 stake presets and PokerStars-style calibration sizing work: 14 test files and 92 tests pass, ESLint passes, the Next.js production build passes all 19 routes, and `git diff --check` is clean apart from expected Windows LF/CRLF notices.
- `tests/config.test.js`
  - 1/3 is the default, 2/5 is offered as a preset, and the three-big-blind chip shortcut resolves to 9 or 15 chips.
- `tests/chip-amount.test.js`
  - Exact one-chip stepping plus two-chip small-blind stepping and legal-bound clamping.
- Current working-tree validation after the selective-aggressor, information-rich calibration, and one-chip sizing work: 14 test files and 90 tests pass, ESLint passes, and the Next.js production build passes all 19 routes.
- `tests/calibration.test.js`
  - Combo-weighted shuffled starting-hand bags retain exact class proportions and selected-range legality
  - Passive/pressure scenarios and snap/normal/tank cues all receive coverage
  - Stronger hands receive a higher calibration defend chance, while worse prices and larger commitments reduce it
  - Scripted user raises produce both defended and uncontested pots and still collect later-street decisions
  - Every calibration lineup contains exactly one selective aggressor
  - The selective aggressor raises playable hands at a mixed frequency rather than always raising
- `tests/chip-amount.test.js`
  - One-chip decrement/increment stepping and legal-bound clamping
- Current working-tree validation after the opponent-type analytics work: 12 test files and 81 tests pass, ESLint passes, and the Next.js production build passes all 19 routes.
- `tests/simulation.test.js`
  - Completed bot players retain explicit archetype IDs and names
  - Simulation aggregates contain opponent-type encounter results
  - Proportional multiway attribution ranks archetypes correctly and reconciles to the user's total result in bot-only hands
- `tests/leaderboard.test.js`
  - Completed runs are grouped by strategy and ranked by hand-weighted win rate
- `tests/range.test.js`
  - Position-specific calibration deals and policy serialization use the matching seat chart

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

- The main live branch is `agent/supabase-backend` (`origin/agent/supabase-backend`). The local deployment branch tracks it, `origin/HEAD` points to it, and pushes to it trigger the Vercel production deployment.
- The repository is linked to Supabase project `oxrqtwqkzkembnglhbtn`.
- Migrations `20260717000000_initial_user_data.sql`, `20260717010000_strategy_reviews.sql`, and `20260718000000_social_multiplayer.sql` are recorded in remote migration history and applied. The multiplayer migration was pushed and verified against the linked project on 2026-07-18.
- `20260719000000_strategy_leaderboard.sql` was applied to the hosted project through the SQL editor on 2026-07-19; the matching migration remains committed locally for reproducible setup.
- The earlier detailed remote verification found the 3 initial application tables, 3 RLS-enabled tables, 12 policies, and `finalize_experiment_run`; the applied follow-up migration adds `strategy_reviews` and `save_experiment_strategy_review`.
- Supabase Auth Site URL is `https://poker-sim-iota.vercel.app`.
- Local, production, stable Vercel alias, and `*-optvis.vercel.app` preview confirmation URLs are allowed.
- Email signup is enabled and email confirmation is required.
- The original TOTP enrollment/verification and 8-digit, one-minute email OTP settings were preserved.
- Vercel `optvis/poker-sim` has both public Supabase variables in Production and Preview.
- The production deployment is aliased to `https://poker-sim-iota.vercel.app`.
- The production root redirects signed-out visitors to `/login`; `/login` returned HTTP 200 after the JavaScript migration was pushed to the production branch.
- Mobile poker-table commit `6efeda4` is pushed to `origin/agent/strategy-review-calibration` and merged into the default production branch `origin/agent/supabase-backend` at `2410d26`.
- Calibration viewport-stability commit `ae4c1ab` is pushed directly on top of the default production branch. Production therefore includes the phone-first navigation/layout pass, unobstructed mobile poker-table geometry, reserved action-panel height, disabled calibration scroll anchoring, and exact viewport restoration between hands.
- Opponent-type analytics commit `ae95054` is pushed to the default production branch, triggering its Vercel production deployment. Exact live-site verification of that deployment remains pending.
- Information-rich calibration and one-chip sizing commit `cb88e15` is pushed to the default production branch.
- Selective preflop aggressor commit `441768f` adds the fourteenth bot archetype and guarantees that each new calibration lineup includes one hand-gated selective aggressor without forcing any aggressive action.
- Stake and sizing commit `daff32f` adds the 1/3 default, 2/5 presets, small-blind sizing increments, and three-big-blind calibration shortcut.
- Calibration game-selection commit `3407cde` adds the upfront 6-player/9-player selector, seat-count-aware position editing, exact blind-post tests, and fixed full calibration lineups.
- The 45-second calibration user clock commit `2dc0354` remains in production history. Exact live-site verification of that specific deployment remains pending.
- The no-scroll calibration layout and oval opponent seats were committed and pushed through `c9cce87`. Exact live-site verification of that deployment remains pending.
- The persistent 3× BB shortcut and prominent next-hand controls were committed and pushed through `f4a4a18`. Exact live-site verification of that deployment remains pending.
- The full-mobile-range bottom-tab visibility fix was committed and pushed through `2b29885`. Exact live-site verification of that deployment remains pending.
- The desktop bottom-tab suppression was committed and pushed through `37f4bc1`. Exact live-site verification of that deployment remains pending.
- The range-selection scrolling fix was committed and pushed through `ee9c766`, the current local `HEAD`, `origin/agent/supabase-backend`, and `origin/HEAD`. Exact live-site verification of that deployment remains pending.
- The desktop active-calibration scrolling fix was committed and pushed through `de2035f`, the current local `HEAD`, `origin/agent/supabase-backend`, and `origin/HEAD`. Exact live-site verification of that deployment remains pending.
- The showdown-only opponent-card reveal is local and uncommitted. It has not been pushed to `agent/supabase-backend` or deployed to Vercel.
- Production also serves the beginner-first percentage analytics, expandable review counts, repeatable post-acceptance reviews, calibration-style correction sizing, calibration sounds, and card-turn animation. Exact live asset fingerprints were checked after the earlier JavaScript production-branch push.

Remaining external verification:

1. Create the first real account and confirm its email.
2. Save a calibration/experiment/review and verify persistence after sign-out/sign-in.
3. Run the committed pgTAP suite in a local Supabase/Docker stack.

Never expose a Supabase secret or service-role key through `NEXT_PUBLIC_*`.

## Important source map

- `app/page.jsx` — dashboard hero, default calibration entry, workflow, and recent experiment summary
- `app/calibrate/page.jsx` — creates and saves unrestricted calibration datasets with 1/3 or 2/5 stakes, an every-street chip-denominated three-big-blind sizing shortcut, prominent next-hand controls, showdown-gated opponent cards, hand-phase-only body state for navigation visibility, and phone viewport preservation between hands
- `app/range-calibrate/page.jsx` — explicit scrollable 169-hand range selection plus timed 1/3 or 2/5 betting calibration, with the same every-street sizing shortcut, prominent next-selected-hand controls, showdown-gated opponent cards, hand-phase-only body state, and phone viewport preservation between hands
- `app/glossary/page.jsx` — full beginner-friendly poker and advanced analytics glossary
- `app/experiments/new/page.jsx` — creates experiments with 1/3 and 2/5 stake presets plus editable custom blinds
- `app/experiments/[id]/page.jsx` — runs simulations, atomically finalizes results/hands, and renders opponent-type matchup analytics
- `app/experiments/page.jsx` — previous-experiment history and saved-run entry points
- `app/accuracy/page.jsx` — in-browser review-feedback summary
- `app/settings/page.jsx` — active storage summary, delete operations, browser import
- `app/login/page.jsx` — sign-in/sign-up UI
- `app/auth/confirm/route.js` — authentication callback
- `app/globals.css` — shared themes plus phone safe areas, navigation, touch sizing, table geometry, data-view responsiveness, phone-only active-calibration viewport locking, desktop active-calibration document scrolling, responsive completed-hand controls, full-mobile-range bottom-tab suppression during calibration, and explicit desktop suppression of the phone-only tab bar
- `components/Nav.jsx` — desktop sidebar plus phone top bar, bottom tabs, grouped drawer, storage/account indicator, and sign-out
- `components/ActionClock.jsx` — reusable online-style decision countdown
- `components/CalibrationGameSelector.jsx` — upfront 1/3-or-2/5 and 6-player-or-9-player calibration game selection plus the selected-game summary
- `components/ChipAmountInput.jsx` — legal whole-chip entry plus configurable-increment decrement/increment controls used by calibration and strategy review
- `components/StakePresetButtons.jsx` — shared 1/3- and 2/5-chip stake presets for calibration and experiment setup
- `components/PokerTable.jsx` — shared desktop layout, dedicated 2–9 seat phone maps, unobstructed board/pot zone, accessible compact opponent ovals, animated showdown-card reveals, action display, and calibration-specific user card sizing
- `components/StartingHandGrid.jsx` — accessible 169-hand grid with single-click and primary-mouse drag painting
- `lib/audio/poker-sounds.js` — browser-safe synthesized deal/action audio plus persisted calibration sound preference
- `components/AnalyticsGlossary.jsx` — reusable glossary data, expandable contextual guides, and full glossary renderer
- `components/OpponentMatchups.jsx` — best/hardest matchup summaries and the ranked opponent-archetype performance table
- `components/HandReplayer.jsx` — hand replay including voluntary-action timing and timeout labels
- `components/StrategyReview.jsx` — in-browser simulated-decision survey over stored hands
- `lib/simulation/timing.js` — separate 45-second calibration-user and 15-second heuristic-opponent clocks, timing buckets, formatting, timeout defaults, and fallback timing samples
- `lib/simulation/calibration.js` — combo-weighted hand sampler plus calibration-only hand-strength-weighted defense, postflop measurement scenarios, and balanced timing cues
- `lib/simulation/defaults.js` — shared 1/3 default table, 1/3 and 2/5 stake presets, 6-player and 9-player calibration sizes, distinct seat-count-aware calibration lineups, pool defaults, and three-big-blind chip sizing helper
- `lib/simulation/manual.js` — manual calibration loop with real user timing and paced opponents
- `lib/simulation/table.js` — virtual timing propagation, timing-aware decision contexts, user decision logs, stable bot-archetype metadata, normal experiment turnover, and fixed full calibration-lineup handling
- `lib/analytics/aggregate.js` — incremental overall analytics plus proportional opponent-type matchup attribution and uncertainty ranges
- `lib/player-model/policy.js` — v3 position- and timing-aware behavioral policy with v1/v2 compatibility
- `lib/player-model/review.js` — review sampling, answer conversion, feedback weighting, and calibrated-policy rebuilding
- `lib/agents/profiles.js` — fourteen heuristic archetypes including the hand-gated selective aggressor
- `lib/agents/agent.js` — heuristic decisions, selective preflop pressure, virtual pacing, and deliberately weak timing reads
- `lib/poker/engine.js` — optional timing metadata on voluntary actions
- `lib/poker/action-display.js` — current-cycle action labels plus per-seat showdown-only hole-card visibility
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
- `supabase/migrations/20260719000000_strategy_leaderboard.sql` — authenticated, aggregate top-strategy RPC
- `supabase/tests/database/schema_and_rls.test.sql` — pgTAP database tests
- `tests/timing.test.js` — timing classification, propagation, learning, compatibility, and batch-run coverage
- `tests/calibration.test.js` — calibration hand sampling, defense probability, scenario coverage, later-street collection, and range legality
- `tests/chip-amount.test.js` — exact one-chip stepping and legal-bound clamping
- `tests/poker-table.test.js` — calibration-only opponent ovals, accessible seat details, user/opponent card privacy, animated showdown reveals, and full-card rendering outside calibration
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
- Keep the opponent preview clock hidden; the visible 45-second action clock is for the user's decisions only. Preserve the 500ms preview, the separate 15-second heuristic-opponent virtual ceiling, and stored full opponent timing.
- Keep calibration opponent cards hidden unless the engine result for that exact seat has `showedDown: true`. Never reveal folded players or cards from uncontested completed hands; animate the two-card reveal for opponents who actually reach showdown.
- Keep range-first calibration as the default entry while retaining unrestricted calibration as **All hands**.
- Keep new games at the 1/3 default with the 2/5 preset available. Calibration amounts remain chip-denominated; small-blind incremental controls and the legal three-big-blind shortcut must remain synchronized with the main bet amount. Keep the 3× BB shortcut visible after preflop, disabling it only when the fixed amount is outside the current legal range.
- Keep the calibration game selector before range editing, restrict calibration table sizes to 6 or 9 players, show only positions active at the selected size, and keep every calibration hand full at that chosen seat count. Do not disable normal turnover or sit-outs for experiments.
- Keep active calibration hands within one viewport on phones below 768px. Opponents remain compact ovals, the user seat retains visible large hole cards, and every legal action/sizing control must stay onscreen without page scrolling.
- Keep active calibration vertically scrollable at 768px and wider. Do not apply the phone's `100dvh` body/app-shell overflow lock or fixed-height calibration grid to desktop views.
- Never apply the calibration no-scroll body state during range selection; it is reserved for `playing`, `opponent-acting`, and `hand-done` only.
- Keep the fixed bottom mobile tab bar hidden throughout every active calibration phase, including the completed-hand screen, across the full sub-768px navigation breakpoint so it cannot cover the next-hand action.
- Keep the bottom tab bar phone-only. Its custom `display: grid` styling must be explicitly overridden at 768px and wider so it never appears in the desktop layout.
- Preserve both drag-paint selection/erasing and accessible single-cell click/keyboard operation in the starting-hand grid.
- Treat heuristic timing tells as weak/noisy and do not present them as reliable indicators of hand strength.
- Preserve beginner explanations alongside advanced metrics rather than hiding or removing the statistical detail.

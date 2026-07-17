# RangeBench Project Context

Last updated: 2026-07-16

This file is the handoff for future maintainers and LLM conversations. Read it before changing the project, then consult `README.md`, `docs/ARCHITECTURE.md`, and the relevant source files for implementation detail.

## Current repository state

- GitHub repository: `https://github.com/bnjcc/poker-sim`
- Active branch: `agent/supabase-backend`
- Branch tracks: `origin/agent/supabase-backend`
- Latest committed implementation: `23935e6 Add Supabase user data backend`
- Original application commit: `b70bffa RangeBench: poker strategy simulation platform`
- The GitHub repository was empty when the Supabase branch was first pushed, so `agent/supabase-backend` became its first/default branch. There was no base branch for a pull request.
- The Supabase implementation was cleanly committed and pushed before this context file was added.
- Hosted Supabase project: `oxrqtwqkzkembnglhbtn` (`https://oxrqtwqkzkembnglhbtn.supabase.co`)
- Vercel project: `optvis/poker-sim`
- Production site: `https://poker-sim-iota.vercel.app`
- Local provider links and public environment values live in ignored `.vercel/` and `.env.local` files.

## Product summary

RangeBench is a Next.js 15 application for modeling and backtesting a user's 6-max No-Limit Hold'em strategy.

The workflow is:

1. The user manually plays a calibration sample.
2. The app computes descriptive poker tendencies and trains a bucketed behavioral policy.
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

Validation on the final Supabase implementation passed:

- TypeScript: clean (`tsc --noEmit`)
- ESLint: clean
- Vitest: 5 test files, 40 tests passed
- Next.js production build: passed
- `git diff --check`: clean apart from expected Windows LF/CRLF notices
- Secret scan: no Supabase secret/service key or private key was committed

New application tests include:

- `tests/storage.test.ts`
  - Non-finite JSON values round-trip correctly
  - Normalized database fields override stale JSON payload metadata
  - Calibration deletion maps to a nullable experiment reference
- `tests/redirect.test.ts`
  - Local redirect paths are retained
  - Absolute, scheme-relative, backslash, and JavaScript redirect attempts are rejected

Database security tests are committed at:

`supabase/tests/database/schema_and_rls.test.sql`

The pgTAP file contains 19 assertions covering tables, RLS, grants, ownership defaults, user isolation, cross-owner rejection, calibration `SET NULL`, and experiment-hand cascade behavior. It was statically reviewed but has not yet been run in a local Supabase/Docker stack. Remote read-only verification confirmed all 3 tables, all 3 RLS-enabled relations, 12 policies, and the finalizer function.

## Hosted deployment status

The production backend and deployment are connected:

- The repository is linked to Supabase project `oxrqtwqkzkembnglhbtn`.
- Migration `20260717000000_initial_user_data.sql` is recorded in remote migration history and applied.
- Remote verification found 3 application tables, 3 RLS-enabled tables, 12 RLS policies, and 1 `finalize_experiment_run` function.
- Supabase Auth Site URL is `https://poker-sim-iota.vercel.app`.
- Local, production, stable Vercel alias, and `*-optvis.vercel.app` preview confirmation URLs are allowed.
- Email signup is enabled and email confirmation is required.
- The original TOTP enrollment/verification and 8-digit, one-minute email OTP settings were preserved.
- Vercel `optvis/poker-sim` has both public Supabase variables in Production and Preview.
- Production deployment `dpl_EHAfxvN77MRrVENmSvk4N6ZkZgNU` is Ready and aliased to `https://poker-sim-iota.vercel.app`.
- The production root redirects signed-out visitors to `/login`; `/login` returns HTTP 200.

Remaining external verification:

1. Create the first real account and confirm its email.
2. Save a calibration/experiment and verify persistence after sign-out/sign-in.
3. Run the committed pgTAP suite in a local Supabase/Docker stack.

Never expose a Supabase secret or service-role key through `NEXT_PUBLIC_*`.

## Important source map

- `app/calibrate/page.tsx` — creates and saves calibration datasets
- `app/experiments/new/page.tsx` — creates experiments
- `app/experiments/[id]/page.tsx` — runs simulations and atomically finalizes results/hands
- `app/settings/page.tsx` — active storage summary, delete operations, browser import
- `app/login/page.tsx` — sign-in/sign-up UI
- `app/auth/confirm/route.ts` — authentication callback
- `components/Nav.tsx` — storage/account indicator and sign-out
- `lib/storage/store.ts` — local and Supabase storage implementations
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — cookie-aware server client
- `lib/supabase/middleware.ts` — session refresh and route protection
- `lib/supabase/config.ts` — environment detection
- `lib/auth/redirect.ts` — safe internal redirect validation
- `types/database.ts` — database client types
- `types/experiment.ts` — domain types, including nullable calibration reference
- `supabase/migrations/20260717000000_initial_user_data.sql` — schema, RLS, triggers, finalizer
- `supabase/tests/database/schema_and_rls.test.sql` — pgTAP database tests
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

Do not regress these design constraints:

- Keep RLS as the authoritative data boundary.
- Never expose service credentials to the client.
- Do not silently switch storage modes after a cloud error.
- Do not overwrite existing cloud data during browser import.
- Do not activate a hand revision separately from its matching experiment payload/status.
- Preserve the browser-only fallback unless the product explicitly drops zero-setup mode.

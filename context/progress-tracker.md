# Blumo — Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Planning complete.
- Unit 01: Project Foundation — complete.
- Unit 02: Supabase Auth — complete.
- Unit 03: Core Database Schema and RLS — complete.
- Unit 04: Authenticated Onboarding — complete and merged into main.
- Unit 05: Authenticated Dashboard Shell — complete and merged into main.
- Unit 06: GitHub App Registration and Installation Start — **complete and merged into main.**
- Unit 07: GitHub App Setup Callback and Installation Verification — **complete and merged into main.**
- **Unit 08: Repository Sync and Selection — complete, manually verified, and merged into main.**
- **Unit 09 implementation complete and verified.**
- **Unit 10: AI Mission Generation is complete, manually verified with the real
  AI provider, and merged into main.**
- **Unit 11 specification is complete and merged into main.**
- **Unit 11: Mission Review and Approval — automated verification complete.
  Awaiting manual verification and merge.**
- **Current phase: Unit 11 verification.**

## Current Goal

Verify and merge Unit 11: Mission Review and Approval.

Manual verification checklist (from spec §15):
- Open the review page for a generated mission and confirm all fields display.
- Confirm AI-generated label and no-GitHub-write explanation are visible.
- Approve the mission and confirm status changes to `approved`.
- Confirm `/tasks/[taskId]` shows the approved banner and links back.
- Reject a generated mission with an optional reason.
- After rejection, submit regeneration feedback and confirm a new version appears.
- Confirm repository-unavailable warning blocks approval/regeneration.
- Confirm repeated approval returns idempotent result.

## In Progress

- **Unit 11** automated verification passed (lint: 0 warnings, typecheck: clean,
  301 tests across 41 files, production build clean). Awaiting manual verification
  and merge.

## Next Up

1. Manually verify Unit 11 per the specification checklist above.
2. Merge Unit 11 into main.
3. Do not begin Unit 12 until Unit 11 is merged.

## Open Questions

- Final production product domain is not selected.
- Final logo mark is not selected.
- Dark mode is deferred; decide after the light MVP core flow is stable.
- Private beta size and invite method will be defined before launch.

## Completed

- Product name selected: **Blumo**.
- Main tagline selected: **Grow every day.**
- Core product positioned as an AI developer consistency and growth platform.
- MVP user flow defined.
- MVP scope and exclusions defined.
- Technology stack selected.
- Website authentication decision: Supabase Auth with GitHub.
- Repository authorization decision: separate GitHub App installation.
- Repository safety root selected: `blumo/**`.
- Manual approval required for every MVP contribution.
- Supabase selected for PostgreSQL and RLS.
- Pollinations selected as the first AI provider behind an adapter.
- Resend selected for Supabase Auth SMTP and product email.
- `mail.arpankarki.com.np` verified in Resend.
- Six-file context system prepared.
- Build plan prepared.
- First unit specification prepared.
- **Unit 01 complete**: Next.js project created with TypeScript, Tailwind CSS v4, App Router, `src/` dir, and `@/*` alias.
- shadcn/ui initialized with `base-nova` style; `button`, `card`, `badge`, `separator` components added.
- Folder structure created: `(marketing)/`, `(app)/`, `components/layout/`, `components/shared/`, `components/ui/`, `features/`, `lib/env/`, `lib/utils/`, `types/`.
- Blumo semantic CSS tokens defined in `globals.css` (backgrounds, text, accent, borders, states, focus, code).
- Geist Sans and Geist Mono configured through Next.js font system.
- `src/lib/utils/cn.ts` created.
- `src/lib/env/server.ts` (server-only, Zod schema skeleton) created.
- `src/lib/env/public.ts` (NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_APP_URL) created.
- Layout components created: `BlumoWordmark`, `MarketingHeader`, `MarketingFooter`, `AppHeader`, `PageContainer`.
- Marketing home page (`/`) implemented with wordmark, tagline, product description, three-step explanation, and product-principle note.
- Dashboard placeholder (`/dashboard`) implemented with app shell, mission card, GitHub connection card, and progress card.
- Custom 404 not-found page created.
- Vitest configured with jsdom; 6 tests pass (wordmark, env validation).
- All scripts present: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`.
- README updated with local commands and context folder link.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.
- **Unit 02 complete**: Supabase Auth with GitHub OAuth provider configured.
- `@supabase/supabase-js` and `@supabase/ssr` installed.
- Supabase client modules created: `browser.ts`, `server.ts`, `admin.ts`, `middleware.ts` in `src/lib/supabase/`.
- Server and public env schemas extended with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`.
- Auth callback route: `src/app/api/auth/callback/route.ts` (exchanges PKCE code for session, redirects to `/dashboard`).
- Login page: `src/app/(auth)/login/page.tsx` with minimal centred layout.
- `LoginCard` component with GitHub sign-in button, error state, and terms note.
- `signInWithGitHub` Server Action — initiates GitHub OAuth via Supabase, redirects to callback.
- `signOut` Server Action — calls `supabase.auth.signOut()` and redirects to `/login`.
- Proxy (`src/proxy.ts`) — refreshes session cookie on every request, gates protected routes, redirects authenticated users from `/login`.
- `(app)` layout fetches the authenticated user server-side and passes display name, email, avatar to `AppHeader`.
- `AppHeader` updated to render user info, avatar/initials, and sign-out form.
- `loading.tsx` and `error.tsx` boundaries added for `(app)` routes.
- Marketing home page CTA now links to `/login`.
- Auth tests: `get-user.test.ts` (3 tests), `sign-out.actions.test.ts` (1 test). Total tests: 10.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass (no warnings).
- **Unit 03 complete**: Core database schema and RLS applied to the hosted Supabase project.
- All 10 SQL migrations created in `supabase/migrations/`.
- Migration 11 added: `profiles: owner insert` RLS policy so the onboarding
  service can create the profile row as a fallback if the `handle_new_user()`
  trigger is delayed or silently fails.
- `supabase/config.toml` created for local development.
- `supabase/seed.sql` created for local RLS testing.
- Tables created on the remote Supabase project: `profiles`, `goals`, `github_installations`, `repositories`, `daily_tasks`, `commits`, `ai_usage_records`, `audit_logs`.
- RLS enabled on all user-owned tables; user-facing policies follow `id = auth.uid()` (profiles) and `user_id = auth.uid()` (all others).
- `set_updated_at()` trigger function applied to `profiles`, `goals`, `github_installations`, `repositories`, `daily_tasks`.
- `handle_new_user()` trigger: fires on `auth.users` INSERT, creates `profiles` row from GitHub OAuth metadata using `security definer`.
- Partial unique index: one active goal per user (`goals_one_active_per_user_idx`).
- Partial unique index: one selected active repository per user (`repositories_one_selected_per_user_idx`).
- Full unique constraint: one commit per task (`commits.task_id`).
- Migrations successfully pushed to the hosted Supabase project (`supabase db push`).
- Remote tables verified in Supabase dashboard.
- Unit 03 merged into main.
- Unit 04 specification written: `context/specs/04-onboarding.md`.
- **Unit 04 complete**: First-time onboarding form implemented end-to-end.
- **Unit 05 complete**: Authenticated dashboard shell implemented.
- **Unit 07 complete**: GitHub App setup callback and installation verification implemented.
- **Unit 06 complete and merged into main**: GitHub App registration and installation start page implemented.
- **Unit 08 complete, manually verified, and merged into main**: Repository synchronization and one-active-repository selection implemented.
- **Unit 09 complete and verified**:
  - `POST /api/github/webhook` validates content type, required GitHub headers,
    the 1 MiB raw-body limit, HMAC-SHA-256 in constant time, UTF-8 JSON, and narrow
    Zod payload schemas before database access.
  - Service-role-only claim/apply/fail RPC boundaries implement delivery
    idempotency, concurrent/stale claim protection, stored installation/account
    matching, transactional lifecycle updates, history preservation, selection
    clearing, and one sanitized audit event per delivery.
  - Migration `20240001000012_github_webhook_lifecycle.sql` applied to hosted Supabase.
  - Automated verification passes: lint, typecheck, 149 tests, and production build.
- **Unit 10 implementation and automated verification complete**:
  - Provider-neutral AI contracts and Pollinations adapter implemented.
  - `mission-v2` prompt with JSON-Schema-shaped contract.
  - Strict Zod and deterministic safety validation.
  - Authenticated no-ID Server Action with atomic claim, persistence, and usage recording.
  - Dashboard mission states: prerequisites, empty generation, disabled loading skeleton,
    saved mission details, safe errors, bounded retry, exhausted retry.
  - Migrations 20240001000013, 20240001000014, 20240001000015 applied to hosted Supabase.
  - Final automated verification: lint, typecheck, 234 tests across 37 files, production build.

## Architecture Decisions

### Next.js App Router

Selected because the application needs a unified frontend and secure server-side integration boundary.

### Supabase Auth Plus GitHub App

Supabase owns the website session. The GitHub App owns selected-repository access. This keeps identity and repository permission concepts clear during the MVP.

### PostgreSQL with RLS

User-owned data is stored in Supabase PostgreSQL and isolated with Row Level Security.

### Manual Commit Approval

The first version never automatically publishes AI output. The user sees and approves the repository, branch, path, content, and commit message.

### Safe Repository Directory

The MVP writes only below `blumo/**`, reducing the risk of damaging an existing project.

### Provider-Neutral AI Interface

Pollinations is the first implementation, but feature code depends on an internal interface so the provider can be replaced later.

### Resend Subdomain

Email is sent from addresses below `mail.arpankarki.com.np`. The domain is verified. Supabase SMTP and product API keys still need to be created and configured.

### Onboarding Write Strategy (Unit 04)

The onboarding Server Action writes to `profiles` (UPSERT) and `goals` (INSERT) in sequence using the Supabase server client (anon key + RLS). The UPSERT includes full GitHub OAuth metadata from the live session so the profiles row is always fully populated even when the `handle_new_user()` trigger is delayed. `onboarding_completed_at` is set last, only after both writes succeed. The client never receives or sends a `user_id`; the server derives it from the authenticated session.

### GitHub Installation Verification Strategy (Unit 07)

The setup callback at `/api/github/setup` receives an `installation_id` query parameter from GitHub but never trusts it directly. The server authenticates as the GitHub App using a signed JWT, calls the GitHub API to retrieve the installation, and verifies that the installation's GitHub account matches the signed-in user's `github_user_id` from the `profiles` table. If the account ID does not match, the installation is rejected. The verified installation metadata is stored in `github_installations` using an upsert keyed on `installation_id`. No installation access token is stored.

## Session Notes

Unit 10: AI Mission Generation is complete. It was manually verified with the
real AI provider, including successful generation, persistence, and refreshed
dashboard display, and was merged into main.

Unit 11: Mission Review and Approval — automated verification complete.

- Authenticated `/tasks/[taskId]/review` route with loading skeleton; returns
  same not-found for missing and foreign tasks.
- Review page shows title, description, difficulty, estimated minutes, acceptance
  checklist, suggested branch, suggested commit message, learning outcome,
  repository, generation date, version number, and current status.
- Visible AI-generated label and no-GitHub-write explanation on every review.
- Approval via `approve_mission_version` RPC: ownership, repository/installation
  availability, expected-version check, idempotency, `approved_at` set on both
  task and version, sanitized audit event.
- Rejection via `reject_mission_version` RPC: optional sanitized reason (3–500
  chars, no HTML/control/secrets/injection), stored only on version, preserved
  mission history, idempotency.
- Regeneration via `claim_mission_regeneration` → validated provider call →
  `finalize_mission_regeneration` / `fail_mission_regeneration`: max 2 successes
  per task, max 3 provider attempts per source version, max 5 user 24-hour
  provider attempts; feedback validated against full safety boundary; prompt
  version `mission-regeneration-v1`; no GitHub API call.
- `mission_versions` and `mission_regeneration_requests` tables: RLS with
  owner-select only, no browser write policy.
- `daily_tasks` status constraint updated: `approved`, `rejected`, `completed`
  added; `ready`, `committing`, `committed` removed.
- Active-mission index updated to include `approved`, `in_progress`, and
  `review_operation_status = regenerating`.
- `claim_daily_mission_generation` updated to treat `review_operation_status =
  regenerating` as active and use profile row lock for concurrency safety.
- Dashboard counts updated from `committed` to `completed`.
- MissionCard now links generated/approved/rejected missions to the review page.
- `/tasks/[taskId]` approved placeholder shows success banner and links back.
- Approved, in-progress, and completed missions cannot be regenerated or
  overwritten.
- Migration `20240001000017_mission_review_approval.sql` written and ready to
  apply to hosted Supabase project.
- Automated verification: `npm run lint` 0 warnings, `npm run typecheck` clean,
  `npm run test` 301 tests across 41 files, `npm run build` clean with all
  `/tasks/[taskId]` and `/tasks/[taskId]/review` routes present.
- No GitHub write, no installation token, no branch/file/commit/PR operation.

Next step: apply migration to hosted Supabase, manually verify, and merge.

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
- **Current phase: Unit 09 implementation.**
- **Unit 09 specification is complete; implementation is in progress.**

## Current Goal

- Configure the real webhook secret and GitHub App endpoint, manually verify live
  lifecycle deliveries, then review and merge Unit 09 without beginning Unit 10.

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
- `src/lib/supabase/middleware.ts` updated to also return the `supabase` client instance.
- `src/proxy.ts` extended with onboarding gate: unonboarded users redirected to `/onboarding`; already-onboarded users redirected away from `/onboarding` to `/dashboard`.
- `src/app/(app)/onboarding/page.tsx` — Server Component, defensive `onboarding_completed_at` check before rendering the form.
- `src/app/(app)/onboarding/loading.tsx` — skeleton placeholder.
- `src/features/onboarding/OnboardingForm.tsx` — `"use client"` React Hook Form component with Zod resolver, all six fields, progress bar, error banner, and accessible field groups. Select display labels fixed via `SelectValue` render-function pattern. Client-side `router.push('/dashboard')` on success.
- `src/features/onboarding/onboarding.service.ts` — Step 1 uses `upsert` (not `update`) so GitHub metadata and preferences are always written even if the profile trigger was delayed. Pulls GitHub metadata from `supabase.auth.getUser()` during onboarding.
- `src/features/onboarding/onboarding.schema.test.ts` — 10 Zod schema tests.
- `src/features/onboarding/onboarding.service.test.ts` — 6 service/action tests (including unauthenticated case).
- Total test count: 32 (up from 26). All pass.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass (no warnings).
- **Unit 05 complete**: Authenticated dashboard shell implemented.
- `src/features/dashboard/` feature module created: `dashboard.service.ts`, `DashboardShell.tsx`, `GoalSummaryCard.tsx`, `MissionCard.tsx`, `GitHubConnectionCard.tsx`, `ProgressSummaryCard.tsx`, `RecentActivitySection.tsx`.
- `src/components/layout/AppSidebar.tsx` — fixed left sidebar (`lg` and wider), `usePathname()` active state, `aria-current="page"`.
- `src/components/layout/MobileNav.tsx` — Sheet-based mobile navigation, hamburger trigger, closes on link click.
- `src/components/layout/AppHeader.tsx` — nav links removed; `MobileNav` slot added; wordmark, user info, sign-out preserved. Changed from `sticky` to `fixed top-0` so header remains visible on scroll.
- `src/app/(app)/layout.tsx` — `AppSidebar` added; `pt-14 lg:pl-56` on `<main>` to compensate for fixed header.
- `src/app/(app)/dashboard/page.tsx` — replaced placeholder with real data fetch, redirect logic, `DashboardShell` render.
- `src/app/(app)/dashboard/loading.tsx` — skeleton matching dashboard layout shape.
- `src/app/(app)/tasks/page.tsx`, `history/page.tsx`, `settings/page.tsx` — placeholder pages.
- `src/features/dashboard/dashboard.service.test.ts` — 6 new tests.
- Total test count: 32 (up from 26). All pass.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass (no warnings).
- **Unit 07 complete**: GitHub App setup callback and installation verification implemented.
  - `src/lib/github/callback-params.schema.ts` — Zod schema for GitHub callback query params.
  - `src/lib/github/app-auth.ts` — server-only App-authenticated Octokit factory.
  - `src/lib/github/installation-lookup.ts` — server-only GitHub API installation retrieval; returns null on 404.
  - `src/features/github/installation.service.ts` — orchestrates verification, ownership check, conflict detection, upsert, and audit log.
  - `src/app/api/github/setup/route.ts` — redirect-only GET handler for the GitHub App setup callback.
  - `src/features/github/ConnectGitHubPage.tsx` — extended with error prop and error banner for all 8 error states.
  - `src/app/(app)/github/connect/page.tsx` — passes searchParams error to ConnectGitHubPage.
  - All Unit 06 missing files also created: `github-app.config.ts`, `installation-url.ts`, `ConnectGitHubButton.tsx`, `/github/connect` page/loading, proxy `/github` path, dashboard link.
  - 22 new tests added. Total: 54 tests.
  - `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.
- **Unit 06 complete and merged into main**: GitHub App registration and installation start page implemented.
- The **Blumo Development** GitHub App is created and installed for testing.
  App ID: 4335897. Slug: `blumo-development`. Installed on the developer's
  personal account.
- `src/lib/env/server.ts` extended with 6 GitHub App env vars: `GITHUB_APP_ID`,
  `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` (required); `GITHUB_WEBHOOK_SECRET`
  (optional until Unit 09); `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`
  (optional until Unit 07).
- `src/lib/github/github-app.config.ts` — server-only; normalises `\\n` to real
  newlines in the private key.
- `src/lib/github/installation-url.ts` — pure server-only URL builder for the
  GitHub App installation flow.
- `src/app/(app)/github/connect/page.tsx` — Server Component; auth + onboarding
  redirect guards; builds installation URL server-side; passes it to
  `ConnectGitHubPage` (no secrets in props).
- `src/app/(app)/github/connect/loading.tsx` — skeleton.
- `src/features/github/ConnectGitHubPage.tsx` — Server Component presenting
  permission explanation card and privacy note.
- `src/features/github/ConnectGitHubButton.tsx` — `"use client"`; uses
  `window.location.href` to navigate to GitHub's installation page.
- `/github` added to `PROTECTED_PATHS` in `src/proxy.ts`.
- `src/features/dashboard/GitHubConnectionCard.tsx` "Connect GitHub →" link
  updated to `/github/connect`.
- `src/app/(app)/settings/page.tsx` copy updated to reference the dashboard for
  GitHub connection.
- `src/lib/github/installation-url.test.ts` — 4 tests.
- `src/lib/github/github-app.config.test.ts` — 2 tests.
- `@color-popover` and `@color-popover-foreground` mapped in `globals.css`
  `@theme inline` block — fixes transparent Select dropdown backgrounds.
- Total test count: 38 (up from 32). All pass.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass.
- **Unit 08 complete, manually verified, and merged into main**: Repository synchronization and one-active-repository selection implemented.
  - `src/lib/github/installation-token.ts` creates short-lived installation tokens only in server-only code and never persists, logs, or exposes them to the browser.
  - `src/lib/github/repository-list.ts` uses installation tokens transiently and paginates all repositories available to the verified installation.
  - `src/features/github/repository-sync.service.ts` verifies the user's active installation, safely upserts repository metadata without changing `is_selected`, marks missing repositories as removed, preserves historical rows, and writes sanitized audit events.
  - `src/features/github/repository-selection.service.ts` rejects foreign, removed, unavailable, or inactive-installation repositories; clears the previous selection; verifies the active-row update; and rolls back safely on failure.
  - `/github/repositories` provides authenticated loading, empty, GitHub-unavailable, generic-error, selected, removed/unavailable, and selection-success states. Missing and suspended installations follow the documented connect/reconnect paths.
  - The dashboard GitHub card shows the active repository and default branch, a **Manage repositories** link, the connected-without-selection state, or the existing not-connected state.
  - 25 Unit 08 and dashboard regression tests added. Total test count: 79.
  - Final verification passes: `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
  - The verified GitHub App installation and selected repository are stored in Supabase.
- **Unit 09 specification complete**: `context/specs/09-github-webhook-lifecycle.md`
  defines the signed raw-body webhook route, installation and repository lifecycle
  transitions, delivery idempotency and concurrency migration, ownership boundary,
  sanitized auditing, UI impact, GitHub App setup, tests, and completion gate.
  The specification was reviewed and merged into main before implementation.
- **Unit 09 implementation and automated verification complete, pending the live
  completion gate**:
  - `POST /api/github/webhook` validates content type, required GitHub headers,
    the 1 MiB raw-body limit, HMAC-SHA-256 in constant time, UTF-8 JSON, and narrow
    Zod payload schemas before database access.
  - Service-role-only claim/apply/fail RPC boundaries implement delivery
    idempotency, concurrent/stale claim protection, stored installation/account
    matching, transactional lifecycle updates, history preservation, selection
    clearing, and one sanitized audit event per delivery.
  - Installation and repository UI states now reflect active, suspended,
    uninstalled, removed, and unavailable database state without fabricating a
    connection.
  - Unit 09 schema/security/setup documentation is synchronized.
  - Automated verification passes: lint, typecheck, 149 tests, and production
    build. The build used a temporary process-only webhook secret because the real
    value is not yet present in `.env.local`.
  - `20240001000012_github_webhook_lifecycle.sql` was applied successfully to the
    linked hosted Supabase project; a follow-up dry-run reports the remote database
    is up to date.
  - Live GitHub webhook flows have not been manually verified because the real
    webhook secret is not configured, so Unit 09 is not complete.

## In Progress

- **Unit 09 implementation**: signed webhook receipt, lifecycle synchronization,
  idempotency, auditing, and UI states are implemented and pass automated
  verification, and the migration is live. Secret/App configuration,
  valid/invalid delivery, suspension/unsuspension, repository add/remove,
  uninstall, and secret-exposure checks remain before the unit can be marked
  complete.

## Next Up

1. Add the real `GITHUB_WEBHOOK_SECRET` locally and in the deployment environment.
2. Configure the same secret and active webhook URL in the GitHub App.
3. Manually verify every Unit 09
   lifecycle and secret-exposure check.
4. Review and merge Unit 09 only after those checks pass.

## Open Questions

- Final production product domain is not selected.
- Final logo mark is not selected.
- Dark mode is deferred; decide after the light MVP core flow is stable.
- Final Pollinations model and usage limit will be chosen during the AI provider unit.
- Private beta size and invite method will be defined before launch.

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

Database migrations through Unit 09 have been applied to the hosted Supabase project, and the remote database is up to date. Unit 07 is complete and merged. Unit 08 is complete, manually verified, and merged into main; the verified GitHub installation and selected repository are stored in Supabase. Unit 09 implementation and automated verification are complete, but the real webhook secret is not present in `.env.local` and live GitHub deliveries have not been manually verified. Unit 09 therefore remains in progress. Unit 10 has not begun.

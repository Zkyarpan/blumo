# Blumo — Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Planning complete.
- Unit 01: Project Foundation — complete.
- Unit 02: Supabase Auth — complete.
- **Unit 03: Core Database Schema and RLS — in progress.**

## Current Goal

- Implement Unit 03: Core Database Schema and RLS.

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

## In Progress

- Unit 03: Core Database Schema and RLS.

## Next Up

1. Unit 03: Core Database Schema and RLS — profiles table, migrations, RLS policies.

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

## Session Notes

The project currently contains planning documents only. No application code, Supabase schema, GitHub App, or Vercel deployment has been created.

Begin with Unit 01. Do not start authentication or database work until the foundation unit is complete and verified.

# Blumo — Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Planning complete.
- Project implementation not started.

## Current Goal

- Create the Blumo repository and complete Unit 01: Project Foundation.

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

## In Progress

- None.

## Next Up

1. Create a new GitHub repository named `blumo`.
2. Create the Next.js application.
3. Copy this planning pack into the repository.
4. Implement `context/specs/01-project-foundation.md`.

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

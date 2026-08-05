# Blumo

> **Grow every day.**

Blumo is an AI-powered developer consistency platform for students and early-career developers. It turns a user's learning goal into one small, meaningful daily mission, lets the user complete or edit the work, and creates a user-approved contribution in a selected GitHub repository.

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run all checks before committing
npm run lint
npm run typecheck
npm run test
npm run build
```

| Command | Description |
|---|---|
| `npm run dev` | Start the development server at `http://localhost:3000` |
| `npm run build` | Build the production bundle |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking (no output) |
| `npm run test` | Run the Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |

See the [`context/`](./context/) folder for full product, architecture, security, and implementation documentation.

Mission generation uses a server-only Pollinations secret. Copy `.env.example`
to `.env.local`, set `POLLINATIONS_API_KEY`, and optionally override
`POLLINATIONS_TEXT_MODEL` (the default is `openai`). Never prefix either value
with `NEXT_PUBLIC_`.

## Auto-Commit Daily Missions (UK / London Time)

Blumo automatically generates and commits a daily learning mission to GitHub
every day at **09:00 AM London time** (09:00 GMT in winter, 10:00 BST in summer).
The system uses `Europe/London` as the schedule timezone so it adjusts
automatically for daylight saving time — no manual changes needed.

### How it works

1. **Vercel Cron** in [`vercel.json`](./vercel.json) triggers `GET /api/cron/daily-missions` at `09:00 UTC`.
2. **GitHub Actions** in [`.github/workflows/daily-missions.yml`](.github/workflows/daily-missions.yml) provides a reliable fallback at the same time.
3. The route finds all users with a due auto-commit schedule and runs the generate → auto-approve → commit pipeline for each.

### Required setup — Vercel Production environment variables

These must be set in **Vercel → Project → Settings → Environment Variables** under the **Production** environment:

| Variable | Where to get it |
|---|---|
| `CRON_SECRET` | Same value as in your `.env.local` — generate with `openssl rand -hex 32` |
| All other vars from `.env.example` | As documented in `.env.example` |

> ⚠️ If `CRON_SECRET` is not set on Vercel Production, every cron invocation returns **401 Unauthorized** and no commits are triggered.

### Required setup — GitHub Actions secrets

In **GitHub → Repository → Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `BLUMO_APP_URL` | Your Vercel production URL, e.g. `https://blumo-ten.vercel.app` |
| `CRON_SECRET` | Same value as the Vercel `CRON_SECRET` |

### User timezone setup

When a user completes onboarding or updates their schedule:

- Timezone defaults to **Europe/London** (covers both GMT and BST automatically).
- The auto-commit schedule stores the user's chosen local time and timezone.
- After each commit, the next run is recalculated to the same local clock time, so it stays at e.g. 09:00 AM London even across BST/GMT transitions.

If an existing user's timezone is set to `UTC` (not London), they will see a
warning in **Settings → Auto-commit** prompting them to go to Onboarding and
select **Europe/London — United Kingdom**.

## Supabase Keep-Alive

Production includes a protected Vercel Cron request to
`/api/cron/supabase-keep-alive` every day at `03:17 UTC`. The route performs one
minimal Supabase database query and does not return database data.

Generate a random `CRON_SECRET` with at least 32 characters and configure the
same value in:

- local ignored `.env.local`; and
- Vercel project settings for the Production environment.

Vercel automatically sends this value as
`Authorization: Bearer <CRON_SECRET>` when invoking the cron route. Never commit
the real value or place it in a URL.

Blumo is not a fake-commit generator. Its product value is helping developers learn consistently, produce useful work, document progress, and build credible evidence of growth.

## Product Summary

A Blumo user:

1. Signs in with GitHub.
2. Chooses a development goal, skill level, preferred task type, and available daily time.
3. Installs the Blumo GitHub App on selected repositories.
4. Receives or generates a small daily mission.
5. Completes or edits the task.
6. Reviews the exact file, content, and commit message.
7. Approves the contribution.
8. Sees the GitHub commit and progress history inside Blumo.

## Main Tagline

**Grow every day.**

Supporting message:

> Small, meaningful developer missions that help you learn, build, and stay consistent.

## MVP Technology Stack

| Area | Technology |
|---|---|
| Application | Next.js App Router + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Forms and validation | React Hook Form + Zod |
| Authentication | Supabase Auth with GitHub |
| Database | Supabase PostgreSQL |
| Authorization | Supabase Row Level Security |
| Repository access | GitHub App |
| GitHub API | Octokit |
| AI | Pollinations behind a provider interface |
| Auth email delivery | Supabase Auth through Resend SMTP |
| Product emails | Resend API |
| Hosting | Vercel |
| Scheduled work, later | Supabase Cron + Edge Functions |
| Testing | Vitest + Testing Library; Playwright for key flows |
| Analytics, later | PostHog |
| Error monitoring, later | Sentry |
| Payments, later | Stripe |

## Why Authentication Has Two Steps

For the MVP, Blumo uses two separate but related GitHub flows:

1. **Continue with GitHub through Supabase Auth**
   - Identifies the user.
   - Creates and manages the Blumo website session.
   - Does not give Blumo permission to change repositories.

2. **Install the Blumo GitHub App**
   - Lets the user choose which repositories Blumo may access.
   - Grants only the required repository permissions.
   - Allows Blumo to request short-lived installation tokens when an approved contribution is created.

This separation is easier to build, explain, test, and secure for the first release.

## Repository Safety Model

During the MVP, Blumo may write only inside:

```text
blumo/**
```

Examples:

```text
blumo/README.md
blumo/learning/2026-07-19-react-state.md
blumo/challenges/2026-07-20-array-methods.md
blumo/progress/summary.json
```

Blumo must block changes to sensitive paths including:

```text
.env
.env.*
.github/**
credentials/**
secrets/**
node_modules/**
```

All MVP contributions require explicit user approval.

## Folder Structure for This Planning Pack

```text
blumo-planning-pack/
├── README.md
├── CLAUDE.md
├── AGENTS.md
├── .env.example
├── context/
│   ├── project-overview.md
│   ├── architecture.md
│   ├── database-schema.md
│   ├── security-model.md
│   ├── email-and-notifications.md
│   ├── ui-context.md
│   ├── code-standards.md
│   ├── ai-workflow-rules.md
│   ├── progress-tracker.md
│   └── specs/
│       ├── 00-build-plan.md
│       └── 01-project-foundation.md
└── docs/
    ├── how-to-start.md
    ├── github-app-setup.md
    └── resend-supabase-setup.md
```

## How to Start

Read and follow:

```text
docs/how-to-start.md
```

The first implementation unit is:

```text
context/specs/01-project-foundation.md
```

Do not build every feature at once. Complete one build unit, verify it, update the progress tracker, and only then create the next unit specification.

## First Working Milestone

The first real Blumo milestone is:

```text
Sign in with GitHub
→ Complete onboarding
→ Install Blumo GitHub App
→ Select one repository
→ Generate one AI learning note
→ Edit and preview it
→ Approve the contribution
→ Open the successful commit on GitHub
```

## Product Principles

1. Meaningful progress is more important than contribution count.
2. AI assists the user; it does not impersonate the user.
3. Users see and approve changes before Blumo writes to GitHub.
4. Blumo requests the minimum GitHub permissions required.
5. Repository files and AI output are treated as untrusted input.
6. The MVP remains deliberately small until the complete core flow works.
.

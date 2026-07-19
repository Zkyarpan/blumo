# Blumo — Architecture Context

## Architecture Summary

Blumo is a Next.js application deployed on Vercel, using Supabase for authentication and PostgreSQL data, a GitHub App for selected-repository access, Pollinations as the first AI provider behind a replaceable adapter, and Resend for authentication and product email. The MVP performs task generation and GitHub commits through server-only application boundaries. Scheduled task generation is introduced only after the manual workflow is stable.

## Stack

| Layer | Technology | Role |
|---|---|---|
| Web framework | Next.js App Router + TypeScript | UI, server rendering, route handlers, and application composition |
| Styling | Tailwind CSS | Token-based responsive styling |
| UI components | shadcn/ui | Accessible reusable interface primitives |
| Icons | Lucide React | Consistent stroke-based icons |
| Forms | React Hook Form | Client form state and submission handling |
| Validation | Zod | Validate forms, API input, webhooks, environment variables, and AI output |
| Website authentication | Supabase Auth with GitHub | User identity and secure Blumo sessions |
| Database | Supabase PostgreSQL | Profiles, goals, installations, repositories, tasks, commits, schedules, and audit records |
| Authorization | Supabase Row Level Security | User-level database isolation |
| Database server client | Supabase server client | Server-side authenticated data access |
| Repository authorization | GitHub App | Fine-grained access to selected repositories |
| GitHub API | Octokit | Installation authentication and repository operations |
| AI abstraction | Internal `AIProvider` interface | Prevent provider lock-in |
| Initial AI provider | Pollinations | Task, note, feedback, and summary generation |
| Authentication email | Resend SMTP through Supabase | Confirmation, password, and security email delivery when needed |
| Product email | Resend API | Welcome, task, progress, and connection notifications |
| Hosting | Vercel | Next.js deployment and environment management |
| Scheduling, Phase 2 | Supabase Cron | Periodic schedule evaluation |
| Background work, Phase 2 | Supabase Edge Functions | Generate due task drafts and send notifications |
| Unit testing | Vitest + Testing Library | Logic and component verification |
| End-to-end testing | Playwright | Critical user journeys |
| Analytics, later | PostHog | Activation and retention events |
| Error monitoring, later | Sentry | Production error reporting |
| Billing, later | Stripe | Subscription and webhook handling |

## High-Level Flow

```text
Browser
  │
  ├── GitHub sign-in
  ▼
Supabase Auth
  │
  ▼
Next.js application on Vercel
  │
  ├── Supabase PostgreSQL + RLS
  ├── Pollinations AI adapter
  ├── Resend API
  └── GitHub App authentication
          │
          ▼
Selected GitHub repository
```

## Authentication and Repository Access

### Website Authentication

Supabase Auth with the GitHub provider owns:

- OAuth redirect handling.
- User identity.
- Session cookies.
- Login and logout.
- Authenticated user retrieval.

Website authentication does not itself grant repository write access.

### GitHub Repository Access

The Blumo GitHub App owns:

- Selected-repository installation.
- Fine-grained repository permissions.
- Installation lifecycle events.
- Short-lived installation access tokens.
- Repository listing and commit operations.

The application stores the installation ID and repository metadata. It does not persist installation access tokens.

## System Boundaries

### Application Routes

- `src/app/(marketing)/` — public landing, product information, and legal pages.
- `src/app/(auth)/` — login and authentication callback pages.
- `src/app/(app)/` — authenticated dashboard, onboarding, tasks, history, and settings.
- `src/app/api/` — HTTP boundaries for GitHub setup/webhooks, AI generation, commits, and email-triggering endpoints.

### Feature Modules

- `src/features/auth/` — Blumo session helpers and auth-oriented UI.
- `src/features/onboarding/` — onboarding form, schemas, and preference service.
- `src/features/github/` — installation flow, repository selection, and connection UI.
- `src/features/tasks/` — task generation, draft editing, validation, and task state.
- `src/features/commits/` — approval, path validation, GitHub write operation, and result display.
- `src/features/progress/` — history, streak calculation, and weekly summaries.
- `src/features/settings/` — account, preferences, repository connection, and email preferences.

Feature modules may compose shared utilities but must not access another feature's internal files directly.

### Shared Libraries

- `src/lib/supabase/` — browser, server, admin, and middleware Supabase clients.
- `src/lib/github/` — GitHub App authentication, installation tokens, Octokit clients, webhook verification, and low-level API calls.
- `src/lib/ai/` — provider interface, Pollinations adapter, prompts, and output schemas.
- `src/lib/email/` — Resend client, templates, send functions, and email types.
- `src/lib/security/` — safe-path checks, limits, secret-pattern scanning, rate-limit helpers, and audit metadata.
- `src/lib/validation/` — shared Zod schemas.
- `src/lib/env/` — environment validation.
- `src/lib/utils/` — small framework-independent utilities only.

### UI

- `src/components/ui/` — shadcn-generated primitives. Treat as protected.
- `src/components/shared/` — reusable Blumo-specific presentation components.
- `src/components/layout/` — application shell, navigation, headers, and responsive containers.

### Database and Functions

- `supabase/migrations/` — versioned SQL schema and policy changes.
- `supabase/functions/` — scheduled/background Edge Functions introduced in Phase 2.
- `supabase/seed.sql` — local-only seed data when needed.

### Project Context

- `context/` — product and technical truth.
- `context/specs/` — one active implementation specification at a time.
- `docs/` — human setup and operational guides.

## Storage Model

### PostgreSQL

Store:

- User profile and preferences.
- GitHub installation metadata.
- Accessible and selected repository metadata.
- Learning goals.
- Daily tasks and generated structured content.
- User-edited task content.
- Schedules.
- Commit metadata.
- Email preferences and delivery event identifiers.
- AI usage records.
- Audit events.

### GitHub Repository

Store user-approved artifacts only:

- Markdown learning notes.
- Challenge files.
- Progress summaries.
- Optional Blumo README.

The repository is the source of truth for committed artifact content after commit creation. The database stores the submitted snapshot required for history and audit.

### Object Storage

Not required for the MVP. Introduce Supabase Storage only when Blumo supports profile uploads, generated images, or larger artifacts.

### Cache and Queue

Not required for the first manual MVP. Introduce a queue or managed workflow service only after scheduled usage exceeds what the simple database job model can reliably process.

## AI Model

### AI Provider Interface

All feature code calls a provider-neutral interface:

```ts
interface AIProvider {
  generateDailyTask(input: GenerateDailyTaskInput): Promise<GeneratedDailyTask>;
  reviewTask(input: ReviewTaskInput): Promise<TaskReview>;
  generateWeeklySummary(input: WeeklySummaryInput): Promise<WeeklySummary>;
}
```

The Pollinations adapter implements this interface.

### AI Input Rules

For the MVP, send only:

- User goal.
- Selected technology.
- Experience level.
- Available time.
- Task type.
- Recent completed-task titles when required for repetition avoidance.

Do not send private repository source code.

### AI Output Rules

AI must return a structured object containing:

- Title.
- Summary.
- Instructions.
- Acceptance checklist.
- Suggested safe path.
- Markdown draft.
- Commit message.
- Skill tags.
- Estimated minutes.

Validate every response with Zod before storage or display.

## Commit Architecture

```text
Authenticated user approves
  ↓
Server loads task and selected repository
  ↓
Server verifies ownership and task state
  ↓
Server validates path, content, size, and commit message
  ↓
Server verifies installation/repository relationship
  ↓
Server requests short-lived installation token
  ↓
Server reads existing target file when required
  ↓
Server creates or updates the file
  ↓
Server records commit result and audit event
```

The commit endpoint must be idempotent. A task may have at most one successful MVP commit record.

## Email Architecture

- Supabase Auth emails use Resend SMTP with `no-reply@mail.arpankarki.com.np`.
- Product emails use the Resend API through server-only functions.
- Email sender names and reply handling are documented in `email-and-notifications.md`.
- Authentication email and application email API keys are separate.
- Email sending failures do not roll back an already successful GitHub commit.

## Scheduling Architecture — Phase 2

1. Supabase Cron invokes one Edge Function at a fixed interval.
2. The function queries due active schedules using UTC `next_run_at`.
3. It claims due rows atomically to prevent duplicate processing.
4. It creates pending task-generation jobs.
5. It calls the AI adapter.
6. It records success or retry information.
7. It sends a mission-ready email.
8. The user still reviews and approves the contribution.

Do not create one cron definition per user.

## API Response Convention

Successful response:

```json
{
  "data": {},
  "error": null
}
```

Failure response:

```json
{
  "data": null,
  "error": {
    "code": "SAFE_PATH_REQUIRED",
    "message": "Blumo can only write inside the blumo directory."
  }
}
```

Do not expose provider secrets, raw stack traces, private keys, or unfiltered third-party errors.

## Invariants

1. Client code never receives the Supabase service-role key, GitHub App private key, GitHub client secret, webhook secret, Resend secret key, or Pollinations secret key.
2. Every mutation verifies the authenticated user and resource ownership on the server.
3. RLS is enabled on every user-owned table before production data is introduced.
4. GitHub installation access tokens are generated only when required and are never stored permanently.
5. The setup callback never trusts an `installation_id` query parameter without server-side verification.
6. GitHub webhook payloads are processed only after signature verification.
7. MVP repository writes are limited to normalized paths under `blumo/**`.
8. MVP contributions require explicit user approval.
9. AI output and repository input are treated as untrusted and validated before use.
10. AI generation routes do not create GitHub commits.
11. Commit routes do not generate AI content.
12. Scheduled jobs generate drafts or reminders; they do not bypass the approval model.
13. A task cannot produce more than one successful MVP commit.
14. Email delivery failure cannot change a successful task or commit into a failed GitHub operation.
15. Architecture, scope, and security changes are documented before implementation proceeds.

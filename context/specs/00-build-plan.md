# Blumo — Complete Build Plan

Each unit must produce one visible or verifiable result. Implement one unit at a time. Write or refine the detailed unit specification immediately before starting that unit.

## Phase 1 — Product Foundation

### Unit 01: Project Foundation

Build:

- Next.js TypeScript application.
- Tailwind and shadcn/ui foundation.
- Environment validation skeleton.
- Route groups.
- Base theme tokens.
- Landing placeholder and authenticated-app placeholder.
- Lint, typecheck, test, and build scripts.

Dependencies:

- None.

Result:

- The project runs locally and displays the Blumo visual foundation.

### Unit 02: Supabase Project and GitHub Sign-In

Build:

- Supabase browser/server clients.
- GitHub provider login.
- Auth callback.
- Session refresh.
- Protected app route.
- Logout.

Dependencies:

- Unit 01.

Result:

- A user can sign in with GitHub, view a protected page, refresh, and sign out.

### Unit 03: Core Database Schema and RLS

Build:

- Initial migrations for profiles, goals, installations, repositories, tasks, and commits.
- Profile creation.
- RLS policies.
- Database constraints.
- Generated database types.

Dependencies:

- Unit 02.

Result:

- Two test users cannot access each other's data.

### Unit 04: Onboarding

Build:

- Goal, technology, experience, daily minutes, task type, and timezone form.
- Server-side validation.
- Saved onboarding state.
- Redirect completed users to dashboard.

Dependencies:

- Unit 03.

Result:

- A new user completes onboarding and sees persisted preferences.

### Unit 05: Dashboard Shell

Build:

- Responsive navigation.
- Today's mission empty state.
- Goal summary.
- GitHub connection state.
- Recent activity empty state.
- Settings link.

Dependencies:

- Unit 04.

Result:

- An onboarded user sees a polished responsive dashboard using stored profile and goal data.

## Phase 2 — GitHub Connection

### Unit 06: GitHub App Registration and Installation Start

Build:

- GitHub App configuration.
- Server-only GitHub App authentication module.
- Connect-repository page.
- Installation-start URL.
- Environment validation.

Dependencies:

- Unit 05.

Result:

- A signed-in user can leave Blumo and open the GitHub installation screen.

### Unit 07: Installation Setup Callback and Verification

Build:

- Setup callback.
- Verification of installation identity.
- Installation metadata storage.
- Safe callback states.
- Audit event.

Dependencies:

- Unit 06.

Result:

- A verified installation is associated with the correct Blumo user.

### Unit 08: Repository Sync and Selection

Build:

- Short-lived installation token generation.
- Accessible repository listing.
- Repository metadata sync.
- Select one active repository.
- Removed-access state.

Dependencies:

- Unit 07.

Result:

- The user selects one repository that the installation can actually access.

### Unit 09: GitHub Webhook Lifecycle

Build:

- Raw-body signature verification.
- Installation lifecycle events.
- Installation-repositories lifecycle events.
- Idempotency by delivery ID.
- Connection-state UI updates.

Dependencies:

- Unit 07 and Unit 08.

Result:

- Removing repository access or uninstalling the App disables Blumo actions.

## Phase 3 — AI Mission Workflow

### Unit 10: AI Mission Generation

Build:

- `AIProvider` interface.
- Pollinations adapter.
- Versioned structured prompt using the active goal, selected repository metadata,
  recent completed missions, and experience level.
- Strict mission Zod output and deterministic safety validation.
- Safe provider error mapping.
- Timeout and bounded transient retry handling.
- Authenticated generation action with ownership checks.
- Atomic one-mission-per-user-local-day persistence and bounded retry claims.
- Usage and sanitized audit records.
- Dashboard empty, loading, success, error, and retry states.

Dependencies:

- Units 05 and 09.

Result:

- A user generates, saves, and views one validated daily mission without any
  repository content read or GitHub write.

### Unit 11: Mission Review and Approval

Build:

- Read-only review page for the generated mission and verified repository.
- Explicit approve and reject actions with atomic server-side transitions.
- Optional sanitized rejection reason and required safe regeneration feedback.
- Immutable mission versions and bounded, duplicate-safe regeneration.
- Approval/rejection/regeneration audit events.
- Approved placeholder handoff to the later task workspace.

Dependencies:

- Unit 10 and a reviewed, merged Unit 11 specification.

Result:

- A user reviews AI-generated mission content, approves or rejects it, and may
  request a bounded replacement without any GitHub write.

### Unit 12: Task Workspace

Build:

- Instructions and acceptance checklist.
- Markdown editor.
- Preview.
- Editable safe path.
- Editable commit message.
- Save draft.
- Ready-for-review state.

Dependencies:

- Unit 10 and a reviewed decision for the reserved Unit 11 slot.

Result:

- A user can edit and preview the exact artifact they intend to contribute.

## Phase 4 — Approved GitHub Contribution

### Unit 13: Commit Review and Validation

Build:

- Review page.
- Repository and branch display.
- Safe-path validator.
- File-size and commit-message limits.
- Secret-pattern warning.
- Approval action.

Dependencies:

- Unit 08 and Unit 12.

Result:

- Invalid or unsafe submissions are rejected before any GitHub write.

### Unit 14: GitHub Commit Creation

Build:

- Installation token on demand.
- Existing-file SHA lookup.
- Create/update file operation.
- Idempotent task commit.
- Commit record.
- Success and recoverable failure states.

Dependencies:

- Unit 13.

Result:

- A user approves one artifact and opens the resulting GitHub commit.

### Unit 15: History and Basic Progress

Build:

- Mission history.
- Commit links.
- Completed count.
- Basic streak calculation.
- Goal progress summary.

Dependencies:

- Unit 14.

Result:

- The user can view credible progress based on actual completed tasks.

## Phase 5 — Email and Production Readiness

### Unit 16: Resend and Supabase Auth SMTP

Build:

- Separate Resend Auth key.
- Supabase custom SMTP.
- Sender configuration.
- Auth template review.
- Test delivery.

Dependencies:

- Unit 02.

Result:

- Supabase authentication emails are delivered through the verified Blumo sender.

### Unit 17: Product Emails

Build:

- Separate product-email key.
- Server-only Resend client.
- Welcome email.
- GitHub-connected email.
- Connection-alert email.
- Email preferences.

Dependencies:

- Unit 04 and Unit 09.

Result:

- Transactional product emails send without exposing credentials.

### Unit 18: Automated Verification

Build:

- Unit tests for security/domain logic.
- RLS integration tests.
- Critical Playwright journeys.
- CI checks.

Dependencies:

- Units 03, 13, and 14.

Result:

- The core workflow has repeatable automated checks.

### Unit 19: Vercel Production Deployment

Build:

- Production environment variables.
- Supabase production URLs.
- GitHub App production URLs.
- Resend sender tests.
- Protected daily Supabase keep-alive cron.
- Security headers.
- Error pages.
- Basic operational checklist.

Dependencies:

- Unit 18.

Result:

- Blumo is deployed and the core flow works in production.

### Unit 20: Private Beta

Build:

- Feedback collection.
- Small invite process.
- Product analytics events.
- Error monitoring.
- Beta issue triage.

Dependencies:

- Unit 19.

Result:

- At least five external users attempt the full workflow and feedback is recorded.

## Phase 6 — After MVP Validation

Do not start these until the beta proves the core flow.

### Unit 21: Scheduled Mission Generation

- Supabase Cron.
- Edge Function.
- Due-schedule claiming.
- Mission-ready email.
- No automatic commit.

### Unit 22: Weekly Progress Email

- Real completed-task aggregation.
- AI-supported summary.
- User preferences.
- Idempotent delivery.

### Unit 23: Public Progress Profile

- Opt-in only.
- Privacy controls.
- Shareable progress page.

### Unit 24: Pull Request Mode

- Branch creation.
- Pull-request permission.
- Diff review.
- User merge.

### Unit 25: Billing

- Free and paid entitlements.
- Stripe checkout and webhooks.
- Usage enforcement.

## Explicitly Deferred

- Automatic direct commits.
- Repository-wide AI code analysis.
- Code execution.
- VS Code extension.
- Mobile application.
- Teams and classrooms.

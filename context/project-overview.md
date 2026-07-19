# Blumo — Project Overview

## Overview

Blumo is an AI-powered developer consistency platform for students, self-taught programmers, bootcamp learners, and early-career developers. It converts a user's development goal into small, achievable daily missions, helps the user complete and document the work, and creates a meaningful, user-approved contribution in a selected GitHub repository. Blumo solves the problem of inconsistent learning, uncertainty about what to build next, weak progress documentation, and portfolios that do not clearly show continuous improvement.

## Mission

Help developers grow through small, meaningful progress every day.

## Product Positioning

Blumo is a developer growth coach connected to GitHub. It is not positioned as a tool for manufacturing contribution-graph activity.

## Primary User

The primary MVP user is a student or junior developer who:

- Wants to become job-ready.
- Struggles to stay consistent.
- Does not always know what to learn or build next.
- Wants useful GitHub activity and a stronger portfolio.
- Has between 10 and 60 minutes available on selected days.

## Goals

1. Allow a new user to sign in, complete onboarding, and reach a generated first mission in under ten minutes.
2. Allow a user to connect only selected GitHub repositories through a GitHub App.
3. Generate a specific mission appropriate to the user's technology, level, available time, and task preference.
4. Require the user to review and approve the exact file content and commit message before a contribution is created.
5. Record every generated task and successful commit so progress can be viewed inside Blumo.
6. Restrict MVP GitHub writes to the `blumo/**` directory.
7. Provide clear failure messages and recovery when AI generation, GitHub access, or commit creation fails.
8. Validate the complete workflow with a small private beta before adding automatic scheduling or payments.

## Core User Flow

1. The visitor opens the Blumo landing page.
2. The visitor selects **Continue with GitHub**.
3. Supabase Auth completes GitHub OAuth and creates the Blumo session.
4. The new user completes onboarding:
   - development goal
   - technology
   - experience level
   - daily time
   - preferred task type
   - timezone
5. The user opens **Connect GitHub**.
6. The user installs the Blumo GitHub App.
7. The user chooses only the repositories Blumo may access.
8. Blumo verifies and stores the installation and accessible repository metadata.
9. The user selects one active repository.
10. The user selects **Generate today's mission**.
11. Blumo sends structured goal context to the configured AI provider.
12. Blumo validates and stores the generated task.
13. The user reads the mission, edits the generated Markdown, and previews the final result.
14. Blumo shows:
    - repository
    - branch
    - target file path
    - complete file content
    - commit message
15. The user explicitly selects **Approve and commit**.
16. The server checks authentication, ownership, installation access, path rules, file limits, and content safety.
17. The server requests a short-lived GitHub App installation token.
18. The server creates or updates the approved file.
19. Blumo stores the commit SHA, URL, file path, and task completion time.
20. The success screen links to the GitHub commit and updates the user's progress.

## MVP Features

### Identity and Onboarding

- GitHub sign-in through Supabase Auth.
- Protected application routes.
- First-time onboarding.
- Editable profile, timezone, and learning preferences.
- Account logout and deletion request flow.

### GitHub Connection

- Install the Blumo GitHub App.
- Select repository access on GitHub.
- Store installation metadata, not permanent installation tokens.
- List repositories available to the installation.
- Select one active repository.
- Detect repository removal or app uninstallation.
- Disconnect GitHub from Blumo.

### AI Missions

- Generate a mission based on:
  - goal
  - technology
  - experience level
  - available minutes
  - task type
- Initial task types:
  - learning note
  - small coding challenge
  - documentation task
  - interview-preparation note
- Structured AI output validated with Zod.
- Regenerate with a small usage limit.
- Clear AI failure state.

### Task Workspace

- Task instructions.
- Editable Markdown content.
- Markdown preview.
- Suggested safe file path.
- Editable commit message.
- Save draft.
- Approve and commit.

### Progress

- Completed-task count.
- Basic current streak based on scheduled or selected active days.
- Recent mission history.
- GitHub commit links.
- Weekly summary generated from real completed tasks.

### Email

- Supabase Auth emails sent through Resend SMTP.
- Welcome email.
- Daily mission-ready reminder after scheduling is introduced.
- Weekly progress summary.
- Repository-disconnected notification.
- Support sender with replies routed to the founder's support inbox.

## Scope

### In Scope for MVP

- Responsive web application.
- GitHub-only website login.
- One GitHub App installation per user account for the initial release.
- One active learning goal.
- One active repository.
- Manual AI task generation.
- User editing and approval.
- Direct commits only inside `blumo/**`.
- Markdown-based learning and challenge artifacts.
- Commit history and basic progress.
- Resend email integration.
- Vercel deployment.
- Supabase PostgreSQL and RLS.
- Private beta with a small number of users.

### Deliberately Out of Scope for MVP

- Fully automatic daily commits.
- Unrestricted changes to existing application source code.
- Direct writes outside `blumo/**`.
- Repository-wide AI analysis.
- Pull-request generation.
- Code execution or sandboxing.
- Automatic testing of generated code.
- Team, classroom, or bootcamp dashboards.
- Public social feed.
- Mobile application.
- VS Code extension.
- Multiple active repositories.
- Multiple active goals.
- Paid subscriptions.
- Referral programme.
- Certificates.
- AI provider selection in the UI.
- Guaranteed GitHub contribution-graph results.
- Organization administration.
- GitHub Actions or workflow-file modification.

## Product Rules

1. A task may be generated automatically later, but a code or content contribution is never presented as user work without the user's knowledge.
2. The user must be shown the exact target repository, path, content, and commit message before an MVP commit.
3. Blumo never requests or stores a user's GitHub password or personal access token.
4. AI-generated content is always treated as untrusted until validated.
5. Repository content is never sent to an AI provider unless a future repository-aware feature receives separate, explicit consent.
6. Product messaging focuses on learning and progress rather than gaming GitHub activity.

## Success Criteria

The MVP is considered ready for private beta when:

1. A new user can sign in with GitHub and return to a protected dashboard.
2. A new user can complete onboarding and edit saved preferences.
3. A user can install the Blumo GitHub App on a selected repository.
4. Blumo can securely list only repositories available to that installation.
5. A user can generate a structured mission and receive a valid result.
6. A user can edit and preview the generated Markdown.
7. The server rejects target paths outside `blumo/**`.
8. A user can approve a contribution and open the resulting GitHub commit.
9. The commit record is associated with the correct authenticated Blumo user.
10. Removing repository access prevents future writes.
11. Supabase RLS prevents one user from reading or changing another user's records.
12. No secret appears in browser bundles, logs, generated files, or committed source.
13. The key user flow works on mobile and desktop.
14. Automated checks and the production build pass.
15. At least five beta users complete the full flow and provide feedback.

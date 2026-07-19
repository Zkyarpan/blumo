# How to Start Building Blumo

Follow these steps in order. Do not begin with AI, GitHub commits, scheduling, or payments.

## Step 1: Create the GitHub Repository

Create a repository:

```text
blumo
```

Recommended settings:

- Private while building.
- Add no generated README if you want `create-next-app` to initialize cleanly.
- Do not add a licence until you decide whether the project will be open source.

Clone it:

```bash
git clone <your-repository-url>
cd blumo
```

## Step 2: Create the Next.js Application

If the repository is empty:

```bash
npx create-next-app@latest .
```

Choose:

```text
TypeScript: Yes
ESLint: Yes
Tailwind CSS: Yes
Use src directory: Yes
App Router: Yes
Turbopack for dev: choose the stable default offered
Import alias: @/*
```

Run:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Commit the untouched framework foundation:

```bash
git add .
git commit -m "chore: initialize Blumo application"
git push
```

## Step 3: Copy the Planning Pack

Copy into the repository root:

```text
CLAUDE.md
AGENTS.md
.env.example
context/
docs/
```

Replace or merge the generated root README with the Blumo README from this pack.

Commit:

```bash
git add .
git commit -m "docs: add Blumo product and architecture context"
git push
```

## Step 4: Read Before Coding

Read:

1. `context/project-overview.md`
2. `context/architecture.md`
3. `context/database-schema.md`
4. `context/security-model.md`
5. `context/ui-context.md`
6. `context/code-standards.md`
7. `context/ai-workflow-rules.md`
8. `context/progress-tracker.md`
9. `context/specs/01-project-foundation.md`

## Step 5: Create the Local Environment File

Copy:

```bash
cp .env.example .env.local
```

For Unit 01, fill only:

```env
NEXT_PUBLIC_APP_NAME=Blumo
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Never commit `.env.local`.

Confirm `.gitignore` includes:

```text
.env*
!.env.example
```

## Step 6: Implement Unit 01

Give your coding agent this instruction:

```text
Read CLAUDE.md and all referenced context files.
Read context/specs/01-project-foundation.md.
Update context/progress-tracker.md to mark Unit 01 in progress.
Implement exactly Unit 01.
Do not add Supabase, GitHub, AI, Resend, scheduling, or payments.
Run the full verification checklist and stop.
```

Review the output manually.

Then use:

```text
The implementation is complete and I have reviewed it.
Run the Unit 01 verification checklist.
Fix only failures inside Unit 01 scope.
When everything passes, update context/progress-tracker.md and stop.
```

## Step 7: Create Supabase Only After Unit 01

After Unit 01 passes:

1. Create a Supabase project.
2. Store the database password safely.
3. Copy the project URL and publishable key.
4. Configure the GitHub provider in Supabase Auth.
5. Write `context/specs/02-supabase-auth.md` before implementing authentication.

Do not create all database tables manually in the dashboard. Use versioned migrations during Unit 03.

## Step 8: Configure Resend at the Correct Time

Current state:

```text
mail.arpankarki.com.np is verified in Resend.
```

Next Resend tasks:

1. Create a separate key for Supabase Auth SMTP.
2. Configure Supabase custom SMTP.
3. Send a test Auth email.
4. Create a separate product-email API key later.
5. Store the product key only in server environment settings.

Follow:

```text
docs/resend-supabase-setup.md
```

## Step 9: Create the GitHub App During Unit 06

Do not create broad OAuth repository scopes or ask users for tokens.

Follow:

```text
docs/github-app-setup.md
```

The MVP GitHub App begins with:

```text
Metadata: Read-only
Contents: Read and write
```

The user chooses selected repositories.

## Step 10: Build One Unit at a Time

For each unit:

1. Review the build plan.
2. Write the unit spec.
3. Mark it in progress.
4. Implement only that unit.
5. Verify.
6. Update progress.
7. Commit and push.
8. Stop before the next unit.

Recommended branch format:

```text
feat/01-project-foundation
feat/02-supabase-auth
feat/03-database-rls
```

Recommended commit messages:

```text
feat: add Blumo project foundation
feat: add GitHub sign-in with Supabase
feat: add core schema and RLS policies
```

## Step 11: Definition of the First MVP

Do not call Blumo an MVP until this works in production:

```text
GitHub sign-in
→ onboarding
→ GitHub App installation
→ repository selection
→ mission generation
→ edit and preview
→ approve
→ successful GitHub commit
→ history entry
```

## Step 12: What Not to Build Early

Do not add:

- Automatic daily commits.
- Stripe.
- Team accounts.
- Public profiles.
- Repository-wide AI analysis.
- Code execution.
- A mobile app.
- A VS Code extension.
- Complex achievements.
- Multiple AI providers in the UI.

Prove the core flow first.

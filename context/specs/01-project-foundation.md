# Unit 01: Project Foundation

## Goal

Create the initial Blumo Next.js application with the agreed folder structure, UI tokens, route groups, shared layout foundations, environment validation skeleton, and development-quality scripts. At completion, the project must run locally and show a polished public Blumo landing placeholder plus a separate authenticated-application placeholder without implementing authentication.

## Scope

This unit includes only:

- Next.js project creation.
- Core dependencies.
- Folder structure.
- Theme tokens.
- Basic marketing and app-shell placeholder pages.
- Shared layout components.
- Environment-schema skeleton.
- Test runner foundation.
- Project scripts and verification.

This unit does not include:

- Supabase configuration.
- GitHub login.
- Database schema.
- GitHub App.
- Pollinations calls.
- Resend calls.
- Real dashboard data.

## Design

Follow `context/ui-context.md`.

### Marketing Placeholder

The public home page contains:

- Blumo wordmark text.
- Tagline: **Grow every day.**
- One-sentence product description.
- Primary disabled or placeholder **Start growing** action.
- A simple three-step explanation:
  1. Choose a goal.
  2. Complete a daily mission.
  3. Approve meaningful GitHub progress.
- A small product-principle note: meaningful progress, not fake commits.

The page must look complete enough to validate the visual direction, but it is not the final marketing site.

### Application Placeholder

Create an authenticated-app route-group placeholder at `/dashboard` without protection in this unit.

Display:

- Application navigation shell.
- Blumo mark.
- Dashboard title.
- Today's mission placeholder card.
- GitHub connection placeholder card.
- Progress placeholder.
- Clear note that data integration is not implemented yet.

### Responsive Behaviour

- Mobile first.
- Marketing navigation stacks cleanly.
- Dashboard navigation uses a simple top layout or responsive shell; do not build the final mobile sheet yet.
- No horizontal overflow at 320px width.

## Implementation

### 1. Create the Application

Use the latest stable `create-next-app` flow with:

- TypeScript.
- ESLint.
- Tailwind CSS.
- App Router.
- `src/` directory.
- Alias `@/*`.

Do not select experimental features that are not required.

### 2. Install Initial Dependencies

Install only:

```text
zod
lucide-react
clsx
tailwind-merge
class-variance-authority
vitest
jsdom
@testing-library/react
@testing-library/jest-dom
```

Initialize shadcn/ui and add only components required by this unit:

```text
button
card
badge
separator
```

### 3. Folder Structure

Create:

```text
src/
├── app/
│   ├── (marketing)/
│   ├── (app)/
│   └── globals.css
├── components/
│   ├── ui/
│   ├── shared/
│   └── layout/
├── features/
├── lib/
│   ├── env/
│   └── utils/
└── types/
```

Do not create empty feature subfolders that have no use in this unit.

### 4. Theme Tokens

Define semantic CSS variables from `context/ui-context.md` in `globals.css`.

Requirements:

- Light theme only.
- Tokens for backgrounds, text, accent, borders, states, focus, and code.
- Body uses page background and primary text.
- Visible focus styles.
- Geist fonts through the framework font system.

### 5. Shared Utilities

Create:

- `src/lib/utils/cn.ts` or the shadcn-equivalent utility.
- `src/lib/env/server.ts` with a server environment Zod schema skeleton.
- `src/lib/env/public.ts` with public environment parsing for:
  - `NEXT_PUBLIC_APP_NAME`
  - `NEXT_PUBLIC_APP_URL`

Do not add service credentials yet.

### 6. Layout Components

Create:

- `MarketingHeader`.
- `MarketingFooter`.
- `AppHeader`.
- `PageContainer`.
- `BlumoWordmark`.

Keep components presentational and typed.

### 7. Routes

Create:

- `/` in the marketing route group.
- `/dashboard` in the app route group.
- Custom not-found page.

The dashboard remains publicly accessible only for this unit. Add an explicit code comment or progress note that protection is introduced in Unit 02; do not create fake auth checks.

### 8. Test Foundation

Configure Vitest with jsdom.

Add at least:

- One test for the Blumo wordmark.
- One test confirming the home page renders the tagline.
- One test for public environment validation.

### 9. Scripts

Ensure `package.json` provides:

```text
dev
build
start
lint
typecheck
test
test:watch
```

`typecheck` runs TypeScript without output.

### 10. Documentation

- Copy the planning pack into the repository.
- Update `context/progress-tracker.md` when implementation starts and finishes.
- Add a short root README section with local commands and a link to the context folder.

## Dependencies

- `zod` — boundary and environment validation.
- `lucide-react` — shared icon system.
- `clsx`, `tailwind-merge`, `class-variance-authority` — component class composition.
- `vitest`, `jsdom`, Testing Library packages — initial automated tests.
- shadcn/ui — accessible component primitives.

## Verify When Done

- [ ] The application starts locally.
- [ ] `/` renders the Blumo name, tagline, product description, and three-step explanation.
- [ ] `/dashboard` renders the application placeholder.
- [ ] Layout works at 320px mobile width.
- [ ] No raw feature-level hex values are used outside the token definition.
- [ ] Geist Sans and Geist Mono are configured.
- [ ] The required folder boundaries exist.
- [ ] No Supabase, GitHub, AI, Resend, scheduler, or payment integration was added.
- [ ] At least three tests pass.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `context/progress-tracker.md` records Unit 01 completion.

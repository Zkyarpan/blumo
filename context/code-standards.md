# Blumo — Code Standards

## General

- Keep modules small, single-purpose, and named by responsibility.
- Fix root causes rather than adding layers of workaround logic.
- Do not combine unrelated concerns in one component, service, or route.
- Prefer explicit code over clever abstractions.
- Create an abstraction only after a real boundary or repeated pattern exists.
- Keep all security-sensitive decisions on the server.
- Treat external input as unknown until validated.
- Use stable domain terms: `goal`, `task`, `installation`, `repository`, `commit`, and `schedule`.
- Do not use `any` to silence TypeScript.
- Delete dead code instead of commenting it out.
- Avoid adding dependencies for behaviour the platform can implement clearly and safely.

## TypeScript

- Enable strict mode.
- Use interfaces or type aliases for domain inputs and outputs.
- Use discriminated unions for state and normalized provider errors.
- Use `unknown` in catch boundaries and narrow safely.
- Use Zod schemas for:
  - environment variables
  - form input
  - API input
  - GitHub webhook payload portions that are used
  - AI responses
  - external provider responses where practical
- Infer TypeScript types from Zod when the schema is the source of truth.
- Avoid non-null assertions unless an invariant is established immediately beforehand.
- Use `satisfies` when validating object shape without widening.
- Prefer named exports except where Next.js requires a default export.

## Next.js

- Use the App Router.
- Default to Server Components.
- Add `"use client"` only for browser state, event handlers, hooks, or client-only libraries.
- Keep secrets and privileged SDKs in server-only modules.
- Add `import "server-only"` to modules that must never enter a client bundle.
- Use route groups to separate marketing, auth, and application layouts.
- Use loading and error boundaries where meaningful.
- Do not fetch protected user data from the browser when a Server Component can fetch it securely.
- Do not place business logic directly in page components or route handlers.
- Use middleware only for lightweight session refresh and route gating; repeat authoritative ownership checks in server mutations.

## Components

- Presentation components receive typed props and do not query the database.
- Feature containers may compose queries, actions, and presentation components.
- Keep a component under roughly 200 lines where practical; split by responsibility, not arbitrary size.
- Avoid deeply nested conditional rendering.
- Build loading, empty, error, and success states intentionally.
- Do not duplicate shadcn primitives.
- Keep feature-only components inside the feature folder.
- Move components to `components/shared` only when they are genuinely reused across features.

## Styling

- Use Tailwind utility classes and tokens defined in `ui-context.md`.
- Do not hardcode feature colours when a semantic token exists.
- Follow the radius scale.
- Use `cn()` for conditional class composition.
- Use responsive design from the first implementation.
- Do not use inline styles except for dynamic values that cannot be expressed cleanly through classes.
- Respect reduced-motion preferences.
- Use consistent content-width containers.

## Forms

- Use React Hook Form for multi-field interactive forms.
- Use Zod as the validation source of truth.
- Display field-specific errors near the field.
- Disable duplicate submission while a mutation is pending.
- Preserve user input after recoverable errors.
- Normalize text before submission where appropriate.
- Never trust hidden fields for user identity or ownership.

## Server Actions and Route Handlers

Use Server Actions for authenticated application mutations when they simplify the flow and do not need a public HTTP endpoint.

Use Route Handlers for:

- OAuth/setup callbacks.
- GitHub webhooks.
- External provider callbacks.
- Cron endpoints.
- APIs requiring a stable HTTP boundary.

Every mutation boundary must:

1. Authenticate or verify the external signature.
2. Validate input.
3. Verify ownership and related-resource consistency.
4. Apply rate or idempotency checks.
5. Call a domain service.
6. Return a normalized result.
7. Record an audit event where required.

## API Results

Use normalized results:

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
```

Never return raw provider errors to the browser.

## Database

- Add schema changes through versioned SQL migrations.
- Enable RLS in the same migration that creates a user-owned table.
- Use database constraints for important invariants.
- Avoid client-side joins that expose unrelated records.
- Select only required columns.
- Use transactions for multi-row state changes.
- Use UTC timestamps and store user timezone separately.
- Preserve historical commit records when repository access changes.
- Do not store temporary GitHub tokens.

## GitHub Integration

- Keep low-level Octokit calls in `src/lib/github`.
- Keep user-flow orchestration in feature services.
- Generate installation tokens only on the server.
- Verify installation and repository relationship before each write.
- Normalize and validate repository paths.
- Read an existing file SHA before updating it.
- Make commit creation idempotent by task.
- Do not modify `.github/**` in the MVP.
- Do not assume the default branch is `main`.

## AI Integration

- Feature code depends on the `AIProvider` interface.
- Provider-specific code stays inside the provider adapter.
- Prompt templates are versioned and named.
- AI output must be structured and Zod-validated.
- Do not parse required application data from unstructured prose.
- Do not allow AI output to select permissions, endpoints, or credentials.
- Do not send repository code during the MVP.
- Record provider and model identifiers where available.
- Add bounded retries only for transient provider failure.

## Email

- Keep Resend client initialization server-only.
- Use separate functions for each email event.
- Escape user-provided values in HTML.
- Use absolute allowlisted application URLs.
- Honour email preferences.
- Do not place private repository content in email.
- Email failure must not change successful commit state.

## Errors and Logging

- Create stable internal error codes.
- Give users plain-language messages with a useful next action.
- Log sanitized context, not secrets.
- Use an internal request or operation ID for multi-step actions.
- Reconcile uncertain GitHub write results before retrying.
- Do not use `console.log` for secret-bearing objects.

## Testing

### Unit Tests

Cover:

- Safe-path normalization and rejection.
- AI schema validation.
- Streak calculation.
- Status-transition rules.
- Commit-message validation.
- Error normalization.

### Integration Tests

Cover:

- RLS between two users.
- Authenticated resource ownership.
- GitHub installation/repository verification with mocked API responses.
- Idempotent commit orchestration.
- Webhook signature and lifecycle handling.

### End-to-End Tests

Cover:

- Sign in and onboarding.
- Connected-repository selection using a test environment or controlled mock.
- Generate, edit, preview, and approve task flow.
- Failed generation recovery.
- Removed repository state.

Before closing a unit:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Add scripts when the related testing tool is introduced.

## File Organization

```text
src/
├── app/
├── components/
│   ├── ui/
│   ├── shared/
│   └── layout/
├── features/
│   ├── auth/
│   ├── onboarding/
│   ├── github/
│   ├── tasks/
│   ├── commits/
│   ├── progress/
│   └── settings/
├── lib/
│   ├── ai/
│   ├── email/
│   ├── env/
│   ├── github/
│   ├── security/
│   ├── supabase/
│   ├── validation/
│   └── utils/
└── types/
```

Naming:

- Components: `PascalCase.tsx`.
- Utilities and services: `kebab-case.ts`.
- Hooks: `use-name.ts`.
- Zod schemas: `name.schema.ts`.
- Server actions: `name.actions.ts`.
- Services: `name.service.ts`.
- Tests: colocated `*.test.ts` or `*.test.tsx` unless integration setup requires a separate folder.

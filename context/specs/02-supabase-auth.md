# Unit 02: Supabase Auth — GitHub Sign-In and Protected Routes

## Goal

Configure Supabase Auth with the GitHub OAuth provider. A user can visit the public home page, click **Continue with GitHub**, complete the OAuth flow, land on a protected dashboard, see their GitHub avatar and display name in the app header, and sign out. Unauthenticated visitors are redirected to `/login`. The session persists across page reloads.

## Dependencies

- Unit 01 complete.
- Supabase project created (credentials in `.env.local`).
- GitHub OAuth App configured in the Supabase dashboard (redirect URL: `<SUPABASE_URL>/auth/v1/callback`).

## Scope

This unit includes only:

- `@supabase/supabase-js` and `@supabase/ssr` installation.
- Supabase browser, server, and middleware client factories in `src/lib/supabase/`.
- Server environment schema extended with Supabase variables.
- Auth callback route handler: `src/app/api/auth/callback/route.ts`.
- Login page: `src/app/(auth)/login/page.tsx` with layout.
- Sign-in Server Action (GitHub OAuth redirect).
- Sign-out Server Action.
- Next.js middleware: session cookie refresh and `(app)` route gating.
- Updated `(app)` layout to load the current user server-side and pass to header.
- Updated `AppHeader` to accept an optional user prop and render avatar + sign-out.
- `src/features/auth/` helpers: `get-session.ts`, `get-user.ts`.
- Loading and error boundaries for `(app)` routes.
- Unit tests for auth helper utilities.

This unit does not include:

- Database profile creation or upsert (Unit 03).
- GitHub App or repository access (Unit 06+).
- Onboarding flow (Unit 04).
- Email delivery (Unit 16+).

## Environment Variables Required

Read from `.env.local` (already present):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   ← anon/publishable key (browser-safe)
SUPABASE_SECRET_KEY                    ← service-role key (server-only)
```

The Supabase project uses the new SDK key naming. Map these in the env schemas:
- `NEXT_PUBLIC_SUPABASE_URL` → public env
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → public env (anon key used by browser/SSR clients)
- `SUPABASE_SECRET_KEY` → server-only env (service-role key used by admin client only)

## Implementation

### 1. Install Dependencies

```
@supabase/supabase-js
@supabase/ssr
```

### 2. Supabase Client Modules

Create in `src/lib/supabase/`:

- `browser.ts` — `createBrowserClient` using the publishable key. Safe to import in `"use client"` components.
- `server.ts` — `createServerClient` using the publishable key with cookie read/write helpers. Server-only.
- `admin.ts` — `createClient` using the secret key. Server-only. Import guarded with `import "server-only"`. Used only for privileged operations (profile upserts in Unit 03).
- `middleware.ts` — `createServerClient` suitable for Next.js middleware. Refreshes the session cookie.

### 3. Server Environment Schema

Extend `src/lib/env/server.ts` to include:

```
NEXT_PUBLIC_SUPABASE_URL  (validated as URL)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (non-empty string)
SUPABASE_SECRET_KEY (non-empty string)
```

Note: `NEXT_PUBLIC_` variables are technically accessible server-side but are kept in the server schema for validation completeness. The publishable key is not a secret; the secret key must never be prefixed `NEXT_PUBLIC_`.

Also extend `src/lib/env/public.ts` to include:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### 4. Auth Callback Route

`src/app/api/auth/callback/route.ts`

- GET handler.
- Reads `code` from the search params.
- Calls `supabase.auth.exchangeCodeForSession(code)`.
- On success: redirects to `/dashboard`.
- On error: redirects to `/login?error=auth_failed`.
- Never logs or returns the code or session tokens.

### 5. Login Page

Route group: `src/app/(auth)/`

Create:
- `src/app/(auth)/layout.tsx` — minimal centred layout, no app navigation.
- `src/app/(auth)/login/page.tsx` — renders the `LoginCard` component.

`LoginCard` (in `src/features/auth/`):
- Displays the Blumo wordmark.
- Tagline: **Grow every day.**
- A single **Continue with GitHub** button.
- On click: calls the sign-in Server Action which calls `supabase.auth.signInWithOAuth`.
- Loading state while the redirect is initiated.
- Error state if `?error=auth_failed` is present in the URL.
- Note: "By signing in you agree to our Terms and Privacy Policy."

### 6. Sign-In Server Action

`src/features/auth/sign-in.actions.ts`

- Server Action (`"use server"`).
- Calls `supabase.auth.signInWithOAuth` with provider `github`.
- Sets `redirectTo` to `${NEXT_PUBLIC_APP_URL}/api/auth/callback`.
- Returns the OAuth URL via `redirect()`.
- Does not expose any tokens.

### 7. Sign-Out Server Action

`src/features/auth/sign-out.actions.ts`

- Server Action (`"use server"`).
- Calls `supabase.auth.signOut()`.
- Redirects to `/login`.

### 8. Middleware

`src/middleware.ts`

- Runs on all `(app)` routes: `/dashboard`, `/onboarding`, `/history`, `/settings`, and any sub-paths.
- Uses the middleware Supabase client to refresh the session cookie on every request.
- If no valid session exists after refresh, redirects to `/login`.
- Does not run on `/login`, `/api/auth/callback`, marketing routes, or static assets.
- Follows the Supabase SSR middleware pattern exactly.

Matcher config:
```ts
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### 9. Auth Helpers

`src/features/auth/get-session.ts` — server helper that retrieves the current session using the server client.
`src/features/auth/get-user.ts` — server helper that retrieves the authenticated user (uses `getUser()` not `getSession()` for security per Supabase guidance).

Both use the server Supabase client and are server-only.

### 10. App Layout and Header Updates

`src/app/(app)/layout.tsx`:
- Fetch the current user server-side using `getUser()`.
- Pass user data (id, email, user_metadata) to `AppHeader`.
- If user is null (middleware should have redirected, but be defensive), the layout gracefully handles it.

`src/components/layout/AppHeader.tsx`:
- Accept an optional `user` prop of type `{ email?: string; avatarUrl?: string; displayName?: string }`.
- Show a small avatar or initials circle when user is present.
- Show a **Sign out** button that calls the sign-out Server Action.
- Loading and unauthenticated states handled gracefully.

### 11. Loading and Error Boundaries

- `src/app/(app)/loading.tsx` — skeleton loading state for authenticated routes.
- `src/app/(app)/error.tsx` — error boundary for authenticated routes (`"use client"`).

### 12. Tests

Write in `src/features/auth/`:

- `get-user.test.ts` — mock the Supabase server client; verify `getUser()` is called and result is returned correctly.
- `sign-out.actions.test.ts` — mock Supabase client; verify `signOut()` is called.

At minimum 2 new tests must pass, bringing the total to 8+.

## Verify When Done

- [ ] `npm install` adds `@supabase/supabase-js` and `@supabase/ssr`.
- [ ] Supabase client files exist: `browser.ts`, `server.ts`, `admin.ts`, `middleware.ts` in `src/lib/supabase/`.
- [ ] `src/lib/env/server.ts` validates the three Supabase variables.
- [ ] `src/lib/env/public.ts` validates `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] `/login` renders the Blumo wordmark, tagline, and GitHub button.
- [ ] Clicking **Continue with GitHub** initiates the OAuth flow (manual test).
- [ ] `/api/auth/callback` route exists.
- [ ] After OAuth, the user lands on `/dashboard` (manual test).
- [ ] `/dashboard` shows the authenticated user's display name or GitHub username (manual test).
- [ ] Navigating directly to `/dashboard` without a session redirects to `/login`.
- [ ] Middleware matcher does not block marketing pages or static assets.
- [ ] Sign-out returns the user to `/login`.
- [ ] `SUPABASE_SECRET_KEY` is never prefixed `NEXT_PUBLIC_` or returned to the browser.
- [ ] Loading state is visible during OAuth redirect.
- [ ] Error state renders when `?error=auth_failed` is in the URL.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes (8+ tests).
- [ ] `npm run build` passes.
- [ ] `context/progress-tracker.md` records Unit 02 completion.

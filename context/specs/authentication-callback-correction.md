# Correction Unit: Supabase GitHub Authentication Callback

## Goal

Fix GitHub sign-in so localhost and production complete the existing Supabase
PKCE flow without a 404. The canonical application callback becomes:

- `http://localhost:3000/api/github/callback`
- `https://blumo-ten.vercel.app/api/github/callback`

## Existing Architecture

- Next.js App Router.
- Supabase Auth owns website GitHub OAuth and session cookies.
- The GitHub App separately owns selected-repository installation and short-
  lived installation access tokens.
- No direct GitHub user-token exchange or second session system may be added.

## Scope

- Add the canonical App Router route at
  `src/app/api/github/callback/route.ts`.
- Move callback behavior into one server-only auth callback service.
- Keep `src/app/api/auth/callback/route.ts` as a compatibility wrapper.
- Update `signInWithGitHub` to pass the canonical callback to Supabase.
- Prefer `NEXT_PUBLIC_SITE_URL` in production and fall back to
  `NEXT_PUBLIC_APP_URL` locally.
- Pin the local development server to port `3000` so Next.js cannot silently
  move Blumo to another port while OAuth still returns to `localhost:3000`.
- Handle provider errors, missing codes, exchange failures, and safe internal
  `next` paths without logging sensitive values.
- Explicitly use the Node.js runtime for both callback routes.
- Update local Supabase redirect configuration and placeholder documentation.
- Add tests for localhost/production redirect generation, callback success,
  callback failure, and open-redirect rejection.

## Security

- Supabase handles provider OAuth state and GitHub provider-token exchange.
- The app exchanges only the one-time Supabase PKCE code.
- No GitHub user access token, installation token, client secret, PKCE code, or
  session token is logged, returned, or stored outside Supabase cookies.
- Redirect destinations must be same-origin relative paths and must not point
  back into `/api`.
- Error redirects use fixed identifiers only.

## Verification

- [x] `/api/github/callback` is present in the production route manifest.
- [x] `/api/auth/callback` remains present and uses the same handler.
- [x] Login start uses `/api/github/callback` on localhost.
- [x] Login start uses `https://blumo-ten.vercel.app/api/github/callback` when
      `NEXT_PUBLIC_SITE_URL` is configured.
- [x] Missing/cancelled/invalid callbacks redirect safely to
      `/login?error=auth_failed`.
- [x] A valid code calls `exchangeCodeForSession` once and redirects to
      `/dashboard`.
- [x] Protocol-relative, absolute, and API `next` destinations are rejected.
- [x] Local development fails clearly if another project owns port `3000`.
- [x] Lint, typecheck, all tests, and production build pass.

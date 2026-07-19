# Unit 06: GitHub App Registration and Installation Start

## Goal

Register and configure the Blumo Development GitHub App. Build the
authenticated "Connect GitHub" page that explains why repository access is
needed and redirects the signed-in, onboarded user to GitHub's App
installation flow. The user leaves Blumo, installs the App on selected
repositories, and GitHub redirects them to the setup callback URL.

**The setup callback is not processed in this unit.** That belongs to Unit 07.
At the end of Unit 06 the only verifiable result is that a signed-in user can
arrive at `/github/connect`, read a clear permission explanation, press
**Connect GitHub**, and land on GitHub's official App installation page.

---

## Dependencies

- Unit 05 complete: authenticated dashboard shell exists, `AppSidebar`
  navigation present, `/settings` placeholder route exists.
- `src/lib/env/server.ts` exists and uses a Zod schema pattern that can be
  extended.
- The `src/features/dashboard/GitHubConnectionCard.tsx` "Connect GitHub →"
  link currently points to `/settings`. This unit changes that target to
  `/github/connect`.
- No new npm packages are required in Unit 06. The installation URL builder
  uses only built-in `URL` objects; no Octokit dependency is introduced yet.
  (Octokit is introduced in Unit 07 when installation tokens and API calls
  are first made.)

---

## Scope

### Included

- Manual registration of the **Blumo Development** GitHub App (one-time
  human step; documented in `docs/github-app-setup.md`).
- Extension of `src/lib/env/server.ts` to validate five new environment
  variables.
- New server-only module: `src/lib/github/github-app.config.ts` — loads and
  normalises the GitHub App configuration (private key newline handling,
  App ID as number, slug as string).
- New server-only module: `src/lib/github/installation-url.ts` — pure
  function that builds the GitHub App installation URL from the App slug.
- New `src/app/(app)/github/connect/page.tsx` — Server Component; checks
  authentication and onboarding, then renders `ConnectGitHubPage`.
- New `src/app/(app)/github/connect/loading.tsx` — skeleton.
- New `src/features/github/ConnectGitHubPage.tsx` — Server Component;
  receives the installation URL as a prop; renders the full connection
  explanation page.
- New `src/features/github/ConnectGitHubButton.tsx` — Client Component;
  handles the redirect to the installation URL on click.
- Unit tests: `src/lib/github/installation-url.test.ts` (URL builder) and
  `src/lib/github/github-app.config.test.ts` (config loading and newline
  normalisation).
- Update `src/features/dashboard/GitHubConnectionCard.tsx` to link to
  `/github/connect` instead of `/settings`.
- Update the `/settings` placeholder copy to mention that GitHub connection
  will be available from the dashboard.
- Add `/github/connect` to the proxy's `PROTECTED_PATHS` list so
  unauthenticated users are redirected to `/login`.

### Explicitly Excluded

- Setup callback (`/api/github/setup`) — Unit 07.
- Installation storage — Unit 07.
- Repository listing or synchronization — Unit 08.
- Webhook endpoint or signature verification — Unit 09.
- Installation token generation — Unit 07 onwards.
- Octokit installation — deferred to Unit 07.
- Any GitHub API call to repositories — no API calls in this unit.
- AI, mission generation, Resend, scheduling, payments.
- Production GitHub App registration (documented but not yet required).

---

## GitHub App Registration

This is a human, one-time task performed before implementation begins.
The full step-by-step guide is in `docs/github-app-setup.md`. The required
settings are:

### App name

`Blumo Development` (local). Production name is `Blumo`.

### Homepage URL

`http://localhost:3000` for local development. Set to the production domain
in the production App.

### Setup URL

`http://localhost:3000/api/github/setup`

This is the route where GitHub redirects after a user installs or modifies the
App. The route is implemented in Unit 07. It must be set in the App
configuration now so GitHub knows where to redirect, but the route itself need
not exist yet — GitHub only calls it after installation, which will not happen
in a production context before Unit 07 is deployed.

### Webhook

Leave **Active** unchecked for Unit 06. Webhook processing is implemented and
activated in Unit 09. Set the webhook secret now and store it in `.env.local`
because the environment schema will validate it in this unit.

### Repository permissions

| Permission | Level |
|---|---|
| Metadata | Read-only (mandatory) |
| Contents | Read and write |

All other permissions — Administration, Actions, Workflows, Secrets,
Deployments, Members, Issues, Pull requests, and all organisation permissions —
must be set to **No access** and must not be added without a documented
architecture decision.

### Subscribed events

| Event | Reason |
|---|---|
| Installation | Track install / uninstall / suspend lifecycle |
| Installation repositories | Track repository add / remove |

No other events are subscribed to in the MVP.

### Where can this App be installed?

**Only on this account** for the development App. The production App may be
changed to **Any account** before beta, but that is a production deployment
decision documented in Unit 19.

---

## Environment Variables

Five variables are added to `src/lib/env/server.ts` in this unit. All are
server-only. None uses the `NEXT_PUBLIC_` prefix.

| Variable | Type | Required | Description |
|---|---|---|---|
| `GITHUB_APP_ID` | Integer string | Yes | Numeric App ID from GitHub settings |
| `GITHUB_APP_SLUG` | String | Yes | Lowercase hyphenated App slug (e.g. `blumo-development`) |
| `GITHUB_APP_PRIVATE_KEY` | PEM string | Yes | RSA private key with `\n` as literal newlines |
| `GITHUB_WEBHOOK_SECRET` | String | Yes | Hex secret for HMAC webhook verification (Unit 09) |
| `GITHUB_APP_CLIENT_ID` | String | No | OAuth client ID — present in schema but optional until Unit 07 |
| `GITHUB_APP_CLIENT_SECRET` | String | No | OAuth client secret — present in schema but optional until Unit 07 |

### Newline normalisation rule

GitHub private keys are multi-line PEM files. When stored as environment
variables, newlines are often escaped as the two-character sequence `\n`.
The `github-app.config.ts` module normalises the value on first read:

```ts
const privateKey = rawKey.replace(/\\n/g, "\n");
```

This produces the real multi-line string that the GitHub App SDK expects.
The normalised key is never logged and never returned to the client.

### Schema additions to `src/lib/env/server.ts`

```ts
// GitHub App (Unit 06)
GITHUB_APP_ID: z
  .string()
  .min(1, "GITHUB_APP_ID is required")
  .regex(/^\d+$/, "GITHUB_APP_ID must be a numeric string"),
GITHUB_APP_SLUG: z
  .string()
  .min(1, "GITHUB_APP_SLUG is required"),
GITHUB_APP_PRIVATE_KEY: z
  .string()
  .min(1, "GITHUB_APP_PRIVATE_KEY is required"),
GITHUB_WEBHOOK_SECRET: z
  .string()
  .min(1, "GITHUB_WEBHOOK_SECRET is required"),
// Optional until Unit 07
GITHUB_APP_CLIENT_ID: z.string().optional(),
GITHUB_APP_CLIENT_SECRET: z.string().optional(),
```

The `process.env` reads for these six variables must also be added to the
`parseServerEnv` object literal.

---

## File Structure

```
src/
├── app/
│   └── (app)/
│       └── github/
│           └── connect/
│               ├── page.tsx          ← new (Server Component)
│               └── loading.tsx       ← new (skeleton)
├── features/
│   └── github/
│       ├── ConnectGitHubPage.tsx     ← new (Server Component)
│       └── ConnectGitHubButton.tsx   ← new (Client Component)
├── lib/
│   ├── env/
│   │   └── server.ts                 ← updated (add 6 GitHub App vars)
│   └── github/
│       ├── github-app.config.ts      ← new (server-only config loader)
│       ├── installation-url.ts       ← new (URL builder)
│       ├── github-app.config.test.ts ← new
│       └── installation-url.test.ts  ← new
└── proxy.ts                          ← updated (add /github to PROTECTED_PATHS)
```

Feature files stay flat inside `src/features/github/`. Do not create
subdirectory folders for individual concerns.

---

## Module Specifications

### `src/lib/github/github-app.config.ts`

```ts
import "server-only";
import { serverEnv } from "@/lib/env/server";

export type GitHubAppConfig = {
  appId: number;
  appSlug: string;
  privateKey: string;           // normalised — real newlines, never logged
  webhookSecret: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
};

/**
 * Returns the GitHub App configuration parsed from validated environment
 * variables. Normalises the private key from escaped `\n` sequences to
 * real newlines.
 *
 * Marked server-only. Never returned to the client.
 */
export function getGitHubAppConfig(): GitHubAppConfig {
  return {
    appId: parseInt(serverEnv.GITHUB_APP_ID, 10),
    appSlug: serverEnv.GITHUB_APP_SLUG,
    privateKey: serverEnv.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    webhookSecret: serverEnv.GITHUB_WEBHOOK_SECRET,
    clientId: serverEnv.GITHUB_APP_CLIENT_ID,
    clientSecret: serverEnv.GITHUB_APP_CLIENT_SECRET,
  };
}
```

- Marked `server-only`.
- Calls `serverEnv` — which already validates at startup via Zod.
- The function is pure and synchronous.
- `appId` is coerced to `number` because the GitHub SDK expects a number.
- Do not log the `privateKey` or `clientSecret` fields.

### `src/lib/github/installation-url.ts`

```ts
import "server-only";

/**
 * Builds the GitHub App installation URL for a given App slug.
 *
 * Format:  https://github.com/apps/{slug}/installations/new
 *
 * The user arrives here to choose which repositories to grant access to.
 * GitHub redirects back to the configured setup URL with installation_id
 * after the user confirms.
 */
export function buildInstallationUrl(appSlug: string): string {
  if (!appSlug || appSlug.trim() === "") {
    throw new Error("GITHUB_APP_SLUG is required to build an installation URL");
  }
  return `https://github.com/apps/${encodeURIComponent(appSlug.trim())}/installations/new`;
}
```

- Marked `server-only`.
- Pure function. No network calls.
- Throws with a descriptive message if the slug is empty (defensive guard
  against misconfiguration; the Zod schema validation will catch it earlier
  in normal operation).
- `encodeURIComponent` is applied to the slug as a defensive measure, even
  though a valid slug contains only lowercase letters, digits, and hyphens.

### `src/app/(app)/github/connect/page.tsx`

Server Component. Authentication and onboarding are already gated by the
proxy. The page adds a defensive server-side check before rendering, matching
the pattern established in the dashboard and onboarding pages.

```ts
import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/get-user";
import { getProfile } from "@/features/auth/get-profile";
import { getGitHubAppConfig } from "@/lib/github/github-app.config";
import { buildInstallationUrl } from "@/lib/github/installation-url";
import { ConnectGitHubPage } from "@/features/github/ConnectGitHubPage";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata = { title: "Connect GitHub — Blumo" };

export default async function ConnectPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  // Build the installation URL server-side.
  // If GitHub App is not configured (missing env vars), serverEnv will have
  // already thrown at startup. getGitHubAppConfig() is therefore always safe
  // to call here.
  const config = getGitHubAppConfig();
  const installationUrl = buildInstallationUrl(config.appSlug);

  return (
    <PageContainer width="narrow" className="py-10">
      <ConnectGitHubPage installationUrl={installationUrl} />
    </PageContainer>
  );
}
```

- No secrets are passed to `ConnectGitHubPage`. Only the public installation
  URL (a `https://github.com/apps/…` link) is passed as a prop.
- `installationUrl` is a safe external HTTPS URL to GitHub — it is not a
  secret.

### `src/features/github/ConnectGitHubPage.tsx`

Server Component. Pure presentation. Receives `installationUrl` as a prop.

Props:

```ts
interface ConnectGitHubPageProps {
  installationUrl: string;
}
```

Layout:

```
┌─────────────────────────────────────────────┐
│  Connect your GitHub repository              │  ← h1
│  ──────────────────────────────────────────  │
│                                              │
│  [Permission explanation card]               │
│                                              │
│  [ConnectGitHubButton]                       │
│                                              │
│  [Privacy note]                              │
└─────────────────────────────────────────────┘
```

#### Permission explanation card

A `Card` component with:

- Card title: "What Blumo can access"
- Bulleted list:
  - **Read and write files in `blumo/`** — Blumo writes approved learning
    notes and coding challenges only inside the `blumo/` directory.
  - **Read repository metadata** — Required by GitHub for all Apps.
- A clear separator followed by:
  - **What Blumo cannot access:** issues, pull requests, code history outside
    `blumo/`, organisation settings, secrets, and Actions workflows.
- Bottom note: "You choose which repositories to allow. You can remove access
  at any time from your GitHub settings."

Card background: `var(--bg-subtle)`, border: `var(--border-default)`,
`rounded-xl`.

#### ConnectGitHubButton

A `<ConnectGitHubButton installationUrl={installationUrl} />` placed below
the card. This is a Client Component that handles the `window.location`
navigation (see below).

#### Privacy note

```
A plain muted <p> below the button:
"Blumo never requests your GitHub password or a personal access token.
Repository connection uses a GitHub App with selected-repository access only."
```

Text: `text-xs`, `var(--text-muted)`.

### `src/features/github/ConnectGitHubButton.tsx`

Client Component (`"use client"`). Handles the navigation to GitHub.

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GitBranch, ExternalLink } from "lucide-react";

interface ConnectGitHubButtonProps {
  installationUrl: string;
}

export function ConnectGitHubButton({ installationUrl }: ConnectGitHubButtonProps) {
  const [loading, setLoading] = useState(false);

  function handleConnect() {
    setLoading(true);
    window.location.href = installationUrl;
  }

  return (
    <Button
      onClick={handleConnect}
      disabled={loading}
      aria-disabled={loading}
      className="gap-2"
    >
      <GitBranch size={16} aria-hidden="true" />
      {loading ? "Redirecting to GitHub…" : "Connect GitHub"}
      {!loading && <ExternalLink size={14} aria-hidden="true" />}
    </Button>
  );
}
```

- Uses `window.location.href` so the browser performs a full navigation to
  GitHub. This is intentional — GitHub's installation page cannot be embedded
  in an `<iframe>`.
- `loading` state prevents a double-click from triggering the redirect twice.
- `aria-disabled` is set while redirecting.
- The `installationUrl` prop is received from the Server Component and is
  never fetched from the client or stored in localStorage.

### `src/app/(app)/github/connect/loading.tsx`

A simple loading skeleton matching the page layout:

```tsx
export default function ConnectLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <div className="h-8 w-72 rounded-lg bg-muted animate-pulse" />
      <div className="h-48 w-full rounded-xl bg-muted animate-pulse" />
      <div className="h-10 w-44 rounded-lg bg-muted animate-pulse" />
      <div className="h-4 w-96 rounded bg-muted animate-pulse" />
    </div>
  );
}
```

---

## Proxy Changes

`src/proxy.ts` — add `/github` to `PROTECTED_PATHS`:

```ts
const PROTECTED_PATHS = [
  "/dashboard",
  "/onboarding",
  "/github",           // ← add
  "/history",
  "/settings",
  "/tasks",
];
```

This ensures unauthenticated users visiting `/github/connect` are redirected
to `/login` by the existing proxy logic before the page renders.

The onboarding gate already redirects unonboarded users from all protected app
paths to `/onboarding`, so no additional proxy change is required for that
case.

---

## Dashboard GitHubConnectionCard Update

`src/features/dashboard/GitHubConnectionCard.tsx` — change the "Connect
GitHub →" link target from `/settings` to `/github/connect`:

```tsx
// Before
<Link href="/settings" ...>Connect GitHub →</Link>

// After
<Link href="/github/connect" ...>Connect GitHub →</Link>
```

No other changes to this file.

---

## What Is Not Changed

- Any SQL migration — no new tables or columns are required for Unit 06.
- `src/lib/supabase/` clients.
- The proxy's session-refresh logic, onboarding gate, or login gate.
- `src/features/auth/`, `src/features/onboarding/`, `src/features/dashboard/`
  except the `GitHubConnectionCard.tsx` link target.
- Marketing pages or login page.
- Existing tests.
- `.env.local` other than adding the five new variables (human task).

---

## Data Flow

```
Browser                     Next.js Server
  │                               │
  ├─ GET /github/connect ─────────►
  │                               │
  │                         getUser() ─── Supabase (session check)
  │                         getProfile() ─ Supabase (onboarding check)
  │                         getGitHubAppConfig() (reads serverEnv)
  │                         buildInstallationUrl(appSlug)
  │                               │
  │◄── HTML: ConnectGitHubPage ───┘
  │    (includes installationUrl prop)
  │
  │  [User reads explanation]
  │
  ├─ click "Connect GitHub" ──────► window.location.href = installationUrl
  │
  │◄──────── browser navigates to ──────── https://github.com/apps/blumo-development/installations/new
                                           (GitHub's own installation page)
```

At no point does the Blumo server make an outbound API call to GitHub in
Unit 06. The installation URL is built from static configuration. No
installation tokens are generated. No Octokit instance is created.

---

## Security Rules for This Unit

1. `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, and
   `GITHUB_APP_CLIENT_SECRET` are read only in server-only modules.
   None of these values ever enters a React component, a browser bundle,
   or an API response.
2. The `installationUrl` prop passed to `ConnectGitHubPage` and
   `ConnectGitHubButton` is a public HTTPS URL to GitHub. It is not a
   secret. It is safe to include in rendered HTML.
3. Do not construct the installation URL from any client-provided input.
   The URL is built exclusively from `GITHUB_APP_SLUG` in `serverEnv`.
4. The setup callback URL embedded in the GitHub App settings
   (`/api/github/setup`) must not be trusted without server-side verification
   in Unit 07. The route does not exist yet; if GitHub calls it before
   Unit 07 is implemented, the response will be a 404, which is safe.
5. Do not request `window.location.href` from a URL resolved from user
   input. The `installationUrl` is always derived from configuration.
6. Never store or log the private key, webhook secret, client secret, or
   client ID in any server log, API response, or error message.

---

## UI Design

Follow `context/ui-context.md`. Key rules for this page:

- Page title: `text-2xl md:text-3xl font-semibold`, `var(--text-primary)`.
- Subtitle: `text-sm`, `var(--text-muted)`.
- Permission card: `rounded-xl`, `var(--bg-subtle)` background,
  `var(--border-default)` border.
- Permission list items: `text-sm`, `var(--text-primary)`, with `text-sm`
  muted supporting text below each item.
- The "what Blumo cannot do" list uses the same style.
- The button uses the existing `Button` component (primary variant) with
  `GitBranch` and `ExternalLink` icons.
- The privacy note is `text-xs`, `var(--text-muted)`.
- The layout is centred using `PageContainer width="narrow"` (`max-w-2xl`).
- The page is usable at 320 px viewport width without horizontal overflow.

### Loading state

`loading.tsx` uses the `animate-pulse` pattern established in the onboarding
and dashboard loading skeletons. No new shadcn component is required.

### Error state

If `getGitHubAppConfig()` throws because environment variables are missing,
the error propagates to the `(app)` error boundary (`error.tsx`), which
already exists. The implementer does not need to add a custom error page for
Unit 06. The error boundary message is generic ("Something went wrong") and
does not expose the missing variable name.

---

## Accessibility

- The page `<h1>` is "Connect your GitHub repository".
- The permission card title uses `<h2>`.
- The "Connect GitHub" button has a descriptive label that does not rely on
  colour alone.
- The `ExternalLink` icon inside the button has `aria-hidden="true"`.
- The `loading` state sets `aria-disabled="true"` on the button.
- Focus returns to the button if navigation is cancelled (edge case: browser
  navigation blocked by extension). No special handling is required.
- All text colours meet WCAG AA contrast against their backgrounds.

---

## Tests

### Location

`src/lib/github/` — colocated with the modules under test.

### Required Test Cases

| # | File | Scenario | Expected result |
|---|---|---|---|
| 1 | `installation-url.test.ts` | Valid slug `"blumo-development"` | Returns `"https://github.com/apps/blumo-development/installations/new"` |
| 2 | `installation-url.test.ts` | Slug with leading/trailing whitespace | Strips whitespace; returns correct URL |
| 3 | `installation-url.test.ts` | Empty string slug | Throws with descriptive message |
| 4 | `installation-url.test.ts` | Slug with characters that need encoding (edge case) | URL-encodes the slug correctly |
| 5 | `github-app.config.test.ts` | Private key with literal `\n` sequences | Returns key with real newlines |
| 6 | `github-app.config.test.ts` | Private key that already has real newlines | Returns key unchanged |

Minimum: **6 new tests**, bringing the project total to **38+**.

Both test files must mock `@/lib/env/server` to supply test environment
values without requiring real secrets. They must also mock `server-only` as
`{}`. No real GitHub API calls are made.

### Test file patterns

```ts
// installation-url.test.ts
vi.mock("server-only", () => ({}));
// No supabase mocking needed — installation-url.ts has no Supabase dependency
```

```ts
// github-app.config.test.ts
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    GITHUB_APP_ID: "1234567",
    GITHUB_APP_SLUG: "blumo-development",
    GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nMIIE...\\n-----END RSA PRIVATE KEY-----\\n",
    GITHUB_WEBHOOK_SECRET: "abc123",
    GITHUB_APP_CLIENT_ID: undefined,
    GITHUB_APP_CLIENT_SECRET: undefined,
  },
}));
```

---

## Verification Checklist

- [ ] `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, and
  `GITHUB_WEBHOOK_SECRET` are added to `src/lib/env/server.ts` as required
  string fields.
- [ ] `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` are added as
  optional string fields.
- [ ] All six variables are read from `process.env` in the `parseServerEnv`
  object literal.
- [ ] `src/lib/github/github-app.config.ts` is marked `server-only` and
  normalises `\\n` to real newlines in the private key.
- [ ] `src/lib/github/installation-url.ts` is marked `server-only` and
  returns the correct `https://github.com/apps/{slug}/installations/new` URL.
- [ ] `src/app/(app)/github/connect/page.tsx` redirects unauthenticated users
  to `/login` and unonboarded users to `/onboarding`.
- [ ] The `installationUrl` passed to `ConnectGitHubPage` begins with
  `https://github.com/apps/`.
- [ ] No secret (`GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`,
  `GITHUB_APP_CLIENT_SECRET`) appears in rendered HTML or in a React prop
  passed to a client component.
- [ ] `ConnectGitHubPage` renders the permission explanation with a clear list
  of what Blumo can and cannot access.
- [ ] `ConnectGitHubButton` is a `"use client"` component that uses
  `window.location.href` to navigate.
- [ ] Clicking "Connect GitHub" in a browser redirects to GitHub's App
  installation page.
- [ ] The button is disabled and shows "Redirecting to GitHub…" while
  navigating.
- [ ] `/github` is added to `PROTECTED_PATHS` in `src/proxy.ts`.
- [ ] `src/features/dashboard/GitHubConnectionCard.tsx` "Connect GitHub →"
  link points to `/github/connect`.
- [ ] `src/app/(app)/github/connect/loading.tsx` renders a layout-shaped
  skeleton.
- [ ] The page is usable at 320 px viewport width.
- [ ] All interactive elements are keyboard-accessible.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run typecheck` passes with no errors.
- [ ] `npm run test` passes (38+ total, 6+ new tests).
- [ ] `npm run build` passes with no errors.
- [ ] `context/progress-tracker.md` records Unit 06 completion.

---

## What Comes Next

Unit 07 implements the setup callback at `/api/github/setup`. When GitHub
redirects back with an `installation_id` query parameter, Unit 07:

1. Verifies the authenticated Blumo session.
2. Authenticates as the GitHub App using the private key.
3. Calls the GitHub API to retrieve verified installation metadata.
4. Stores the installation in the `github_installations` table.
5. Redirects the user to a repository-selection page (Unit 08).

Unit 06 does not implement any of this. The `/api/github/setup` route does
not exist at the end of Unit 06, and that is intentional and safe.

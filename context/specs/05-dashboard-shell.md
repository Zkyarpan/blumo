# Unit 05: Dashboard Shell

## Goal

Replace the Unit 01 placeholder dashboard with a real authenticated dashboard
shell that shows the signed-in user's saved profile and active goal. The shell
provides responsive navigation, clearly labelled empty states for features not
yet implemented (task generation, GitHub connection, history), and an honest
progress summary that shows zero or real completed-task counts from the
database.

After this unit, an onboarded user lands on `/dashboard` and immediately sees:

- Their name or GitHub username in a welcome greeting.
- Their active goal title, technology, experience level, daily minutes, and
  preferred task type.
- A "Today's mission" card in its empty state (no generation in this unit).
- A "GitHub repository" card showing the not-connected state.
- A progress summary showing actual completed-task count (zero for new users).
- A recent-activity section in its empty state.
- Navigation to Dashboard, Tasks, History, Settings.
- Sign-out control.

---

## Dependencies

- Unit 04 complete: `onboarding_completed_at` is set in `profiles`; an active
  `goals` row exists for every onboarded user.
- Unit 02 complete: authenticated session via Supabase server client.
- Unit 03 complete: `profiles`, `goals`, and `daily_tasks` tables exist with
  RLS active.
- Existing layout components: `AppHeader`, `PageContainer`, `BlumoWordmark`.
- Existing shadcn/ui components: `card`, `badge`, `button`, `separator`.
- No new environment variables are required.

---

## Scope

### Included

- Full replacement of the placeholder `src/app/(app)/dashboard/page.tsx`.
- `src/features/dashboard/` feature module (flat — no subdirectories):
  - `dashboard.service.ts` — server-only data-fetch layer.
  - `DashboardShell.tsx` — top-level presentational assembly.
  - `GoalSummaryCard.tsx` — displays active goal details.
  - `MissionCard.tsx` — today's mission empty state.
  - `GitHubConnectionCard.tsx` — GitHub not-connected state.
  - `ProgressSummaryCard.tsx` — completed-task count and current streak (both
    zero for a new user; real values if tasks exist).
  - `RecentActivitySection.tsx` — recent tasks empty state.
- Responsive sidebar navigation for desktop (`AppSidebar`) inside
  `src/components/layout/`.
- Mobile sheet navigation controlled by `AppHeader` on small screens.
- Skeleton loading state for the dashboard route (`loading.tsx`).
- Route placeholder pages for `/tasks`, `/history`, and `/settings` — each
  renders a minimal "coming soon" layout using `PageContainer`. These are thin
  Server Components only; no feature code is added.
- Unit tests for `dashboard.service.ts` — mock Supabase, no real credentials.
- `AppHeader` updated to accept and show active-nav highlighting; the existing
  sign-out behaviour is preserved.

### Explicitly Excluded

- GitHub App installation or repository API calls.
- AI mission generation.
- Task workspace (`/tasks/[id]`).
- History data queries (the route exists as a placeholder only).
- Settings form or preferences editing (the route exists as a placeholder only).
- Progress streak calculation based on scheduled days — show only the raw
  `completed_at` count of `daily_tasks` rows for this user.
- Resend or any email.
- Payments, scheduling, or admin tools.
- Statistics fabricated to look impressive — no fake numbers, no sample data.
- Dark mode.

---

## Navigation

### Items

| Label | Route | Icon | Notes |
|---|---|---|---|
| Dashboard | `/dashboard` | `LayoutDashboard` | Primary route |
| Tasks | `/tasks` | `Zap` | Placeholder page; not implemented |
| History | `/history` | `History` | Placeholder page; not implemented |
| Settings | `/settings` | `Settings` | Placeholder page; not implemented |

No GitHub connection link is added to the primary navigation in this unit.
The GitHub card on the dashboard surface is the entry point for Unit 06.

### Desktop Layout

The desktop app shell uses a fixed left sidebar containing the navigation and
a main content area that scrolls independently. The sidebar is always visible
on `lg` viewports and wider. The `AppHeader` does not repeat nav links on
desktop — it shows only the wordmark, user info, and sign-out control.

```
┌─────────────────────────────────────────────────┐
│  AppHeader (wordmark · user · sign out)          │
├──────────────┬──────────────────────────────────┤
│  AppSidebar  │  Main content                     │
│  ─────────── │  (scrollable)                     │
│  Dashboard   │                                   │
│  Tasks       │                                   │
│  History     │                                   │
│  Settings    │                                   │
│              │                                   │
│  [version/   │                                   │
│   sign-out]  │                                   │
└──────────────┴──────────────────────────────────┘
```

The sidebar width is `w-56` (224 px). The main content starts at `ml-56` on
`lg` and larger and occupies the full width on smaller viewports.

### Mobile Layout

On viewports smaller than `lg` the sidebar is hidden. A hamburger icon
(`Menu`) appears on the left of the `AppHeader`. Pressing it opens a `Sheet`
(shadcn) from the left edge containing the same nav links. The sheet closes
when a link is selected.

```
┌───────────────────────────────┐
│ ☰  Blumo            User ···  │  ← AppHeader (mobile)
├───────────────────────────────┤
│  Main content (single column) │
│                               │
└───────────────────────────────┘
```

### Active State

The currently active navigation item is highlighted using:

- Background: `var(--bg-subtle)`.
- Text: `var(--text-primary)` with `font-medium`.
- Left border accent: a 2 px strip using `var(--accent-primary)` on the
  sidebar item.
- Inactive text: `var(--text-secondary)` at normal weight.

Active state is determined by comparing the pathname (from `usePathname()`)
to the route in the nav item. Because `usePathname()` is a client hook, the
`AppSidebar` must include `"use client"` or delegate the active-state
comparison to a thin client wrapper.

---

## Data Behaviour

### Server-side Fetch

The dashboard `page.tsx` is a Server Component. It calls
`getDashboardData(userId)` from `dashboard.service.ts` before rendering.

`getDashboardData` returns:

```ts
type DashboardData = {
  profile: {
    id: string;
    display_name: string | null;
    github_username: string | null;
    avatar_url: string | null;
    experience_level: string | null;
    timezone: string | null;
  };
  activeGoal: {
    id: string;
    title: string;
    technology: string;
    task_type: string;
    daily_minutes: number;
    status: string;
    created_at: string;
  } | null;
  completedTaskCount: number;
};
```

### Query Rules

- Use `createSupabaseServerClient()` (anon key + RLS). Do not use the admin
  client for user-owned reads.
- Profile query: `SELECT id, display_name, github_username, avatar_url, experience_level, timezone FROM profiles WHERE id = auth.uid()`.
- Active goal query: `SELECT id, title, technology, task_type, daily_minutes, status, created_at FROM goals WHERE user_id = auth.uid() AND status = 'active' LIMIT 1`.
- Completed task count: `SELECT COUNT(*) FROM daily_tasks WHERE user_id = auth.uid() AND status = 'committed'`.
- Select only the columns listed above. Do not fetch columns this unit does
  not display.

### Redirect Logic

The `page.tsx` does the following before rendering:

1. Call `getUser()`. If no user → the proxy already redirects; this is a
   defensive belt-and-suspenders check that returns a 401 redirect to
   `/login` in production.
2. Call `getDashboardData(user.id)`.
3. If `profile` is null (edge case: trigger delay) → redirect to `/onboarding`
   with a brief message.
4. If `profile.onboarding_completed_at` is not set → redirect to `/onboarding`.
   The proxy does this first; the page is a defensive fallback.
5. Otherwise render `DashboardShell` with the fetched data.

### Missing Goal

If `activeGoal` is null (possible if the user somehow bypassed goal creation),
the dashboard renders `GoalSummaryCard` in a safe recovery state showing:
"No active goal. Return to onboarding to create one." with a link to
`/onboarding`. Do not crash or display an unhandled error.

### No Mutations

The dashboard page makes no writes. All data displayed is read-only. The
only action available is sign-out (which already exists in `AppHeader`).

### Client-provided User IDs

The server always derives `user_id` from the authenticated session. No
client-provided `userId` is trusted.

---

## Dashboard Layout

The main content area uses `PageContainer width="wide"` and is divided into
these sections in order, stacking vertically:

```
┌─────────────────────────────────────────────┐
│  Welcome header                              │
│  "Good morning, [name]" + goal subtitle      │
├────────────────────────┬────────────────────┤
│  Today's mission       │  GitHub repository  │
│  (2/3 width)           │  (1/3 width)        │
├────────────────────────┴────────────────────┤
│  Goal summary (full width)                  │
├─────────────────────────────────────────────┤
│  Progress summary (full width)              │
├─────────────────────────────────────────────┤
│  Recent activity (full width)               │
└─────────────────────────────────────────────┘
```

On mobile (below `md`), every column stacks to single width.

The grid for the top row uses:

```
grid gap-6 md:grid-cols-3
```

The mission card spans `md:col-span-2`. The GitHub card spans `md:col-span-1`.

---

## Component Specifications

### `src/features/dashboard/dashboard.service.ts`

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardData = { ... };  // as typed above

export async function getDashboardData(userId: string): Promise<DashboardData | null>
```

- Returns `null` if the profile row is missing.
- Returns `DashboardData` with `activeGoal: null` and `completedTaskCount: 0`
  when there is no active goal or no committed tasks.
- Does not throw — catches Supabase errors and returns `null` on failure.
- Marked `server-only`.

### `src/features/dashboard/DashboardShell.tsx`

Server Component. Receives `DashboardData` as props and composes the full
dashboard content. Renders in order:

1. Welcome header.
2. Top row grid (MissionCard + GitHubConnectionCard).
3. GoalSummaryCard.
4. ProgressSummaryCard.
5. RecentActivitySection.

Props:

```ts
interface DashboardShellProps {
  data: DashboardData;
}
```

### Welcome Header

Rendered inline inside `DashboardShell` — not a separate file, since it is
not reused elsewhere.

```
Good morning, [display_name or github_username or "Developer"].
[goal.title]   (subtitle, muted, truncated at 80 characters with ellipsis)
```

The greeting word ("morning", "afternoon", "evening") is derived from
`new Date()` on the server in the user's stored `timezone`. Use the
[`Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
API to get the current local hour. Do not import a date library.

- 00:00–11:59 local → "morning"
- 12:00–17:59 local → "afternoon"
- 18:00–23:59 local → "evening"

If the timezone is invalid or `Intl` throws, fall back to "Good day".

### `src/features/dashboard/GoalSummaryCard.tsx`

Server Component. Displays the active goal fields.

Props:

```ts
interface GoalSummaryCardProps {
  goal: DashboardData["activeGoal"];
}
```

When `goal` is null, render a recovery state:

```
┌────────────────────────────────────────────┐
│  Your learning goal                        │
│  No active goal found. Something went      │
│  wrong during setup.                       │
│  [Return to onboarding →]                  │
└────────────────────────────────────────────┘
```

When `goal` is present, render a card with:

- Card title: "Your learning goal"
- `goal.title` in `text-base font-semibold`
- A grid of four metadata pills below the title:
  - Technology: `goal.technology`
  - Level: human-readable experience level label (Beginner / Intermediate /
    Advanced mapped from the stored enum value)
  - Daily time: human-readable label ("10 min" through "1 hour")
  - Task type: human-readable label (Learning note / Coding challenge /
    Documentation / Interview preparation)
- Each pill uses `Badge` with `bg-subtle` and `text-secondary`.
- A muted caption: "Goal active since [created_at formatted as Month DD, YYYY]".

### `src/features/dashboard/MissionCard.tsx`

Server Component. Renders the empty state for today's mission.

This unit does not implement task generation. The card always renders the
empty state because no mission exists yet.

```
┌────────────────────────────────────────────┐
│  ⚡ Today's mission                         │
│  ─────────────────────────────────────────│
│                                            │
│  [dashed empty box]                        │
│  Zap icon (size-10, muted)                 │
│  "No mission yet"                          │
│  "Connect a GitHub repository and          │
│   generate your first mission."            │
│                                            │
└────────────────────────────────────────────┘
```

- The card occupies 2/3 of the top row on desktop.
- The title row includes the `Zap` icon and "Today's mission" label at
  `text-base font-semibold`.
- The dashed empty-state box uses `border-2 border-dashed rounded-lg` with
  `border-[var(--border-default)]` and `p-10 text-center`.
- The "Connect a GitHub repository" text is a link to `/settings` (the
  settings page will show the GitHub connection entry point in Unit 06).
- Do not show a "Generate mission" button in this unit — it has no action yet.

### `src/features/dashboard/GitHubConnectionCard.tsx`

Server Component. Renders the GitHub repository not-connected state.

```
┌────────────────────────────────────────────┐
│  GitHub repository                         │
│  ─────────────────────────────────────────│
│  [dashed empty box]                        │
│  GitBranch icon (size-8, muted)            │
│  "Not connected"                           │
│  "Connect a repository to enable          │
│   mission commits."                        │
│  [Connect GitHub →]  (secondary button)    │
└────────────────────────────────────────────┘
```

- The card occupies 1/3 of the top row on desktop.
- "Connect GitHub →" is a `<Link>` styled as a secondary button navigating to
  `/settings`. It is not a real GitHub App link yet; that is Unit 06.
- Card background: `var(--bg-surface)`, border: `var(--border-default)`.

### `src/features/dashboard/ProgressSummaryCard.tsx`

Server Component. Displays completed-task count.

Props:

```ts
interface ProgressSummaryCardProps {
  completedTaskCount: number;
}
```

```
┌────────────────────────────────────────────┐
│  📈 Progress                               │
│  ─────────────────────────────────────────│
│  [completedTaskCount]  missions completed  │
│  "Start your first mission to begin        │
│   tracking progress."   (if count is 0)   │
└────────────────────────────────────────────┘
```

- Show the count as a large number (`text-3xl font-semibold`) followed by
  a muted label "missions completed" in `text-sm`.
- When count is 0 show the helper message in muted text below.
- Do not fabricate a streak number or invent percentages. The streak feature
  is introduced in Unit 15.

### `src/features/dashboard/RecentActivitySection.tsx`

Server Component. Renders the recent-activity area.

This unit has no task data query for display. Render the empty state only.

```
┌────────────────────────────────────────────┐
│  Recent activity                           │
│  ─────────────────────────────────────────│
│  History icon (size-8, muted)              │
│  "No activity yet"                         │
│  "Completed missions will appear here."    │
└────────────────────────────────────────────┘
```

- This is a section inside `DashboardShell`, not a full card with a border.
  Use a section heading (`<h2>`) and a simple content block.
- The empty state uses the standard dashed-box pattern.

---

## Route Placeholder Pages

Each of the following is a thin Server Component in the `(app)` route group.
They provide a minimal "coming soon" layout to avoid 404 errors from the nav
links. They share no feature code with the dashboard.

### `/tasks` — `src/app/(app)/tasks/page.tsx`

```
PageContainer width="default", py-10

h1: "Tasks"
p: "Mission generation is coming soon. Complete your GitHub connection first."
Link: "← Back to dashboard"
```

### `/history` — `src/app/(app)/history/page.tsx`

```
PageContainer width="default", py-10

h1: "History"
p: "Your completed missions will appear here after you start generating."
Link: "← Back to dashboard"
```

### `/settings` — `src/app/(app)/settings/page.tsx`

```
PageContainer width="default", py-10

h1: "Settings"
p: "Account settings and GitHub connection are coming soon."
Link: "← Back to dashboard"
```

Each placeholder page must export a `metadata` object with a descriptive
`title`.

---

## AppSidebar

New component: `src/components/layout/AppSidebar.tsx`.

Client Component (`"use client"`) because it uses `usePathname()` for active
state. Renders as a fixed-position left sidebar on `lg` and wider.

```tsx
"use client";

// Props: none — nav items are hardcoded, sign-out is in AppHeader.
export function AppSidebar() { ... }
```

Structure:

```
<aside class="hidden lg:flex fixed top-14 left-0 bottom-0 w-56 flex-col border-r ..."
       style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
  <nav class="flex flex-col gap-1 p-3" aria-label="Main navigation">
    {navItems.map(...)}
  </nav>
</aside>
```

Each nav item renders as:

```tsx
<Link
  href={item.href}
  className={cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    isActive
      ? "bg-[var(--bg-subtle)] text-[var(--text-primary)] font-medium border-l-2 border-[var(--accent-primary)]"
      : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
  )}
>
  <Icon size={20} aria-hidden="true" />
  {item.label}
</Link>
```

`isActive` is `pathname === item.href || pathname.startsWith(item.href + "/")`.

The sidebar is positioned `top-14` so it sits below the `AppHeader` (which is
`h-14`).

### Mobile Sheet Navigation

A `MobileNav` client component is rendered inside `AppHeader` on small
screens. It contains:

- A `Menu` icon button (Lucide, `size-5`) that opens a `Sheet` from the left.
- The sheet content mirrors the `AppSidebar` nav items.
- The sheet closes automatically when a link is navigated.

`MobileNav` is placed in `src/components/layout/MobileNav.tsx`.

The `AppHeader` conditionally renders `<MobileNav />` at the far left of the
header row, visible only on screens smaller than `lg`. The existing nav links
in `AppHeader` are removed — navigation is now fully owned by `AppSidebar`
(desktop) and `MobileNav` (mobile). The wordmark, user info, and sign-out
are retained in `AppHeader`.

---

## AppHeader Changes

The existing `AppHeader` nav links (`navLinks` array in `AppHeader.tsx`) are
removed. Navigation moves to `AppSidebar` and `MobileNav`.

`AppHeader` is updated to:

1. Accept an optional `showMobileNav?: boolean` prop (default `true`). When
   true, render `<MobileNav />` at the left of the header bar (visible only
   on `lg:hidden`).
2. Remove the `navLinks` map and the `Separator` between wordmark and nav.
3. Keep the user info block and sign-out form on the right, unchanged.
4. Keep the wordmark link to `/dashboard` on the left.

The `(app)` layout's `AppHeader` call continues to pass user data. No changes
to how user data is fetched in the layout.

### Main Content Offset

The `(app)` layout wraps the `<main>` element in a container that adds
`lg:pl-56` to accommodate the sidebar on desktop:

```tsx
<main className="flex-1 lg:pl-56">
  {children}
</main>
```

The `AppSidebar` is rendered at the layout level, between `AppHeader` and
`<main>`, so it appears on every `(app)` route.

---

## File Structure

```
src/
├── app/
│   └── (app)/
│       ├── dashboard/
│       │   ├── page.tsx          ← replaced (Server Component, data fetch + render)
│       │   └── loading.tsx       ← new (skeleton)
│       ├── tasks/
│       │   └── page.tsx          ← new (placeholder)
│       ├── history/
│       │   └── page.tsx          ← new (placeholder)
│       ├── settings/
│       │   └── page.tsx          ← new (placeholder)
│       └── layout.tsx            ← updated (add AppSidebar, main offset)
├── components/
│   └── layout/
│       ├── AppHeader.tsx         ← updated (remove nav links, add MobileNav slot)
│       ├── AppSidebar.tsx        ← new
│       └── MobileNav.tsx         ← new
└── features/
    └── dashboard/
        ├── dashboard.service.ts      ← new
        ├── DashboardShell.tsx        ← new
        ├── GoalSummaryCard.tsx       ← new
        ├── MissionCard.tsx           ← new
        ├── GitHubConnectionCard.tsx  ← new
        ├── ProgressSummaryCard.tsx   ← new
        ├── RecentActivitySection.tsx ← new
        └── dashboard.service.test.ts ← new
```

Do not create subdirectories inside `src/features/dashboard/`.

---

## shadcn Components Required

If not already present, add the following via the shadcn CLI before
implementing:

```bash
npx shadcn@latest add sheet skeleton
```

These are needed for `MobileNav` (Sheet) and the dashboard loading skeleton.
Do not hand-modify generated primitives.

---

## Loading State

`src/app/(app)/dashboard/loading.tsx` renders an animated skeleton that
mirrors the dashboard layout shape. Use the `Skeleton` shadcn component or
the `animate-pulse` pattern already used in the onboarding loading skeleton.

The skeleton must include:

- A heading-height block for the welcome header.
- Two side-by-side blocks for the mission card + GitHub card row.
- One full-width block for the goal summary.
- One full-width block for the progress summary.
- One full-width block for the recent activity area.

---

## States

### Dashboard States

| State | Condition | Behaviour |
|---|---|---|
| Loading | Suspense boundary active | `loading.tsx` skeleton |
| Success | Profile and goal present | Full dashboard render |
| No active goal | `activeGoal` is null | Recovery state in `GoalSummaryCard` |
| No profile | `getDashboardData` returns null | Redirect to `/onboarding` |
| Not onboarded | `onboarding_completed_at` is null | Redirect to `/onboarding` |
| Not authenticated | No user session | Proxy redirects to `/login` |

### Card States

Every dashboard card renders one of: loading (via skeleton), empty, or data
state. There is no error banner on individual cards — if a card has no data
it renders its empty state. The overall dashboard error boundary
(`src/app/(app)/error.tsx`) handles unexpected thrown errors.

---

## Design Rules

Refer to `context/ui-context.md` for all token names and values. Key rules
for this unit:

- The left sidebar uses `var(--bg-surface)` background, `var(--border-default)`
  right border, and the active-nav treatment described above.
- Cards use `var(--bg-surface)` background, `var(--border-default)` border,
  `rounded-xl`.
- The welcome heading uses `text-2xl md:text-3xl font-semibold`.
- The goal title inside `GoalSummaryCard` uses `text-base font-semibold`.
- Muted helper text uses `text-sm` with `var(--text-muted)`.
- Do not hardcode hex values in feature components — use CSS variable tokens.
- Use `cn()` for conditional class composition.
- The layout is usable at 320 px viewport width without horizontal overflow.
- Navigation icons use `size-5` (20 px) per `ui-context.md`.
- Empty-state icons use `size-8` or `size-10`.

---

## Accessibility

- The sidebar `<aside>` has `aria-label="Main navigation"` on its inner
  `<nav>`.
- The mobile sheet trigger button has `aria-label="Open navigation"`.
- Active navigation items include `aria-current="page"`.
- All card titles are rendered as semantic `<h2>` elements.
- The welcome heading is an `<h1>`.
- The recent activity section heading is an `<h2>`.
- Progress count number has an associated label (not a standalone number).
- All interactive elements have visible focus indicators.
- The sign-out button in `AppHeader` keeps its existing label.

---

## Tests

### Location

`src/features/dashboard/dashboard.service.test.ts`

### Required Test Cases

Mock `createSupabaseServerClient`. Do not require real Supabase credentials.

| # | Scenario | Expected result |
|---|---|---|
| 1 | Profile exists, active goal exists, 3 committed tasks | Returns correct `DashboardData` with `completedTaskCount: 3` |
| 2 | Profile exists, no active goal | Returns `DashboardData` with `activeGoal: null` |
| 3 | Profile does not exist (Supabase returns null) | Returns `null` |
| 4 | Supabase throws on profile query | Returns `null` (does not throw to caller) |
| 5 | Profile exists, active goal exists, 0 committed tasks | Returns `completedTaskCount: 0` |
| 6 | Active goal query returns an error | Returns `DashboardData` with `activeGoal: null` and `completedTaskCount: 0` |

Minimum: **6 new tests**, bringing the project total to 32+.

---

## What Is Not Changed

- Any SQL migration — the schema is not modified.
- `src/lib/supabase/` clients.
- `src/lib/env/` validation.
- `src/features/auth/` — consumed as-is; not modified.
- `src/features/onboarding/` — consumed as-is; not modified.
- Marketing pages or login page.
- `src/proxy.ts` — the onboarding gate added in Unit 04 is preserved
  unchanged. The proxy is not modified in this unit.
- `.env.local` or environment variables.

---

## Proxy Behaviour (Preserved from Unit 04)

The proxy already handles all routing guards. Unit 05 does not change proxy
logic. For reference, the active behaviour is:

1. Unauthenticated → `/login`.
2. Authenticated + not onboarded + visiting `/dashboard` → `/onboarding`.
3. Authenticated + onboarded + visiting `/onboarding` → `/dashboard`.
4. All other authenticated routes → pass through to page-level checks.

---

## Verification Checklist

- [ ] An onboarded user navigating to `/dashboard` sees their display name or
  GitHub username in the welcome greeting.
- [ ] The greeting word ("morning", "afternoon", "evening") reflects the
  user's stored timezone and the server-side current time.
- [ ] The goal summary card shows the correct title, technology, experience
  level, daily time, and task type from the `goals` table.
- [ ] The mission card renders the empty state (no generate button exists yet).
- [ ] The GitHub connection card renders the not-connected state with a link
  to `/settings`.
- [ ] The progress summary shows `0` missions completed for a new user and
  the correct count for a user who has committed tasks.
- [ ] The recent activity section renders the empty state.
- [ ] The left sidebar is visible on `lg` and wider with all four nav items.
- [ ] The sidebar is hidden on smaller viewports; the hamburger icon appears
  in `AppHeader` on small screens.
- [ ] Opening the mobile menu shows all four nav items in a sheet.
- [ ] Selecting a nav item in the sheet closes the sheet and navigates.
- [ ] The active nav item (current page) has visible highlight styling and
  `aria-current="page"`.
- [ ] `/tasks` renders the placeholder page without errors.
- [ ] `/history` renders the placeholder page without errors.
- [ ] `/settings` renders the placeholder page without errors.
- [ ] Navigating to `/dashboard` while not authenticated redirects to `/login`.
- [ ] Navigating to `/dashboard` while authenticated but not onboarded
  redirects to `/onboarding`.
- [ ] If `activeGoal` is null, the `GoalSummaryCard` shows the recovery state
  with a link to `/onboarding`.
- [ ] No fabricated data, fake statistics, or sample activity is shown.
- [ ] The dashboard loading skeleton renders while data is being fetched.
- [ ] The layout is usable at 320 px viewport width without horizontal scroll.
- [ ] All navigation items are keyboard-accessible.
- [ ] All card titles use semantic heading elements.
- [ ] The `SUPABASE_SECRET_KEY` is not used for any read on this page.
- [ ] `npm run lint` passes with no errors.
- [ ] `npm run typecheck` passes with no errors.
- [ ] `npm run test` passes (32+ total tests including 6+ new dashboard tests).
- [ ] `npm run build` passes.
- [ ] `context/progress-tracker.md` records Unit 05 completion.

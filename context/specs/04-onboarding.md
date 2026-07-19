# Unit 04: Onboarding

## Goal

Build first-time onboarding for authenticated Blumo users. After completing
onboarding, the user has a saved profile with their experience level and
timezone, and one active learning goal containing their technology, preferred
task type, and daily available time. The user is then redirected to the
dashboard. Authenticated users who have already completed onboarding are
redirected away from `/onboarding` to `/dashboard`.

---

## Dependencies

- Unit 03 complete: `profiles` and `goals` tables exist on the remote Supabase
  project with RLS and constraints active.
- Unit 02 complete: authenticated session available via the Supabase server
  client.
- shadcn/ui components `input`, `label`, `select`, and `textarea` available
  (add if not already present).
- `react-hook-form` and `@hookform/resolvers` installed.

---

## Scope

### Included

- `/onboarding` route in the `(app)` route group.
- Onboarding form: all six fields defined below.
- Zod validation schema: `src/features/onboarding/onboarding.schema.ts`.
- Server Action: `src/features/onboarding/onboarding.actions.ts`.
- Onboarding service: `src/features/onboarding/onboarding.service.ts`.
- Redirect logic: users without `onboarding_completed_at` are sent to
  `/onboarding`; users who have completed it are sent away.
- Proxy update: extend the existing `src/proxy.ts` to redirect unonboarded
  authenticated users from `/dashboard` to `/onboarding`.
- Unit tests for schema validation and the service layer.
- shadcn components added: `input`, `label`, `select`, `textarea` (if absent).

### Explicitly Excluded

- GitHub App connection.
- AI task generation.
- Resend email.
- Scheduling.
- Payments.
- Dashboard redesign beyond the onboarding redirect gate.
- Profile edit page (that belongs to the Settings unit).
- Timezone auto-detection (the user selects from a list; detection requires
  separate consent and belongs to a later settings unit).

---

## Onboarding Fields

### 1. Development Goal (`title`)

| Property | Value |
|---|---|
| Type | Free-text |
| Column | `goals.title` |
| Validation | Non-empty string, 5–200 characters |
| Placeholder | e.g. "Get a junior React developer job" |
| Why shown | Blumo uses this to tailor mission difficulty and content. |

### 2. Technology (`technology`)

| Property | Value |
|---|---|
| Type | Free-text (the MVP uses a text input, not a fixed enum) |
| Column | `goals.technology` |
| Validation | Non-empty string, 1–80 characters |
| Placeholder | e.g. "React", "Python", "TypeScript" |
| Why shown | Blumo generates missions using the specific language or framework. |

### 3. Experience Level (`experience_level`)

| Property | Value |
|---|---|
| Type | Select |
| Column | `profiles.experience_level` |
| Allowed values | `beginner`, `intermediate`, `advanced` |
| Default | `beginner` |
| Labels | Beginner (< 1 year), Intermediate (1–3 years), Advanced (3+ years) |
| Why shown | Blumo adjusts mission complexity to match current skill. |

### 4. Daily Available Minutes (`daily_minutes`)

| Property | Value |
|---|---|
| Type | Select |
| Column | `goals.daily_minutes` |
| Allowed values | `10`, `20`, `30`, `45`, `60` |
| Labels | "10 minutes", "20 minutes", "30 minutes", "45 minutes", "1 hour" |
| Default | `30` |
| Why shown | Blumo sizes each mission to fit the available time. |

### 5. Preferred Task Type (`task_type`)

| Property | Value |
|---|---|
| Type | Select |
| Column | `goals.task_type` |
| Allowed values | `learning_note`, `coding_challenge`, `documentation`, `interview_preparation` |
| Labels | Learning note, Coding challenge, Documentation, Interview preparation |
| Default | `learning_note` |
| Why shown | Blumo matches the mission format to what the user finds most useful. |

### 6. Timezone (`timezone`)

| Property | Value |
|---|---|
| Type | Select |
| Column | `profiles.timezone` |
| Allowed values | A curated list of IANA timezone strings covering all UTC offsets |
| Default | `UTC` |
| Why shown | Blumo records mission dates relative to the user's local day. |

#### Timezone List

Include the following IANA identifiers as a minimum (implementer may add more;
do not use abbreviations such as "EST" because they are ambiguous):

```
Pacific/Midway       UTC−11
Pacific/Honolulu     UTC−10
America/Anchorage    UTC−9
America/Los_Angeles  UTC−8
America/Denver       UTC−7
America/Chicago      UTC−6
America/New_York     UTC−5
America/Halifax      UTC−4
America/Sao_Paulo    UTC−3
Atlantic/Azores      UTC−1
UTC                  UTC+0
Europe/London        UTC+0/+1
Europe/Paris         UTC+1/+2
Europe/Helsinki      UTC+2/+3
Europe/Moscow        UTC+3
Asia/Dubai           UTC+4
Asia/Karachi         UTC+5
Asia/Kolkata         UTC+5:30
Asia/Dhaka           UTC+6
Asia/Bangkok         UTC+7
Asia/Singapore       UTC+8
Asia/Tokyo           UTC+9
Australia/Sydney     UTC+10/+11
Pacific/Auckland     UTC+12/+13
```

Display format in the select: `"(UTC+5:30) Asia/Kolkata"` — offset first,
then the canonical IANA name.

---

## User Flow

```
Authenticated user visits /dashboard
  │
  ├─► Profile has onboarding_completed_at set
  │     └─► Proceed to /dashboard (normal flow)
  │
  └─► Profile has no onboarding_completed_at
        └─► Proxy redirects to /onboarding

Authenticated user visits /onboarding
  │
  ├─► Profile has onboarding_completed_at set
  │     └─► Proxy redirects to /dashboard
  │
  └─► Profile has no onboarding_completed_at
        └─► Render onboarding form

User fills in the form and submits
  │
  └─► Client validates with React Hook Form + Zod
        │
        ├─► Validation fails → show field errors, do not submit
        │
        └─► Validation passes → call Server Action
              │
              ├─► Server authenticates user (getUser())
              ├─► Server validates input with Zod (independent of client)
              ├─► Server checks no existing active goal (guard against double-submit)
              ├─► Server UPDATE profiles SET experience_level, timezone
              ├─► Server INSERT INTO goals (user_id, title, technology, ...)
              ├─► Server UPDATE profiles SET onboarding_completed_at = now()
              │
              ├─► Any step fails → return error, preserve client form state
              │
              └─► All steps succeed → redirect to /dashboard
```

---

## Data Behaviour

### Profiles Update

Update only `experience_level` and `timezone` on the authenticated user's
profile row. Do not overwrite `github_username`, `display_name`, `avatar_url`,
or `github_user_id` — these are set by the auth trigger and must not be
replaced during onboarding.

### Goal Insert

Insert one row into `goals` with `status = 'active'`. The `user_id` is taken
from the server-side authenticated session — never from a client-provided
value.

The partial unique index `goals_one_active_per_user_idx` enforces the
one-active-goal constraint at the database level. The Server Action must also
check for an existing active goal before inserting to provide a clear user-
facing error rather than relying solely on the database constraint message.

### `onboarding_completed_at` Sequencing

Set `profiles.onboarding_completed_at = now()` only after all other writes
succeed. If the profile update or goal insert fails, `onboarding_completed_at`
remains null and the user can retry.

This is the sentinel that the proxy uses to determine whether onboarding is
complete. Setting it prematurely would allow a user with a broken goal record
to bypass onboarding without valid data.

### Write Strategy

All writes use the Supabase **server client** (anon key, RLS enforced). The
server action:

1. Calls `getUser()` to retrieve the authenticated identity.
2. Issues an UPDATE on `profiles` where `id = auth.uid()`.
3. Issues an INSERT on `goals` with `user_id` set to `user.id` by the server.
4. Issues a second UPDATE on `profiles` to set `onboarding_completed_at`.

Steps 2, 3, and 4 are issued as separate queries. If step 3 fails, step 4 is
not executed. Because all writes use RLS, a user cannot affect another user's
rows even if the client sends crafted data.

A future schema migration could wrap these in a PostgreSQL transaction via an
RPC function if atomic multi-table writes become necessary. For Unit 04, the
sequential approach is sufficient because each step is independently
idempotent or guarded.

### No Duplicate Active Goals

Before inserting, the Server Action queries `goals` for an existing row where
`user_id = user.id` and `status = 'active'`. If one exists:

- If `profiles.onboarding_completed_at` is already set, redirect to `/dashboard`.
- If `onboarding_completed_at` is null (partial write from a previous attempt),
  return an error asking the user to refresh and try again, or complete the
  `onboarding_completed_at` update and redirect.

---

## Proxy Update

In `src/proxy.ts`, after refreshing the session and confirming the user is
authenticated, add a check for the onboarding gate:

```
Authenticated user → load profile (getProfile()) → check onboarding_completed_at
  │
  ├─► Accessing /onboarding and onboarding IS complete → redirect to /dashboard
  ├─► Accessing /dashboard (or other app routes) and onboarding NOT complete
  │     → redirect to /onboarding
  └─► All other cases → pass through
```

**Performance note:** the proxy runs on every request. The profile fetch must
be lightweight — select only `id` and `onboarding_completed_at`. Use the
Supabase server client (not the admin client) so RLS is enforced.

The `/api/auth/callback` and `/login` routes must never be gated by the
onboarding check.

---

## File Structure

```
src/
├── app/
│   └── (app)/
│       └── onboarding/
│           ├── page.tsx              ← Server Component, loads user + profile
│           └── loading.tsx           ← Skeleton (reuse app-level pattern)
├── features/
│   └── onboarding/
│       ├── onboarding.schema.ts      ← Zod schema + inferred types
│       ├── onboarding.actions.ts     ← Server Action ("use server")
│       ├── onboarding.service.ts     ← Database write logic (server-only)
│       ├── OnboardingForm.tsx        ← "use client" React Hook Form component
│       ├── OnboardingForm.test.tsx   ← Client-side schema + render tests
│       └── onboarding.service.test.ts ← Service unit tests
```

Do not create feature-level subdirectory folders for individual concerns
(no `components/`, `hooks/`, etc.) — keep the onboarding feature flat as
defined above.

---

## Schema and Validation

### `src/features/onboarding/onboarding.schema.ts`

```ts
import { z } from "zod";

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const DAILY_MINUTES = [10, 20, 30, 45, 60] as const;
export type DailyMinutes = (typeof DAILY_MINUTES)[number];

export const TASK_TYPES = [
  "learning_note",
  "coding_challenge",
  "documentation",
  "interview_preparation",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const onboardingSchema = z.object({
  title: z
    .string()
    .min(5, "Goal must be at least 5 characters.")
    .max(200, "Goal must be 200 characters or fewer."),

  technology: z
    .string()
    .min(1, "Technology is required.")
    .max(80, "Technology must be 80 characters or fewer."),

  experience_level: z.enum(EXPERIENCE_LEVELS, {
    errorMap: () => ({ message: "Select a valid experience level." }),
  }),

  daily_minutes: z.coerce
    .number()
    .refine((v): v is DailyMinutes => (DAILY_MINUTES as readonly number[]).includes(v), {
      message: "Select a valid daily time.",
    }),

  task_type: z.enum(TASK_TYPES, {
    errorMap: () => ({ message: "Select a valid task type." }),
  }),

  timezone: z
    .string()
    .min(1, "Timezone is required.")
    .max(60, "Timezone value is too long."),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
```

---

## Server Action

### `src/features/onboarding/onboarding.actions.ts`

```ts
"use server";

import { redirect } from "next/navigation";
import { onboardingSchema } from "./onboarding.schema";
import { saveOnboarding } from "./onboarding.service";
import { getUser } from "@/features/auth/get-user";
import type { ActionResult } from "@/types/action-result";

export async function submitOnboarding(
  _prev: ActionResult<null>,
  formData: FormData
): Promise<ActionResult<null>> {
  const user = await getUser();
  if (!user) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "You must be signed in." },
    };
  }

  const raw = {
    title: formData.get("title"),
    technology: formData.get("technology"),
    experience_level: formData.get("experience_level"),
    daily_minutes: formData.get("daily_minutes"),
    task_type: formData.get("task_type"),
    timezone: formData.get("timezone"),
  };

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Please fix the errors and try again.",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    };
  }

  const result = await saveOnboarding(user.id, parsed.data);
  if (!result.ok) return result;

  redirect("/dashboard");
}
```

---

## Service

### `src/features/onboarding/onboarding.service.ts`

```ts
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingInput } from "./onboarding.schema";
import type { ActionResult } from "@/types/action-result";

export async function saveOnboarding(
  userId: string,
  input: OnboardingInput
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();

  // Guard: check for an existing active goal to prevent duplicates.
  const { data: existingGoal } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existingGoal) {
    // Check whether onboarding was already completed.
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userId)
      .single();

    if (profile?.onboarding_completed_at) {
      // Already complete — this should have been caught by the proxy.
      return {
        ok: false,
        error: {
          code: "ALREADY_ONBOARDED",
          message: "Onboarding is already complete.",
        },
      };
    }

    // Partial write from a previous attempt: active goal exists but
    // onboarding_completed_at was not set. Complete it now.
    const { error: completeError } = await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", userId);

    if (completeError) {
      return {
        ok: false,
        error: {
          code: "DB_ERROR",
          message: "Something went wrong. Please try again.",
        },
      };
    }

    return { ok: true, data: null };
  }

  // Step 1: Update profile preferences.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      experience_level: input.experience_level,
      timezone: input.timezone,
    })
    .eq("id", userId);

  if (profileError) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Could not save your preferences. Please try again.",
      },
    };
  }

  // Step 2: Create the active goal.
  const { error: goalError } = await supabase.from("goals").insert({
    user_id: userId,
    title: input.title,
    technology: input.technology,
    task_type: input.task_type,
    daily_minutes: input.daily_minutes,
    status: "active",
  });

  if (goalError) {
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Could not save your goal. Please try again.",
      },
    };
  }

  // Step 3: Mark onboarding complete — only after all other writes succeed.
  const { error: completeError } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId);

  if (completeError) {
    // Goal was created but the sentinel was not set.
    // The next attempt will detect the existing active goal and complete it.
    return {
      ok: false,
      error: {
        code: "DB_ERROR",
        message: "Almost done — please try submitting one more time.",
      },
    };
  }

  return { ok: true, data: null };
}
```

---

## Shared Type

Create `src/types/action-result.ts` to hold the normalized result type (if
not already present from Unit 02/03):

```ts
export type ActionResult<T> =
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

---

## UI and Design

### Route: `src/app/(app)/onboarding/page.tsx`

Server Component. Fetches the current user and profile. If `onboarding_completed_at`
is already set (the proxy should have redirected, but be defensive), redirects
to `/dashboard`. Otherwise renders `<OnboardingForm />`.

The page has no visible `AppHeader` navigation — use the existing `(app)` layout.
The header is shown; there is no separate minimal layout for onboarding.

### Component: `src/features/onboarding/OnboardingForm.tsx`

Client Component (`"use client"`). Uses React Hook Form with Zod resolver and
`useActionState` (Next.js 15+) or `useFormState` to communicate with the Server
Action.

#### Layout

```
┌─────────────────────────────────────────┐
│  ← Blumo header (from (app) layout)     │
├─────────────────────────────────────────┤
│                                         │
│  Set up your learning profile           │
│  ────────────────────────────────────   │
│                                         │
│  Progress: ██████░░ Step 1 of 1         │
│                                         │
│  [Field group: Goal]                    │
│  [Field group: Technology]              │
│  [Field group: Experience Level]        │
│  [Field group: Daily Time]              │
│  [Field group: Task Type]               │
│  [Field group: Timezone]                │
│                                         │
│  [Get started →]  (primary button)      │
│                                         │
│  Recoverable error banner (if any)      │
└─────────────────────────────────────────┘
```

All six fields are presented on a single page (not multi-step), inside a
centred `PageContainer` with `width="narrow"`. This matches the "short grouped
form" pattern from `context/ui-context.md`.

#### Field Group Pattern

Each field group consists of:

1. `<label>` — field label, `text-sm font-medium`.
2. Brief `<p>` — one-sentence explanation of why Blumo asks, `text-xs text-muted`.
3. The input control (Input, Select, or Textarea).
4. Error message — `text-sm text-error` immediately below the field.

#### Progress Indicator

A simple linear progress bar at the top of the form area. Since the entire
form is one page, show `100%` fill on first render (this communicates the
task is bounded, not open-ended). Use the `Progress` shadcn component or a
plain styled `div` with the `--accent-primary` token.

#### Button States

- Default: enabled, "Get started" label.
- Pending (form submitting): disabled, spinner icon, "Saving…" label.
- Use `aria-disabled="true"` and `cursor-not-allowed` while pending.

#### Error Banner

If the Server Action returns an `ok: false` result with a top-level `message`,
display it in a styled error banner above the submit button:

```
┌───────────────────────────────────────┐
│ ⚠  Something went wrong. Please try  │
│    again or contact support.          │
└───────────────────────────────────────┘
```

Colour tokens: `--state-error-soft` background, `--state-error` border and text.

#### Accessibility

- All controls have associated `<label>` elements connected via `htmlFor`/`id`.
- Required fields have `aria-required="true"`.
- Field errors have `aria-describedby` pointing to the error element.
- Focus moves to the first field with an error after a failed submission.
- The form does not reset on recoverable errors.
- Select controls use native `<select>` wrapped in the shadcn `Select` component
  for consistent styling and keyboard behaviour.

---

## shadcn Components Required

Add the following if not already present (use the shadcn CLI):

```bash
npx shadcn@latest add input label select textarea progress
```

These live in `src/components/ui/` and must not be hand-modified.

---

## Tests

### Location

`src/features/onboarding/`

### Required Test Cases

#### Zod Schema Tests — `onboarding.schema.test.ts`

| # | Input | Expected result |
|---|---|---|
| 1 | All valid values | Parse succeeds, returned object matches input |
| 2 | `title` = 4 characters (below minimum) | Parse fails, `title` error present |
| 3 | `title` = 201 characters (above maximum) | Parse fails, `title` error present |
| 4 | `experience_level` = `"expert"` (invalid enum) | Parse fails |
| 5 | `experience_level` = `"beginner"` | Parse succeeds |
| 6 | `daily_minutes` = `15` (not in allowed set) | Parse fails |
| 7 | `daily_minutes` = `"30"` (string coerced to 30) | Parse succeeds, value is number 30 |
| 8 | `task_type` = `"unknown_type"` | Parse fails |
| 9 | `technology` = `""` (empty) | Parse fails |
| 10 | `timezone` = `""` (empty) | Parse fails |

#### Service Tests — `onboarding.service.test.ts`

Mock `createSupabaseServerClient` and `getUser`. Do not require real
Supabase credentials.

| # | Scenario | Expected result |
|---|---|---|
| 1 | No existing goal, all writes succeed | Returns `{ ok: true, data: null }` |
| 2 | `profileError` on UPDATE profiles | Returns `ok: false` with `DB_ERROR` code |
| 3 | `goalError` on INSERT goals | Returns `ok: false` with `DB_ERROR` code |
| 4 | Existing active goal, `onboarding_completed_at` is null | Completes the sentinel and returns `ok: true` |
| 5 | Existing active goal, `onboarding_completed_at` is set | Returns `ok: false` with `ALREADY_ONBOARDED` code |
| 6 | Unauthenticated call (no user) | Returns `ok: false` with `UNAUTHENTICATED` code |

Minimum: **at least 10 passing new tests**, bringing the project total to 20+.

---

## Proxy Changes

The `src/proxy.ts` file requires a lightweight extension for the onboarding
gate. The change must not break the existing session-refresh behaviour.

### Logic Addition

After the session refresh and authenticated-user check:

```ts
// If user is authenticated, check onboarding status for relevant paths.
if (user) {
  const isOnboardingPath = pathname === "/onboarding" ||
                           pathname.startsWith("/onboarding/");
  const isProtectedAppPath = isProtectedPath(pathname) && !isOnboardingPath;

  // Fetch minimal profile (id + onboarding_completed_at only).
  // Use the server client with the session already refreshed.
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  const isOnboarded = !!profile?.onboarding_completed_at;

  if (isOnboardingPath && isOnboarded) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedAppPath && !isOnboarded) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
}
```

**Important:** The profile query in the proxy must:
- Select only `onboarding_completed_at` — do not fetch unnecessary columns.
- Use `maybeSingle()` — if the profile row does not exist yet (edge case during
  trigger propagation delay), treat as not onboarded and let the user proceed
  to `/onboarding`.
- Not use the admin client — use the session-refreshed server client so RLS
  applies and the operation stays within the anon-key permission boundary.

---

## Verification Checklist

- [ ] All six onboarding fields render on `/onboarding` with correct labels and
  helper text.
- [ ] Each field shows its error message when invalid and the form is submitted.
- [ ] A valid submission creates a `goals` row and updates `profiles.experience_level`,
  `profiles.timezone`, and `profiles.onboarding_completed_at` in the remote
  database.
- [ ] After successful submission the user is redirected to `/dashboard`.
- [ ] Navigating to `/onboarding` while already onboarded redirects to `/dashboard`.
- [ ] Navigating to `/dashboard` while not onboarded redirects to `/onboarding`.
- [ ] The Server Action returns a field error when `title` is fewer than 5
  characters.
- [ ] The Server Action returns an error when called without an authenticated
  session.
- [ ] A second call with the same user does not create a duplicate active goal.
- [ ] The proxy does not block `/api/auth/callback` or `/login`.
- [ ] `SUPABASE_SECRET_KEY` is not used during onboarding writes (anon key only).
- [ ] Form state is preserved on recoverable errors (entered values are not cleared).
- [ ] Submit button is disabled and shows "Saving…" while the action is pending.
- [ ] Layout is usable at 320 px viewport width without horizontal overflow.
- [ ] All form controls are keyboard-accessible and focus indicators are visible.
- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes (20+ total tests including 10+ new onboarding tests).
- [ ] `npm run build` passes.
- [ ] `context/progress-tracker.md` records Unit 04 completion.

---

## What Is Not Changed

- Any SQL migration — the schema is not modified by this unit.
- `src/lib/supabase/` clients — unchanged.
- `src/lib/env/` — unchanged.
- `src/features/auth/` — only `get-user.ts` and `get-profile.ts` are consumed,
  not modified.
- Marketing pages, login page, auth callback — unchanged.
- `AppHeader` — unchanged.
- No new environment variables are introduced.

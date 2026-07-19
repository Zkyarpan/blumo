# Blumo — Email and Notification Context

## Email Providers

Blumo uses Resend in two ways:

1. **Supabase Auth SMTP**
   - Authentication-related email delivery.
   - Sender: `Blumo <no-reply@mail.arpankarki.com.np>`.

2. **Resend API**
   - Product and progress notifications.
   - Called only from trusted server or Edge Function code.

The verified email subdomain is:

```text
mail.arpankarki.com.np
```

## Sender Identities

| Purpose | From |
|---|---|
| Authentication and security | `Blumo <no-reply@mail.arpankarki.com.np>` |
| Daily task notification | `Blumo Tasks <tasks@mail.arpankarki.com.np>` |
| Weekly progress | `Blumo Progress <progress@mail.arpankarki.com.np>` |
| Support response | `Blumo Support <support@mail.arpankarki.com.np>` |

For the MVP, support emails use:

```text
Reply-To: arpan.karki.work@gmail.com
```

A sender address is not automatically a mailbox. Do not promise an inbox at `support@...` unless inbound mail is configured.

## API Keys

Create separate keys:

### `Blumo Supabase Auth`

Used only as the Supabase custom SMTP password.

### `Blumo Product Emails`

Used by server-only Blumo code for Resend API calls.

Do not reuse the product key in browser code.

## MVP Email Events

### Welcome

Trigger:

- First successful onboarding completion.

Purpose:

- Confirm the user's goal and explain the next step: connect a repository.

### GitHub Connected

Trigger:

- Verified installation and selected repository.

Purpose:

- Confirm repository connection and remind the user they remain in control.

### Repository Access Removed

Trigger:

- Verified GitHub webhook reports repository removal.

Purpose:

- Explain that Blumo can no longer create contributions in that repository.

### GitHub App Uninstalled or Suspended

Trigger:

- Verified GitHub installation webhook.

Purpose:

- Confirm the connection status and provide a reconnect path.

### Mission Ready — Phase 2

Trigger:

- Scheduled task draft generated successfully.

Purpose:

- Bring the user back to review and complete the task.

### Weekly Progress — Phase 2

Trigger:

- End-of-week summary for users who have opted in.

Content based only on real task and commit records:

- Tasks completed.
- Skills practised.
- Consistency.
- Selected recent commits.
- Suggested next focus.

## Email Rules

1. Do not include private source code in email.
2. Do not claim that a commit exists until the commit record is confirmed.
3. Do not send a mission-ready email if task generation failed.
4. Do not send duplicate event emails; use idempotency records or provider identifiers.
5. Use a single primary action per email.
6. Provide notification controls in settings.
7. Separate operational notifications from optional marketing.
8. Keep provider limits configurable rather than hardcoded into product promises.
9. Escape all user-controlled text used in HTML email templates.
10. Use absolute URLs based on the validated application base URL.

## Supabase SMTP Settings

Use:

```text
Host: smtp.resend.com
Port: 465
Username: resend
Password: the Blumo Supabase Auth Resend key
Sender name: Blumo
Sender email: no-reply@mail.arpankarki.com.np
```

## Product Email Module

Suggested files:

```text
src/lib/email/client.ts
src/lib/email/types.ts
src/lib/email/send-welcome.ts
src/lib/email/send-github-connected.ts
src/lib/email/send-connection-alert.ts
src/lib/email/send-daily-task.ts
src/lib/email/send-weekly-progress.ts
```

Each send function:

- Accepts a typed input.
- Performs no database ownership decisions.
- Returns a normalized delivery result.
- Throws or returns a safe internal error.
- Never exposes the Resend key.

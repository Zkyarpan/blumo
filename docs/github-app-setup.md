# Blumo GitHub App — Setup Guide

This guide walks through the one-time manual steps required to register the
Blumo GitHub App for local development and, later, for production. It is
referenced by `context/specs/06-github-app-installation-start.md`.

---

## 1. Create the Development GitHub App

1. Go to <https://github.com/settings/apps/new>.
2. Fill in the form:

   | Field | Local development value |
   |---|---|
   | GitHub App name | `Blumo Development` |
   | Description | AI developer growth platform — development instance |
   | Homepage URL | `http://localhost:3000` |
   | Callback URL | *(leave blank — not used by this App)* |
   | Setup URL | `http://localhost:3000/api/github/setup` |
   | Webhook URL | Public HTTPS origin plus `/api/github/webhook` (use Smee forwarding locally) |
   | Webhook secret | A randomly generated secret (store in `.env.local`) |

   > **Callback URL vs Setup URL:** Blumo uses the GitHub App *setup URL*
   > flow, not OAuth app callbacks. When a user installs or configures the
   > App on GitHub, GitHub redirects to the Setup URL with an
   > `installation_id` query parameter. The Callback URL field can be left
   > empty until a future unit requires user-to-app OAuth.
   >
   > Website sign-in is separate and owned by Supabase Auth. Do not put
   > `/api/github/callback` in the repository GitHub App's Setup URL. If the
   > same GitHub App OAuth credentials are deliberately used as Supabase's
   > GitHub provider, its OAuth Callback URL must be
   > `https://qznladkcqldqktqyrrzi.supabase.co/auth/v1/callback`; Supabase then
   > redirects the browser to Blumo's `/api/github/callback`.

3. Under **Webhook**, set **Active** to **checked**. The Unit 09 endpoint is
   `POST /api/github/webhook`; GitHub must be able to reach it through HTTPS.

4. Under **Repository permissions**, set:

   | Permission | Access level |
   |---|---|
   | Contents | Read and write |
   | Metadata | Read-only (mandatory; always selected) |

   Leave all other repository permissions and all account/organisation
   permissions at **No access**. Do not enable:
   - Administration
   - Actions
   - Workflows
   - Secrets
   - Deployments
   - Members
   - Issues
   - Pull requests

5. Ensure GitHub delivers the default GitHub App lifecycle events:
   - Installation
   - Installation repositories

   These lifecycle events are default GitHub App events rather than ordinary
   optional subscriptions. Do not enable unrelated events or broaden permissions.

6. Under **Where can this GitHub App be installed?**, select:
   **Only on this account** (keep the app private during development).

7. Click **Create GitHub App**.

---

## 2. Record the App Identifiers

After creation, GitHub shows the App settings page. Note:

- **App ID** — an integer, e.g. `1234567`.
- **App slug** — the lowercase hyphenated name, visible in the URL:
  `https://github.com/apps/blumo-development`.
- **Client ID** — shown under "OAuth credentials" (only needed if you use
  user-to-app OAuth; not required for Unit 06).

---

## 3. Generate a Private Key

1. Scroll to **Private keys** at the bottom of the App settings page.
2. Click **Generate a private key**.
3. GitHub downloads a `.pem` file. Keep it safe — it cannot be retrieved
   again; only regenerated.
4. The file content begins with `-----BEGIN RSA PRIVATE KEY-----`.
5. Convert the multi-line PEM to a single environment variable by replacing
   every newline with `\n`:

   ```bash
   # On macOS / Linux
   awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' blumo-development.YYYY-MM-DD.private-key.pem
   ```

   Paste the output as the value of `GITHUB_APP_PRIVATE_KEY` in `.env.local`.
   The application normalises `\n` back to real newlines at startup.

---

## 4. Record the Webhook Secret

Generate a random secret:

```bash
openssl rand -hex 32
```

Set this as the webhook secret in the GitHub App settings and store the same
value in `.env.local` as `GITHUB_WEBHOOK_SECRET`.

---

## 5. Populate `.env.local`

Add the following block to `.env.local`. Never commit this file.

```dotenv
# GitHub App — Development instance
GITHUB_APP_ID=1234567
GITHUB_APP_SLUG=blumo-development
GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n
GITHUB_WEBHOOK_SECRET=<hex string from openssl>

# Optional — only required when user-to-app OAuth is introduced (Unit 07+)
# GITHUB_APP_CLIENT_ID=Iv1.abc123
# GITHUB_APP_CLIENT_SECRET=<secret>
```

> **Newline handling:** `GITHUB_APP_PRIVATE_KEY` must have every real newline
> replaced with a literal `\n` so the value survives `.env.local` parsing.
> The `github-app.config.ts` module normalises `\\n` back to `\n` on first
> read.

---

## 6. Verify Local Setup

After completing Unit 06 implementation:

1. Start the development server: `npm run dev`.
2. Sign in and navigate to `/github/connect`.
3. Click **Connect GitHub**. You should be redirected to GitHub's App
   installation page.
4. Install on a personal repository.
5. GitHub redirects to `http://localhost:3000/api/github/setup?installation_id=…`
   (this route is implemented in Unit 07).

---

## 7. Webhook Forwarding for Local Development (Unit 09)

Webhook processing is implemented at `POST /api/github/webhook`. For local
verification, use [smee.io](https://smee.io) or the
[GitHub CLI webhook forwarder](https://cli.github.com/) to forward GitHub
webhook events to `http://localhost:3000/api/github/webhook`.

```bash
npx smee-client --url https://smee.io/<channel> --path /api/github/webhook --port 3000
```

Keep the Webhook **Active** toggle enabled and use the same high-entropy secret in
GitHub and `GITHUB_WEBHOOK_SECRET`. Test `installation` and
`installation_repositories` deliveries from the GitHub App's **Advanced** page.
Never paste the webhook secret into Smee messages, logs, screenshots, or source.

---

## 8. Supabase Custom SMTP (Resend)

Configure Supabase to deliver authentication emails (confirmation, password
reset, magic link, change-email) through Resend so they arrive from
`no-reply@mail.arpankarki.com.np`.

> **This is a one-time manual step in the Supabase dashboard.** It is NOT
> configured through environment variables in the application.

### Steps

1. Go to your Supabase project dashboard.
2. Navigate to: **Authentication → SMTP Settings**.
3. Enable **Custom SMTP**.
4. Fill in the following fields:

   | Field | Value |
   |---|---|
   | SMTP Host | `smtp.resend.com` |
   | Port | `587` |
   | Username | `resend` |
   | Password | Your **Blumo Supabase Auth** Resend API key (a separate key from product email) |
   | Sender name | `Blumo` |
   | Sender email | `no-reply@mail.arpankarki.com.np` |

5. Click **Save**.

> **Key isolation:** Use a separate Resend API key (`Blumo Supabase Auth`) for
> SMTP — distinct from the `Blumo Product Emails` key used by the application.
> This allows each key to be rotated independently.

### Site URL and Redirect URLs

Also configure under **Authentication → URL Configuration**:

| Field | Local development | Production |
|---|---|---|
| Site URL | `http://localhost:3000` | `https://blumo-ten.vercel.app` |
| Redirect URLs | `http://localhost:3000/api/github/callback` | `https://blumo-ten.vercel.app/api/github/callback` |

### Supabase Auth Email Templates

The following Supabase-owned email templates are configured in the Supabase
dashboard under **Authentication → Email Templates**. Do NOT duplicate them
through the Resend API — Supabase owns these flows entirely.

- **Confirmation email** — sent after sign-up, contains confirmation link.
- **Reset password** — sent when a user requests a password reset.
- **Magic link** — sent for passwordless sign-in (if enabled).
- **Change email address** — sent when a user changes their email.

None of these templates should be replicated or triggered through the
application's Resend product email code.

---

## 9. Production Setup Checklist

When deploying to Vercel:

- Create a separate **Blumo** (production) GitHub App.
- Set Homepage URL to `https://blumo-ten.vercel.app`.
- Set Setup URL to `https://blumo-ten.vercel.app/api/github/setup`.
- Activate webhooks and set the Webhook URL to
  `https://blumo-ten.vercel.app/api/github/webhook`.
- Change visibility to **Public** only if you want any GitHub user to be
  able to install; keep it **Private** for the closed beta.
- Add all environment variables to the Vercel project settings under
  **Environment Variables → Production**:
  - All `GITHUB_APP_*` values
  - `SUPABASE_SECRET_KEY`
  - `RESEND_API_KEY` (product email key, starts with `re_`)
  - `RESEND_AUTH_FROM`, `RESEND_TASKS_FROM`, `RESEND_PROGRESS_FROM`, `RESEND_SUPPORT_FROM`
  - `RESEND_REPLY_TO`
  - `NEXT_PUBLIC_SITE_URL` set to the production URL
- Configure Supabase custom SMTP with the **Blumo Supabase Auth** Resend key.
- Never expose the private key, webhook secret, or any Resend key in source
  code, logs, client bundles, or API responses.

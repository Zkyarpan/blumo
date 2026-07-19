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
   | Webhook URL | `https://smee.io/<your-channel>` (or leave disabled for Unit 06) |
   | Webhook secret | A randomly generated secret (store in `.env.local`) |

   > **Callback URL vs Setup URL:** Blumo uses the GitHub App *setup URL*
   > flow, not OAuth app callbacks. When a user installs or configures the
   > App on GitHub, GitHub redirects to the Setup URL with an
   > `installation_id` query parameter. The Callback URL field can be left
   > empty until a future unit requires user-to-app OAuth.

3. Under **Webhook**, set **Active** to **unchecked** for Unit 06.
   Webhooks are activated and verified in Unit 09.

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

5. Under **Subscribe to events**, check:
   - Installation
   - Installation repositories

   Do not check any other events.

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

Webhook processing is deferred to Unit 09. When you reach that unit,
use [smee.io](https://smee.io) or the
[GitHub CLI webhook forwarder](https://cli.github.com/) to forward GitHub
webhook events to `http://localhost:3000/api/github/webhook`.

```bash
npx smee-client --url https://smee.io/<channel> --path /api/github/webhook --port 3000
```

---

## 8. Production Setup Checklist

When deploying to Vercel (Unit 19):

- Create a separate **Blumo** (production) GitHub App.
- Set Homepage URL and Setup URL to the production domain.
- Activate webhooks and point them at the production webhook endpoint.
- Change visibility to **Public** only if you want any GitHub user to be
  able to install; keep it **Private** for the closed beta.
- Add all environment variables to the Vercel project settings under
  **Environment Variables → Production**.
- Never expose the private key or webhook secret in source code or logs.

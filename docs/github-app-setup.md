# Blumo GitHub App Setup Guide

Create this during Build Unit 06, after website login and the dashboard foundation work.

## Purpose

The GitHub App gives Blumo access only to repositories selected by the user and only with explicitly requested permissions.

Do not use:

- User passwords.
- Personal access tokens.
- A broad OAuth `repo` scope.

## Create the App

GitHub navigation:

```text
Profile picture
→ Settings
→ Developer settings
→ GitHub Apps
→ New GitHub App
```

During development, use a development-specific name such as:

```text
Blumo Development
```

The public production app can later be named:

```text
Blumo
```

## Development URLs

Replace the examples with the actual route names implemented in Unit 06.

```text
Homepage URL:
http://localhost:3000

Setup URL:
http://localhost:3000/api/github/setup

Webhook URL:
Use a secure public development tunnel URL ending in /api/github/webhook
```

A GitHub-hosted webhook cannot call `localhost`. Use a controlled development tunnel only when webhook work begins.

## OAuth User Authorization

For the MVP architecture:

```text
Website login: Supabase Auth with GitHub
Repository connection: GitHub App installation
```

Do not enable GitHub App user authorization during installation unless the architecture is intentionally changed and documented.

## Repository Permissions

Set:

```text
Metadata: Read-only
Contents: Read and write
```

Do not add Pull requests permission yet.

Do not enable:

```text
Administration
Actions
Workflows
Secrets
Deployments
Members
Organization administration
Issues
```

## Subscribe to Events

Enable:

```text
Installation
Installation repositories
```

These support connection lifecycle handling.

## Installation Scope

During development, keep the app private or installable only by you until the flow is tested.

When preparing the beta:

- Make the GitHub App available to other accounts.
- Keep selected-repository choice available.
- Review all displayed permissions before inviting users.

## Generate Credentials

Record:

- App ID.
- App slug.
- Client ID where provided/needed.
- Client secret where provided/needed.
- Private key.
- Webhook secret.

Store locally:

```env
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_CLIENT_ID=
GITHUB_APP_CLIENT_SECRET=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
```

Never use `NEXT_PUBLIC_` for these.

## Private Key Formatting

The private key may need newline preservation in deployment environment variables.

Create one server-only parser that:

- Reads the key.
- Converts escaped `\n` sequences when necessary.
- Validates the key is present.
- Never logs the key.

Do not duplicate private-key parsing across routes.

## Installation Start

The connect button sends the user to the GitHub App installation URL.

After installation, GitHub redirects to the configured setup URL.

## Setup Callback Security

The callback must not trust only the `installation_id` query value.

The server must:

1. Require a signed-in Blumo user.
2. Parse the callback safely.
3. Authenticate as the GitHub App.
4. Retrieve installation metadata from GitHub.
5. Verify the account relationship required by the chosen connection policy.
6. Store only verified installation metadata.
7. Redirect to repository selection.

## Installation Token

When listing repositories or committing:

1. Load the user's active verified installation.
2. Generate a short-lived installation access token.
3. Use the token immediately through Octokit.
4. Do not save it in the database.
5. Discard it after the request.

## Repository Sync

Store:

- GitHub repository ID.
- Owner.
- Name.
- Full name.
- Default branch.
- Private/public status.
- Access status.
- Last synchronized time.

Do not assume `main` is the default branch.

## Commit Permission Versus Blumo Rules

GitHub Contents write permission may technically allow broad file changes in a selected repository.

Blumo must impose a stricter internal rule:

```text
Only blumo/** is writable during the MVP.
```

## Webhook Verification

Before processing:

- Read the raw request body.
- Verify the signature using `GITHUB_WEBHOOK_SECRET`.
- Use GitHub delivery ID for idempotency.
- Reject unsupported events.
- Sanitize audit data.

## Local Testing Checklist

- Install on one test repository.
- Verify the setup callback stores the correct installation.
- List only accessible repositories.
- Add a second repository and synchronize.
- Remove a repository and verify Blumo disables it.
- Suspend the app and verify actions fail safely.
- Uninstall the app and verify the dashboard shows disconnected.
- Confirm no installation token is stored.

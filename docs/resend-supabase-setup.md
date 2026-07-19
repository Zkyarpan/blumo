# Blumo Resend and Supabase Setup

## Current State

Completed:

```text
mail.arpankarki.com.np is verified in Resend.
```

This subdomain can be used for Blumo senders without purchasing it separately because it is part of the existing `arpankarki.com.np` domain.

## Sender Plan

```text
Blumo <no-reply@mail.arpankarki.com.np>
Blumo Tasks <tasks@mail.arpankarki.com.np>
Blumo Progress <progress@mail.arpankarki.com.np>
Blumo Support <support@mail.arpankarki.com.np>
```

For the MVP:

```text
Support Reply-To: arpan.karki.work@gmail.com
```

## Part A: Supabase Auth SMTP

### 1. Create a Dedicated Resend Key

In Resend:

```text
API Keys
→ Create API Key
```

Name:

```text
Blumo Supabase Auth
```

Give it only the sending access needed for the verified Blumo email domain when the Resend dashboard offers that restriction.

Copy the key once and store it securely.

Do not paste it into chat, source code, screenshots, or GitHub.

### 2. Open Supabase SMTP Configuration

In the Blumo Supabase project:

```text
Authentication
→ Email / SMTP settings
→ Enable custom SMTP
```

Use:

```text
Sender name: Blumo
Sender email: no-reply@mail.arpankarki.com.np
Host: smtp.resend.com
Port: 465
Username: resend
Password: the Blumo Supabase Auth Resend key
```

Save.

### 3. Configure Authentication URLs

Local development:

```text
Site URL:
http://localhost:3000

Allowed redirect URL:
http://localhost:3000/**
```

Production later:

```text
https://your-production-domain/**
```

Keep localhost and production URLs only as required. Do not use a completely open redirect configuration.

### 4. Review Auth Templates

Use Blumo branding and preserve Supabase template variables and confirmation links.

Keep templates:

- Short.
- Accessible.
- Clear about the action.
- Free of sensitive user data.

### 5. Test

Trigger an authentication email supported by the implemented auth flow.

Confirm:

- Sender name is Blumo.
- Sender domain is correct.
- Email appears in the Resend delivery dashboard.
- Link returns to the expected Blumo route.
- No secret appears in the URL or email body.

## Part B: Product Emails

Configure during Build Unit 17.

### 1. Create Another Key

Name:

```text
Blumo Product Emails
```

Use the narrowest sending permission offered for the verified domain.

### 2. Store It

Local:

```env
RESEND_API_KEY=
```

Production:

```text
Vercel project
→ Settings
→ Environment Variables
→ RESEND_API_KEY
```

Never prefix it with `NEXT_PUBLIC_`.

### 3. Install the SDK

```bash
npm install resend
```

### 4. Server-Only Client

Create:

```text
src/lib/email/client.ts
```

Requirements:

- Add `import "server-only"`.
- Validate `RESEND_API_KEY`.
- Export one configured client.
- Never initialize the client in a Client Component.

### 5. Test Sender Addresses

Test one email at a time:

```text
no-reply@mail.arpankarki.com.np
tasks@mail.arpankarki.com.np
progress@mail.arpankarki.com.np
support@mail.arpankarki.com.np
```

They do not need separate mailboxes to send.

### 6. Support Replies

When sending support-related email:

```text
From: Blumo Support <support@mail.arpankarki.com.np>
Reply-To: arpan.karki.work@gmail.com
```

Replies will go to Gmail until inbound email is deliberately implemented.

## Troubleshooting

### Domain mismatch

The From address must end with the verified domain:

```text
@mail.arpankarki.com.np
```

### SMTP authentication error

Check:

- Host.
- Port.
- Username exactly `resend`.
- API key copied correctly.
- Key is active.
- Domain is still verified.

### Email sends but link is wrong

Check Supabase:

- Site URL.
- Redirect allowlist.
- Application callback route.
- Auth template variables.

### Email does not arrive

Check:

- Resend delivery event.
- Bounce or suppression status.
- Spam folder.
- Recipient address.
- Supabase Auth logs.
- Provider sending and rate limits.

## Security Checklist

- Use separate Auth and product keys.
- Keep both keys server-side.
- Never commit keys.
- Rotate exposed keys immediately.
- Do not place private repository content in email.
- Escape user-controlled text in HTML.
- Honour user preferences for optional notifications.

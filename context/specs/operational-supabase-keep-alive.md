# Operational Unit: Supabase Keep-Alive

## Goal

Keep the deployed Supabase Free project active by making one minimal database
request every day from the production Vercel deployment.

This is an infrastructure-only unit. It does not introduce user schedules,
automatic mission generation, email delivery, GitHub writes, or any other
Phase 2 product behavior.

## Scope

- Add `GET /api/cron/supabase-keep-alive`.
- Authenticate the route with the server-only `CRON_SECRET`.
- Compare bearer credentials in constant time and fail closed.
- Perform one minimal head/count query against `profiles` through the existing
  server-only Supabase admin client.
- Return fixed normalized JSON without rows, counts, raw errors, or secrets.
- Add `vercel.json` with a once-daily `03:17 UTC` schedule.
- Add `CRON_SECRET` to server environment validation and `.env.example`.
- Generate a cryptographically random local value in ignored `.env.local`.
- Add route tests for missing configuration, unauthorized requests, success,
  and sanitized database failure.
- Update the progress tracker and operational documentation.

## Security Requirements

- Never accept the secret in a query parameter.
- Never log or return the secret.
- Never expose the Supabase service-role key.
- Never mutate product data.
- Never return queried data or database error details.
- Never call AI, email, GitHub, or user workflow services.
- Missing server configuration returns `503`; invalid credentials return `401`.

## Verification

- [x] Missing `CRON_SECRET` returns `503` without a database call.
- [x] Missing or incorrect bearer authorization returns `401`.
- [x] Valid authorization performs exactly one minimal database query.
- [x] Successful execution returns fixed `200` JSON.
- [x] Supabase failure returns fixed `503` JSON without raw error details.
- [x] `vercel.json` schedules `/api/cron/supabase-keep-alive` daily.
- [x] `.env.local` contains a generated secret and remains ignored by Git.
- [x] `.env.example` contains only a placeholder.
- [x] `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`
      pass.

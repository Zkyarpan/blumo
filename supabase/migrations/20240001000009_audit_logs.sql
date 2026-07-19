-- Migration 10: audit_logs table.
-- Immutable append-only log of security-relevant events.
-- user_id is nullable to support system/webhook events with no authenticated user.
-- Written only by server-only code via the service-role admin client.

create table public.audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  -- ON DELETE SET NULL: audit entries are preserved when a user is deleted.
  user_id       uuid        references public.profiles(id) on delete set null,
  action        text        not null,
  resource_type text        not null,
  resource_id   uuid,
  metadata      jsonb,
  created_at    timestamptz not null default now()
  -- No updated_at: audit logs are immutable.
);

create index audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Users may read their own audit entries.
-- System events where user_id is null are not accessible via the anon/user role.
create policy "audit_logs: owner read"
  on public.audit_logs for select
  using (user_id = auth.uid());

-- All writes happen via the service-role admin client after independent auth.

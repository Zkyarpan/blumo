-- Migration 5: github_installations table.
-- Stores GitHub App installation metadata per user.
-- Written exclusively by server-only code (service-role client) after
-- verifying the authenticated user. No client-side write policies.

create table public.github_installations (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  installation_id bigint      not null unique,
  account_id      bigint      not null,
  account_login   text        not null,
  account_type    text        not null check (account_type in ('User', 'Organization')),
  status          text        not null default 'active'
                              check (status in ('active', 'suspended', 'uninstalled')),
  installed_at    timestamptz,
  suspended_at    timestamptz,
  uninstalled_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index github_installations_user_status_idx
  on public.github_installations (user_id, status);

create trigger github_installations_set_updated_at
  before update on public.github_installations
  for each row execute function public.set_updated_at();

alter table public.github_installations enable row level security;

-- Users may read their own installation records.
-- All writes happen via the service-role admin client (bypasses RLS).
create policy "github_installations: owner read"
  on public.github_installations for select
  using (user_id = auth.uid());

-- Migration 6: repositories table.
-- Tracks GitHub repositories available through a user's installation.
-- Written by server-only code via the service-role admin client.

create table public.repositories (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references public.profiles(id) on delete cascade,
  installation_id      uuid        not null references public.github_installations(id) on delete cascade,
  github_repository_id bigint      not null,
  owner                text        not null,
  name                 text        not null,
  full_name            text        not null,
  default_branch       text        not null default 'main',
  is_private           boolean     not null default false,
  is_selected          boolean     not null default false,
  access_status        text        not null default 'active'
                                   check (access_status in ('active', 'removed', 'unavailable')),
  last_synced_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- A GitHub repository may appear at most once per user.
create unique index repositories_user_repo_unique_idx
  on public.repositories (user_id, github_repository_id);

-- MVP invariant: at most one selected-and-active repository per user.
create unique index repositories_one_selected_per_user_idx
  on public.repositories (user_id)
  where (is_selected = true and access_status = 'active');

-- General lookup index.
create index repositories_user_selected_idx
  on public.repositories (user_id, is_selected, access_status);

create trigger repositories_set_updated_at
  before update on public.repositories
  for each row execute function public.set_updated_at();

alter table public.repositories enable row level security;

-- Users may read their own repository records.
-- All writes happen via the service-role admin client.
create policy "repositories: owner read"
  on public.repositories for select
  using (user_id = auth.uid());

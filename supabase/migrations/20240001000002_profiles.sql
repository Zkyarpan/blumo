-- Migration 3: profiles table.
-- Extends auth.users. One row per Supabase Auth user.
-- Created automatically by the handle_new_user() trigger on auth sign-up.

create table public.profiles (
  id                      uuid        primary key references auth.users(id) on delete cascade,
  github_user_id          bigint      unique,
  github_username         text,
  display_name            text,
  avatar_url              text,
  timezone                text        not null default 'UTC',
  experience_level        text        not null default 'beginner'
                                      check (experience_level in ('beginner', 'intermediate', 'advanced')),
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Partial index: skip rows where github_user_id is null to keep it compact.
create index profiles_github_user_id_idx
  on public.profiles (github_user_id)
  where github_user_id is not null;

-- Auto-set updated_at on every UPDATE.
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Row Level Security: users can only read and update their own profile.
-- Inserts are handled by the trigger function (security definer), not by users.
alter table public.profiles enable row level security;

create policy "profiles: owner read"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: owner update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------
-- Profile creation trigger: fires after a new auth.users row is inserted.
-- Reads GitHub OAuth metadata from raw_user_meta_data.
-- Uses SECURITY DEFINER so it runs as the postgres role, bypassing RLS.
-- set search_path = public prevents search-path injection attacks.
-- on conflict (id) do nothing makes it safe to replay.
-- -----------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    github_user_id,
    github_username,
    display_name,
    avatar_url
  )
  values (
    new.id,
    -- Supabase stores the GitHub numeric user ID as provider_id in OAuth metadata.
    (new.raw_user_meta_data->>'provider_id')::bigint,
    new.raw_user_meta_data->>'user_name',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name'
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

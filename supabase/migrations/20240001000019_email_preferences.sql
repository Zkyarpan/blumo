-- Stabilization: Notification preferences table.
-- Creates email_preferences with owner-scoped RLS.
-- Adds a server action upsert function.

-- ---------------------------------------------------------------------------
-- email_preferences table
-- ---------------------------------------------------------------------------
create table if not exists public.email_preferences (
  user_id                   uuid        primary key references public.profiles(id) on delete cascade,
  email_mission_generated   boolean     not null default true,
  email_mission_approved    boolean     not null default true,
  email_mission_rejected    boolean     not null default true,
  email_commit_success      boolean     not null default true,
  email_github_connection   boolean     not null default true,
  email_weekly_progress     boolean     not null default false,
  updated_at                timestamptz not null default now()
);

-- Trigger: keep updated_at current
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_email_preferences_updated_at'
      and tgrelid = 'public.email_preferences'::regclass
  ) then
    create trigger set_email_preferences_updated_at
      before update on public.email_preferences
      for each row execute function public.set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.email_preferences enable row level security;

-- Owner can read their own preferences
create policy "owner can read preferences"
  on public.email_preferences
  for select
  using (user_id = auth.uid());

-- Owner can upsert their own preferences
create policy "owner can upsert preferences"
  on public.email_preferences
  for insert
  with check (user_id = auth.uid());

create policy "owner can update preferences"
  on public.email_preferences
  for update
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- upsert_email_preferences — authenticated user can save their own preferences.
-- user_id is always derived from the RPC caller's verified session on the server,
-- never from client-supplied parameters.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_email_preferences(
  p_user_id                 uuid,
  p_email_mission_generated boolean,
  p_email_mission_approved  boolean,
  p_email_mission_rejected  boolean,
  p_email_commit_success    boolean,
  p_email_github_connection boolean,
  p_email_weekly_progress   boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  insert into public.email_preferences (
    user_id,
    email_mission_generated,
    email_mission_approved,
    email_mission_rejected,
    email_commit_success,
    email_github_connection,
    email_weekly_progress
  ) values (
    p_user_id,
    p_email_mission_generated,
    p_email_mission_approved,
    p_email_mission_rejected,
    p_email_commit_success,
    p_email_github_connection,
    p_email_weekly_progress
  )
  on conflict (user_id) do update set
    email_mission_generated   = excluded.email_mission_generated,
    email_mission_approved    = excluded.email_mission_approved,
    email_mission_rejected    = excluded.email_mission_rejected,
    email_commit_success      = excluded.email_commit_success,
    email_github_connection   = excluded.email_github_connection,
    email_weekly_progress     = excluded.email_weekly_progress,
    updated_at                = now();
end;
$$;

revoke all on function public.upsert_email_preferences(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.upsert_email_preferences(
  uuid, boolean, boolean, boolean, boolean, boolean, boolean
) to service_role;

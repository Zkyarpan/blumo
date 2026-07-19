-- Migration 4: goals table.
-- One active goal per user enforced by partial unique index.

create table public.goals (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  title         text        not null,
  technology    text        not null,
  task_type     text        not null,
  daily_minutes integer     not null check (daily_minutes in (10, 20, 30, 45, 60)),
  status        text        not null default 'active'
                            check (status in ('active', 'paused', 'completed', 'archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- MVP invariant: at most one goal with status = 'active' per user.
-- PostgreSQL partial unique index enforces this at the database level.
create unique index goals_one_active_per_user_idx
  on public.goals (user_id)
  where (status = 'active');

-- General lookup index.
create index goals_user_status_idx
  on public.goals (user_id, status);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;

-- Users can read, insert, update, and soft-delete their own goals.
create policy "goals: owner read"
  on public.goals for select
  using (user_id = auth.uid());

create policy "goals: owner insert"
  on public.goals for insert
  with check (user_id = auth.uid());

create policy "goals: owner update"
  on public.goals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Hard delete via client is allowed but application prefers archiving.
create policy "goals: owner delete"
  on public.goals for delete
  using (user_id = auth.uid());

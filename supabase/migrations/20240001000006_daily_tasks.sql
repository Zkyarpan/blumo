-- Migration 7: daily_tasks table.
-- AI-generated missions. Users may read, insert, and update their own tasks.
-- The AI generation server route also writes via the service-role admin client
-- for atomic operations.

create table public.daily_tasks (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null references public.profiles(id) on delete cascade,
  goal_id                  uuid        not null references public.goals(id) on delete cascade,
  -- repository_id is nullable: tasks may be generated before a repository is selected.
  -- ON DELETE SET NULL: task history is preserved when repository access is revoked.
  repository_id            uuid        references public.repositories(id) on delete set null,
  scheduled_date           date        not null,
  title                    text        not null,
  summary                  text,
  instructions             jsonb,
  acceptance_checklist     jsonb,
  skill_tags               jsonb,
  estimated_minutes        integer,
  suggested_path           text,
  generated_markdown       text,
  user_markdown            text,
  suggested_commit_message text,
  user_commit_message      text,
  status                   text        not null default 'generated'
                                       check (status in (
                                         'generated', 'in_progress', 'ready',
                                         'committing', 'committed', 'failed', 'archived'
                                       )),
  ai_provider              text,
  ai_model                 text,
  generation_attempts      integer     not null default 1,
  approved_at              timestamptz,
  completed_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index daily_tasks_user_created_idx
  on public.daily_tasks (user_id, created_at desc);

create index daily_tasks_user_status_idx
  on public.daily_tasks (user_id, status);

create index daily_tasks_user_date_idx
  on public.daily_tasks (user_id, scheduled_date);

create trigger daily_tasks_set_updated_at
  before update on public.daily_tasks
  for each row execute function public.set_updated_at();

alter table public.daily_tasks enable row level security;

create policy "daily_tasks: owner read"
  on public.daily_tasks for select
  using (user_id = auth.uid());

create policy "daily_tasks: owner insert"
  on public.daily_tasks for insert
  with check (user_id = auth.uid());

create policy "daily_tasks: owner update"
  on public.daily_tasks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

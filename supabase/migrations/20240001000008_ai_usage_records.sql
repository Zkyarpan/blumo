-- Migration 9: ai_usage_records table.
-- Tracks AI provider calls per user. Append-only; no updated_at column.
-- Written by server-only code via the service-role admin client.

create table public.ai_usage_records (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references public.profiles(id) on delete cascade,
  -- ON DELETE SET NULL: usage records are preserved when a task is removed.
  task_id              uuid        references public.daily_tasks(id) on delete set null,
  provider             text        not null,
  model                text,
  operation            text        not null
                                   check (operation in (
                                     'task_generation', 'review', 'weekly_summary'
                                   )),
  input_units          integer,
  output_units         integer,
  estimated_cost_minor integer,
  success              boolean     not null,
  created_at           timestamptz not null default now()
);

create index ai_usage_records_user_created_idx
  on public.ai_usage_records (user_id, created_at desc);

alter table public.ai_usage_records enable row level security;

-- Users may read their own usage records.
-- All writes happen via the service-role admin client.
create policy "ai_usage_records: owner read"
  on public.ai_usage_records for select
  using (user_id = auth.uid());

-- Unit 11: Mission review, approval, rejection, and bounded regeneration.
-- Adds mission_versions, mission_regeneration_requests, extends daily_tasks,
-- updates status constraint, active-mission index, and five lifecycle functions.
-- Never edits applied Unit 10 migrations.

-- ---------------------------------------------------------------------------
-- Preflight: abort if unexpected legacy status values exist
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.daily_tasks
    where status in ('ready', 'committing')
  ) then
    raise exception
      'preflight_failed: daily_tasks rows with status=ready or status=committing exist; '
      'resolve before applying Unit 11 migration';
  end if;
end;
$$;

-- Normalize committed -> completed for valid historical rows only.
-- Abort if a committed row is missing the required completion evidence.
do $$
begin
  if exists (
    select 1 from public.daily_tasks
    where status = 'committed'
      and (completed_at is null)
  ) then
    raise exception
      'preflight_failed: committed rows without completed_at exist; '
      'cannot safely normalize to completed';
  end if;
end;
$$;

update public.daily_tasks
   set status = 'completed',
       updated_at = transaction_timestamp()
 where status = 'committed';

-- ---------------------------------------------------------------------------
-- daily_tasks additions
-- ---------------------------------------------------------------------------
alter table public.daily_tasks
  add column if not exists rejected_at       timestamptz,
  add column if not exists review_operation_status text not null default 'idle',
  add column if not exists regeneration_count smallint not null default 0;

-- current_mission_version_id FK added after mission_versions is created below.
alter table public.daily_tasks
  add column if not exists current_mission_version_id uuid;

-- ---------------------------------------------------------------------------
-- Replace status constraint to include new values, remove old ones
-- ---------------------------------------------------------------------------
alter table public.daily_tasks
  drop constraint if exists daily_tasks_status_check;

alter table public.daily_tasks
  add constraint daily_tasks_status_check
  check (status in (
    'generating', 'generated', 'approved', 'rejected',
    'in_progress', 'completed', 'failed', 'archived'
  ));

alter table public.daily_tasks
  add constraint daily_tasks_review_operation_status_check
  check (review_operation_status in ('idle', 'regenerating'));

alter table public.daily_tasks
  add constraint daily_tasks_regeneration_count_check
  check (regeneration_count between 0 and 2);

-- ---------------------------------------------------------------------------
-- Replace active-mission unique index to include approved, in_progress, and
-- regenerating operation status
-- ---------------------------------------------------------------------------
drop index if exists public.daily_tasks_one_active_per_user_idx;

create unique index daily_tasks_one_active_per_user_idx
  on public.daily_tasks (user_id)
  where status in ('generating', 'generated', 'approved', 'in_progress')
     or review_operation_status = 'regenerating';

-- ---------------------------------------------------------------------------
-- mission_versions: immutable AI mission snapshots
-- ---------------------------------------------------------------------------
create table public.mission_versions (
  id                     uuid primary key default gen_random_uuid(),
  task_id                uuid not null references public.daily_tasks(id),
  user_id                uuid not null references public.profiles(id),
  version_number         integer not null,
  status                 text not null default 'generated',
  title                  text not null,
  description            text not null,
  estimated_minutes      integer not null,
  difficulty             text not null,
  acceptance_checklist   jsonb not null,
  suggested_commit_message text not null,
  suggested_branch       text not null,
  learning_outcome       text not null,
  ai_provider            text not null,
  ai_model               text,
  prompt_version         text not null,
  generation_claim_version integer not null,
  approved_at            timestamptz,
  rejected_at            timestamptz,
  rejection_reason       text,
  created_at             timestamptz not null default now(),

  constraint mission_versions_version_number_positive check (version_number > 0),
  constraint mission_versions_status_check check (status in ('generated', 'approved', 'rejected')),
  constraint mission_versions_approved_requires_at check (
    status <> 'approved' or approved_at is not null
  ),
  constraint mission_versions_rejected_requires_at check (
    status <> 'rejected' or rejected_at is not null
  ),
  constraint mission_versions_generated_no_timestamps check (
    status <> 'generated' or (approved_at is null and rejected_at is null)
  ),
  constraint mission_versions_estimated_minutes_check check (
    estimated_minutes in (10, 20, 30, 45, 60)
  ),
  constraint mission_versions_difficulty_check check (
    difficulty in ('beginner', 'intermediate', 'advanced')
  ),
  constraint mission_versions_rejection_reason_length check (
    rejection_reason is null or (
      length(btrim(rejection_reason)) between 3 and 500
    )
  )
);

create unique index mission_versions_task_version_idx
  on public.mission_versions (task_id, version_number);

create index mission_versions_task_id_idx on public.mission_versions (task_id);
create index mission_versions_user_id_idx on public.mission_versions (user_id);

alter table public.daily_tasks
  add constraint daily_tasks_current_mission_version_id_fk
  foreign key (current_mission_version_id) references public.mission_versions(id);

-- ---------------------------------------------------------------------------
-- mission_regeneration_requests
-- ---------------------------------------------------------------------------
create table public.mission_regeneration_requests (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.daily_tasks(id),
  user_id           uuid not null references public.profiles(id),
  source_version_id uuid not null references public.mission_versions(id),
  result_version_id uuid references public.mission_versions(id),
  status            text not null default 'processing',
  feedback          text not null,
  claim_version     integer not null default 1,
  provider_attempts smallint not null default 0,
  error_code        text,
  claimed_at        timestamptz not null default now(),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint mission_regen_status_check check (
    status in ('processing', 'succeeded', 'failed')
  ),
  constraint mission_regen_provider_attempts_check check (
    provider_attempts between 0 and 3
  ),
  constraint mission_regen_claim_version_positive check (claim_version > 0),
  constraint mission_regen_feedback_length check (
    length(btrim(feedback)) between 10 and 500
  ),
  constraint mission_regen_succeeded_has_result check (
    status <> 'succeeded' or result_version_id is not null
  )
);

-- One processing request per task
create unique index mission_regen_one_processing_per_task_idx
  on public.mission_regeneration_requests (task_id)
  where status = 'processing';

-- One successful successor per source version
create unique index mission_regen_one_success_per_source_idx
  on public.mission_regeneration_requests (source_version_id)
  where status = 'succeeded';

create index mission_regen_task_id_idx on public.mission_regeneration_requests (task_id);
create index mission_regen_user_id_idx on public.mission_regeneration_requests (user_id);

-- ---------------------------------------------------------------------------
-- ai_usage_records: extend operation constraint and add nullable FK columns
-- ---------------------------------------------------------------------------
alter table public.ai_usage_records
  drop constraint if exists ai_usage_records_operation_check;

alter table public.ai_usage_records
  add constraint ai_usage_records_operation_check
  check (operation in ('task_generation', 'mission_regeneration', 'review', 'weekly_summary'));

alter table public.ai_usage_records
  add column if not exists mission_version_id uuid references public.mission_versions(id),
  add column if not exists regeneration_request_id uuid references public.mission_regeneration_requests(id);

-- ---------------------------------------------------------------------------
-- RLS on new tables
-- ---------------------------------------------------------------------------
alter table public.mission_versions enable row level security;
alter table public.mission_regeneration_requests enable row level security;

create policy "mission_versions: owner select"
  on public.mission_versions for select
  using (user_id = auth.uid());

create policy "mission_regen_requests: owner select"
  on public.mission_regeneration_requests for select
  using (user_id = auth.uid());

-- No browser insert/update/delete policies on either table.

-- ---------------------------------------------------------------------------
-- Backfill: create version 1 for each task with valid mission fields
-- ---------------------------------------------------------------------------
do $$
declare
  v_task public.daily_tasks%rowtype;
  v_version_id uuid;
  v_status text;
begin
  for v_task in
    select * from public.daily_tasks
    where prompt_version is not null
      and status not in ('generating', 'failed')
      and title is not null and btrim(title) <> ''
      and summary is not null and btrim(summary) <> ''
      and estimated_minutes in (10, 20, 30, 45, 60)
      and difficulty in ('beginner', 'intermediate', 'advanced')
      and acceptance_checklist is not null
      and jsonb_typeof(acceptance_checklist) = 'array'
      and suggested_commit_message is not null
      and btrim(suggested_commit_message) <> ''
      and suggested_branch is not null
      and btrim(suggested_branch) <> ''
      and learning_outcome is not null
      and btrim(learning_outcome) <> ''
      and current_mission_version_id is null
  loop
    -- Determine version status from task status
    if v_task.status in ('approved', 'in_progress', 'completed') then
      v_status := 'approved';
    elsif v_task.status = 'rejected' then
      v_status := 'rejected';
    else
      v_status := 'generated';
    end if;

    insert into public.mission_versions (
      task_id, user_id, version_number, status,
      title, description, estimated_minutes, difficulty,
      acceptance_checklist, suggested_commit_message,
      suggested_branch, learning_outcome,
      ai_provider, ai_model, prompt_version,
      generation_claim_version,
      approved_at, rejected_at,
      created_at
    ) values (
      v_task.id, v_task.user_id, 1, v_status,
      v_task.title, v_task.summary, v_task.estimated_minutes, v_task.difficulty,
      v_task.acceptance_checklist, v_task.suggested_commit_message,
      v_task.suggested_branch, v_task.learning_outcome,
      coalesce(v_task.ai_provider, 'unknown'),
      v_task.ai_model,
      v_task.prompt_version,
      coalesce(v_task.generation_attempts, 1),
      case when v_task.status in ('approved', 'in_progress', 'completed')
           then coalesce(v_task.approved_at, v_task.updated_at) end,
      case when v_task.status = 'rejected'
           then coalesce(v_task.rejected_at, v_task.updated_at) end,
      v_task.created_at
    )
    returning id into v_version_id;

    update public.daily_tasks
       set current_mission_version_id = v_version_id,
           updated_at = transaction_timestamp()
     where id = v_task.id;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Update claim_daily_mission_generation to also treat regenerating as active
-- and to use profile row lock for concurrency safety
-- ---------------------------------------------------------------------------
create or replace function public.claim_daily_mission_generation(
  p_user_id uuid,
  p_scheduled_date date
)
returns table (
  claim_result text,
  task_id uuid,
  claim_version integer,
  prompt_context jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_goal public.goals%rowtype;
  v_repository public.repositories%rowtype;
  v_installation public.github_installations%rowtype;
  v_task public.daily_tasks%rowtype;
  v_active_task public.daily_tasks%rowtype;
  v_previous jsonb := '[]'::jsonb;
  v_context jsonb;
  v_inserted_id uuid;
begin
  if p_user_id is null or p_scheduled_date is null then
    raise exception 'invalid_generation_claim';
  end if;

  -- Lock profile row for per-user concurrency safety
  select * into v_profile
    from public.profiles
   where id = p_user_id
   for update;

  if not found or v_profile.onboarding_completed_at is null then
    return query select 'not_onboarded'::text, null::uuid, null::integer, null::jsonb;
    return;
  end if;

  -- Existing history wins even if GitHub access changed afterward.
  select * into v_task
    from public.daily_tasks
   where user_id = p_user_id
     and scheduled_date = p_scheduled_date
   for update;

  if found then
    if v_task.status = 'generating' then
      return query select 'in_progress'::text, v_task.id, v_task.generation_attempts, null::jsonb;
      return;
    end if;

    if v_task.status <> 'failed' then
      return query select 'existing'::text, v_task.id, v_task.generation_attempts, null::jsonb;
      return;
    end if;

    if v_task.generation_attempts >= 3 then
      return query select 'retry_exhausted'::text, v_task.id, v_task.generation_attempts, null::jsonb;
      return;
    end if;

    if v_task.generation_error_code not in (
      'timed_out', 'rate_limited', 'temporarily_unavailable',
      'invalid_response', 'unsafe_response', 'unknown_provider_error'
    ) then
      return query select 'retry_not_allowed'::text, v_task.id, v_task.generation_attempts, null::jsonb;
      return;
    end if;
  end if;

  -- Never create or retry a second active mission while an earlier mission is
  -- still unfinished. Includes regenerating operation status.
  select active_task.* into v_active_task
    from public.daily_tasks active_task
   where active_task.user_id = p_user_id
     and (
       active_task.status in ('generating', 'generated', 'approved', 'in_progress')
       or active_task.review_operation_status = 'regenerating'
     )
     and (v_task.id is null or active_task.id <> v_task.id)
   order by active_task.scheduled_date desc, active_task.created_at desc
   limit 1
   for update;

  if found then
    return query select 'existing'::text, v_active_task.id,
      v_active_task.generation_attempts, null::jsonb;
    return;
  end if;

  select * into v_goal
    from public.goals
   where user_id = p_user_id
     and status = 'active'
   limit 1;

  if not found then
    return query select 'no_active_goal'::text, coalesce(v_task.id, null), null::integer, null::jsonb;
    return;
  end if;

  select r.* into v_repository
    from public.repositories r
    join public.github_installations gi
      on gi.id = r.installation_id
     and gi.user_id = p_user_id
     and gi.status = 'active'
   where r.user_id = p_user_id
     and r.is_selected = true
     and r.access_status = 'active'
   limit 1;

  if not found then
    return query select 'no_active_repository'::text, coalesce(v_task.id, null), null::integer, null::jsonb;
    return;
  end if;

  select * into v_installation
    from public.github_installations
   where id = v_repository.installation_id
     and user_id = p_user_id
     and status = 'active';

  if not found then
    return query select 'no_active_repository'::text, coalesce(v_task.id, null), null::integer, null::jsonb;
    return;
  end if;

  if v_task.id is not null
     and (v_task.goal_id <> v_goal.id or v_task.repository_id <> v_repository.id) then
    return query select 'context_changed'::text, v_task.id, v_task.generation_attempts, null::jsonb;
    return;
  end if;

  select coalesce(jsonb_agg(history_item order by completed_at desc), '[]'::jsonb)
    into v_previous
    from (
      select jsonb_build_object(
               'title', title,
               'learning_outcome', learning_outcome,
               'difficulty', difficulty,
               'scheduled_date', scheduled_date
             ) as history_item,
             completed_at
        from public.daily_tasks
       where user_id = p_user_id
         and goal_id = v_goal.id
         and status = 'completed'
         and completed_at is not null
         and scheduled_date < p_scheduled_date
         and length(btrim(title)) between 5 and 100
         and learning_outcome is not null
         and length(btrim(learning_outcome)) between 10 and 300
         and difficulty in ('beginner', 'intermediate', 'advanced')
       order by completed_at desc
       limit 5
    ) recent;

  v_context := jsonb_build_object(
    'profile', jsonb_build_object(
      'experience_level', v_profile.experience_level,
      'timezone', v_profile.timezone
    ),
    'goal', jsonb_build_object(
      'title', v_goal.title,
      'technology', v_goal.technology,
      'task_type', v_goal.task_type,
      'daily_minutes', v_goal.daily_minutes
    ),
    'repository', jsonb_build_object(
      'name', v_repository.name,
      'default_branch', v_repository.default_branch,
      'is_private', v_repository.is_private
    ),
    'previous_completed_missions', v_previous,
    'scheduled_date', p_scheduled_date
  );

  if v_task.id is not null then
    update public.daily_tasks
       set status = 'generating',
           generation_attempts = generation_attempts + 1,
           generation_error_code = null,
           updated_at = transaction_timestamp()
     where id = v_task.id
     returning * into v_task;

    insert into public.audit_logs (
      user_id, action, resource_type, resource_id, metadata
    ) values (
      p_user_id,
      'mission_generation_retried',
      'task',
      v_task.id,
      jsonb_build_object(
        'scheduled_date', p_scheduled_date,
        'generation_attempt', v_task.generation_attempts,
        'result_code', 'retry_claimed'
      )
    );

    return query select 'retry_claimed'::text, v_task.id, v_task.generation_attempts, v_context;
    return;
  end if;

  insert into public.daily_tasks (
    user_id,
    goal_id,
    repository_id,
    scheduled_date,
    title,
    status,
    generation_attempts
  ) values (
    p_user_id,
    v_goal.id,
    v_repository.id,
    p_scheduled_date,
    'Mission generation in progress',
    'generating',
    1
  )
  on conflict do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select * into v_task
      from public.daily_tasks
     where user_id = p_user_id
       and scheduled_date = p_scheduled_date
     for update;

    if found and v_task.status = 'generating' then
      return query select 'in_progress'::text, v_task.id, v_task.generation_attempts, null::jsonb;
    elsif found then
      return query select 'existing'::text, v_task.id, v_task.generation_attempts, null::jsonb;
    end if;

    select * into v_active_task
      from public.daily_tasks
     where user_id = p_user_id
       and (
         status in ('generating', 'generated', 'approved', 'in_progress')
         or review_operation_status = 'regenerating'
       )
     order by scheduled_date desc, created_at desc
     limit 1
     for update;

    if found then
      return query select 'existing'::text, v_active_task.id,
        v_active_task.generation_attempts, null::jsonb;
      return;
    end if;

    raise exception 'generation_claim_conflict';
    return;
  end if;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_generation_started',
    'task',
    v_inserted_id,
    jsonb_build_object(
      'scheduled_date', p_scheduled_date,
      'generation_attempt', 1,
      'result_code', 'claimed'
    )
  );

  return query select 'claimed'::text, v_inserted_id, 1, v_context;
end;
$$;

revoke all on function public.claim_daily_mission_generation(uuid, date)
  from public, anon, authenticated;
grant execute on function public.claim_daily_mission_generation(uuid, date)
  to service_role;

-- ---------------------------------------------------------------------------
-- approve_mission_version
-- ---------------------------------------------------------------------------
create or replace function public.approve_mission_version(
  p_user_id    uuid,
  p_task_id    uuid,
  p_version_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task    public.daily_tasks%rowtype;
  v_version public.mission_versions%rowtype;
  v_ts      timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_version_id is null then
    raise exception 'invalid_approve_input';
  end if;

  -- Lock task and version together
  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  select * into v_version
    from public.mission_versions
   where id = p_version_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  -- Idempotency: already approved same version
  if v_version.status = 'approved' and v_task.status = 'approved'
     and v_task.current_mission_version_id = p_version_id then
    return 'already_approved';
  end if;

  -- State validation
  if v_task.status <> 'generated' or v_version.status <> 'generated' then
    return 'invalid_transition';
  end if;

  if v_task.current_mission_version_id is distinct from p_version_id then
    return 'stale_version';
  end if;

  -- No active regeneration
  if v_task.review_operation_status = 'regenerating' then
    return 'invalid_transition';
  end if;

  -- Repository and installation availability check
  if not exists (
    select 1
      from public.repositories r
      join public.github_installations gi
        on gi.id = r.installation_id
       and gi.user_id = p_user_id
       and gi.status = 'active'
     where r.id = v_task.repository_id
       and r.user_id = p_user_id
       and r.is_selected = true
       and r.access_status = 'active'
  ) then
    return 'repository_unavailable';
  end if;

  v_ts := transaction_timestamp();

  update public.mission_versions
     set status = 'approved',
         approved_at = v_ts
   where id = p_version_id;

  update public.daily_tasks
     set status = 'approved',
         approved_at = v_ts,
         updated_at = v_ts
   where id = p_task_id;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_approved',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'version_number', v_version.version_number,
      'result_code', 'approved'
    )
  );

  return 'approved';
end;
$$;

revoke all on function public.approve_mission_version(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_mission_version(uuid, uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- reject_mission_version
-- ---------------------------------------------------------------------------
create or replace function public.reject_mission_version(
  p_user_id         uuid,
  p_task_id         uuid,
  p_version_id      uuid,
  p_rejection_reason text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task    public.daily_tasks%rowtype;
  v_version public.mission_versions%rowtype;
  v_ts      timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_version_id is null then
    raise exception 'invalid_reject_input';
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  select * into v_version
    from public.mission_versions
   where id = p_version_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  -- Idempotency
  if v_version.status = 'rejected' and v_task.status = 'rejected'
     and v_task.current_mission_version_id = p_version_id then
    return 'already_rejected';
  end if;

  if v_task.status <> 'generated' or v_version.status <> 'generated' then
    return 'invalid_transition';
  end if;

  if v_task.current_mission_version_id is distinct from p_version_id then
    return 'stale_version';
  end if;

  v_ts := transaction_timestamp();

  update public.mission_versions
     set status = 'rejected',
         rejected_at = v_ts,
         rejection_reason = p_rejection_reason
   where id = p_version_id;

  update public.daily_tasks
     set status = 'rejected',
         rejected_at = v_ts,
         updated_at = v_ts
   where id = p_task_id;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_rejected',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'version_number', v_version.version_number,
      'result_code', 'rejected',
      'reason_present', p_rejection_reason is not null
    )
  );

  return 'rejected';
end;
$$;

revoke all on function public.reject_mission_version(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_mission_version(uuid, uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- claim_mission_regeneration
-- ---------------------------------------------------------------------------
create or replace function public.claim_mission_regeneration(
  p_user_id          uuid,
  p_task_id          uuid,
  p_source_version_id uuid,
  p_feedback         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task          public.daily_tasks%rowtype;
  v_source        public.mission_versions%rowtype;
  v_existing_req  public.mission_regeneration_requests%rowtype;
  v_existing_succ public.mission_regeneration_requests%rowtype;
  v_req_id        uuid;
  v_user_24h_count integer;
begin
  if p_user_id is null or p_task_id is null
     or p_source_version_id is null
     or p_feedback is null or btrim(p_feedback) = ''
     or length(btrim(p_feedback)) < 10 or length(btrim(p_feedback)) > 500 then
    raise exception 'invalid_regeneration_claim';
  end if;

  -- Lock profile for per-user concurrency
  perform 1 from public.profiles where id = p_user_id for update;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  select * into v_source
    from public.mission_versions
   where id = p_source_version_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  -- State checks
  if v_task.status <> 'rejected' or v_source.status <> 'rejected' then
    return jsonb_build_object('result', 'invalid_transition');
  end if;

  if v_task.current_mission_version_id is distinct from p_source_version_id then
    return jsonb_build_object('result', 'stale_version');
  end if;

  -- Repository availability
  if not exists (
    select 1
      from public.repositories r
      join public.github_installations gi
        on gi.id = r.installation_id
       and gi.user_id = p_user_id
       and gi.status = 'active'
     where r.id = v_task.repository_id
       and r.user_id = p_user_id
       and r.is_selected = true
       and r.access_status = 'active'
  ) then
    return jsonb_build_object('result', 'repository_unavailable');
  end if;

  -- Duplicate: existing processing request for this task
  select * into v_existing_req
    from public.mission_regeneration_requests
   where task_id = p_task_id
     and status = 'processing'
   for update;

  if found then
    return jsonb_build_object(
      'result', 'duplicate',
      'request_id', v_existing_req.id,
      'claim_version', v_existing_req.claim_version
    );
  end if;

  -- Duplicate: source already has a successor
  select * into v_existing_succ
    from public.mission_regeneration_requests
   where source_version_id = p_source_version_id
     and status = 'succeeded';

  if found then
    return jsonb_build_object(
      'result', 'duplicate_succeeded',
      'request_id', v_existing_succ.id,
      'result_version_id', v_existing_succ.result_version_id
    );
  end if;

  -- Max 2 successful regenerations per task
  if v_task.regeneration_count >= 2 then
    return jsonb_build_object('result', 'usage_limit_reached');
  end if;

  -- Max 3 provider-backed attempts for this source version
  if exists (
    select 1 from public.mission_regeneration_requests
     where source_version_id = p_source_version_id
       and provider_attempts >= 3
  ) then
    return jsonb_build_object('result', 'usage_limit_reached');
  end if;

  -- User rolling 24-hour provider call limit: max 5
  select coalesce(sum(provider_attempts), 0) into v_user_24h_count
    from public.mission_regeneration_requests
   where user_id = p_user_id
     and created_at > now() - interval '24 hours';

  if v_user_24h_count >= 5 then
    return jsonb_build_object('result', 'usage_limit_reached');
  end if;

  -- No other active mission for this user
  if exists (
    select 1 from public.daily_tasks
     where user_id = p_user_id
       and id <> p_task_id
       and (
         status in ('generating', 'generated', 'approved', 'in_progress')
         or review_operation_status = 'regenerating'
       )
  ) then
    return jsonb_build_object('result', 'invalid_transition');
  end if;

  -- Claim
  update public.daily_tasks
     set review_operation_status = 'regenerating',
         updated_at = transaction_timestamp()
   where id = p_task_id;

  insert into public.mission_regeneration_requests (
    task_id, user_id, source_version_id, status,
    feedback, claim_version, provider_attempts,
    claimed_at
  ) values (
    p_task_id, p_user_id, p_source_version_id, 'processing',
    btrim(p_feedback), 1, 0,
    transaction_timestamp()
  )
  returning id into v_req_id;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_regeneration_started',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'source_version_number', v_source.version_number,
      'regeneration_claim_number', 1,
      'result_code', 'processing',
      'feedback_present', true
    )
  );

  return jsonb_build_object(
    'result', 'claimed',
    'request_id', v_req_id,
    'claim_version', 1
  );
end;
$$;

revoke all on function public.claim_mission_regeneration(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_mission_regeneration(uuid, uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- finalize_mission_regeneration
-- ---------------------------------------------------------------------------
create or replace function public.finalize_mission_regeneration(
  p_user_id      uuid,
  p_task_id      uuid,
  p_request_id   uuid,
  p_claim_version integer,
  p_mission      jsonb,
  p_provider     text,
  p_model        text,
  p_prompt_version text,
  p_usage_records jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task        public.daily_tasks%rowtype;
  v_request     public.mission_regeneration_requests%rowtype;
  v_source      public.mission_versions%rowtype;
  v_new_version_id uuid;
  v_next_version integer;
  v_estimated   integer;
  v_usage       jsonb;
  v_ts          timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_request_id is null
     or p_claim_version is null or p_claim_version < 1
     or p_mission is null or jsonb_typeof(p_mission) <> 'object'
     or p_provider is null or btrim(p_provider) = '' or length(p_provider) > 100
     or p_prompt_version is null or btrim(p_prompt_version) = '' or length(p_prompt_version) > 100
     or p_usage_records is null or jsonb_typeof(p_usage_records) <> 'array' then
    raise exception 'invalid_finalize_input';
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then return 'not_found'; end if;

  select * into v_request
    from public.mission_regeneration_requests
   where id = p_request_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then return 'not_found'; end if;
  if v_request.status <> 'processing' then return 'stale'; end if;
  if v_request.claim_version <> p_claim_version then return 'stale'; end if;

  if v_task.status <> 'rejected'
     or v_task.review_operation_status <> 'regenerating' then
    return 'stale';
  end if;

  -- Recheck active goal, repository, installation
  if not exists (
    select 1
      from public.goals g
      join public.repositories r
        on r.id = v_task.repository_id
       and r.user_id = p_user_id
       and r.is_selected = true
       and r.access_status = 'active'
      join public.github_installations gi
        on gi.id = r.installation_id
       and gi.user_id = p_user_id
       and gi.status = 'active'
     where g.id = v_task.goal_id
       and g.user_id = p_user_id
       and g.status = 'active'
  ) then
    return 'context_changed';
  end if;

  -- Validate mission shape
  if jsonb_object_length(p_mission) <> 8
     or jsonb_typeof(p_mission->'title') <> 'string'
     or jsonb_typeof(p_mission->'description') <> 'string'
     or jsonb_typeof(p_mission->'estimated_minutes') <> 'number'
     or jsonb_typeof(p_mission->'difficulty') <> 'string'
     or jsonb_typeof(p_mission->'acceptance_checklist') <> 'array'
     or jsonb_typeof(p_mission->'suggested_commit_message') <> 'string'
     or jsonb_typeof(p_mission->'suggested_branch') <> 'string'
     or jsonb_typeof(p_mission->'learning_outcome') <> 'string' then
    raise exception 'invalid_mission_shape';
  end if;

  v_estimated := (p_mission->>'estimated_minutes')::integer;

  -- Next sequential version number
  select coalesce(max(version_number), 0) + 1 into v_next_version
    from public.mission_versions
   where task_id = p_task_id;

  v_ts := transaction_timestamp();

  -- Insert new immutable version
  insert into public.mission_versions (
    task_id, user_id, version_number, status,
    title, description, estimated_minutes, difficulty,
    acceptance_checklist, suggested_commit_message,
    suggested_branch, learning_outcome,
    ai_provider, ai_model, prompt_version,
    generation_claim_version, created_at
  ) values (
    p_task_id, p_user_id, v_next_version, 'generated',
    btrim(p_mission->>'title'),
    btrim(p_mission->>'description'),
    v_estimated,
    p_mission->>'difficulty',
    p_mission->'acceptance_checklist',
    btrim(p_mission->>'suggested_commit_message'),
    btrim(p_mission->>'suggested_branch'),
    btrim(p_mission->>'learning_outcome'),
    btrim(p_provider),
    nullif(btrim(coalesce(p_model, '')), ''),
    btrim(p_prompt_version),
    v_task.generation_attempts,
    v_ts
  )
  returning id into v_new_version_id;

  -- Update task snapshot and pointer atomically
  update public.daily_tasks
     set current_mission_version_id = v_new_version_id,
         title = btrim(p_mission->>'title'),
         summary = btrim(p_mission->>'description'),
         estimated_minutes = v_estimated,
         difficulty = p_mission->>'difficulty',
         acceptance_checklist = p_mission->'acceptance_checklist',
         suggested_commit_message = btrim(p_mission->>'suggested_commit_message'),
         suggested_branch = btrim(p_mission->>'suggested_branch'),
         learning_outcome = btrim(p_mission->>'learning_outcome'),
         ai_provider = btrim(p_provider),
         ai_model = nullif(btrim(coalesce(p_model, '')), ''),
         prompt_version = btrim(p_prompt_version),
         status = 'generated',
         rejected_at = null,
         generation_error_code = null,
         review_operation_status = 'idle',
         regeneration_count = regeneration_count + 1,
         updated_at = v_ts
   where id = p_task_id;

  -- Finalize request
  update public.mission_regeneration_requests
     set status = 'succeeded',
         result_version_id = v_new_version_id,
         completed_at = v_ts,
         updated_at = v_ts
   where id = p_request_id;

  -- Insert usage records
  for v_usage in select value from jsonb_array_elements(p_usage_records)
  loop
    insert into public.ai_usage_records (
      user_id, task_id, provider, model, operation, input_units,
      output_units, estimated_cost_minor, success, provider_call_id,
      mission_version_id, regeneration_request_id
    ) values (
      p_user_id,
      p_task_id,
      btrim(p_provider),
      nullif(btrim(coalesce(v_usage->>'model', '')), ''),
      'mission_regeneration',
      case when v_usage ? 'input_units' and v_usage->>'input_units' is not null
           then (v_usage->>'input_units')::integer else null end,
      case when v_usage ? 'output_units' and v_usage->>'output_units' is not null
           then (v_usage->>'output_units')::integer else null end,
      null,
      coalesce((v_usage->>'success')::boolean, false),
      (v_usage->>'provider_call_id')::uuid,
      v_new_version_id,
      p_request_id
    )
    on conflict (provider_call_id) where provider_call_id is not null do nothing;
  end loop;

  select * into v_source
    from public.mission_versions
   where id = v_request.source_version_id;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_regeneration_succeeded',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'source_version_number', coalesce(v_source.version_number, 0),
      'result_version_number', v_next_version,
      'prompt_version', p_prompt_version,
      'provider', p_provider,
      'result_code', 'succeeded'
    )
  );

  return 'finalized';
end;
$$;

revoke all on function public.finalize_mission_regeneration(uuid, uuid, uuid, integer, jsonb, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_mission_regeneration(uuid, uuid, uuid, integer, jsonb, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- fail_mission_regeneration
-- ---------------------------------------------------------------------------
create or replace function public.fail_mission_regeneration(
  p_user_id      uuid,
  p_task_id      uuid,
  p_request_id   uuid,
  p_claim_version integer,
  p_error_code   text,
  p_provider     text,
  p_usage_records jsonb,
  p_provider_call_occurred boolean
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task    public.daily_tasks%rowtype;
  v_request public.mission_regeneration_requests%rowtype;
  v_source  public.mission_versions%rowtype;
  v_usage   jsonb;
  v_ts      timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_request_id is null
     or p_claim_version is null or p_claim_version < 1
     or p_error_code is null
     or p_error_code not in (
       'configuration_error', 'authentication_error', 'quota_exhausted',
       'rate_limited', 'request_rejected', 'content_rejected',
       'invalid_response', 'unsafe_response', 'timed_out',
       'temporarily_unavailable', 'unknown_provider_error', 'context_changed'
     )
     or p_provider is null or btrim(p_provider) = '' or length(p_provider) > 100
     or p_usage_records is null or jsonb_typeof(p_usage_records) <> 'array' then
    raise exception 'invalid_fail_input';
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then return 'not_found'; end if;

  select * into v_request
    from public.mission_regeneration_requests
   where id = p_request_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then return 'not_found'; end if;
  if v_request.status <> 'processing' then return 'stale'; end if;
  if v_request.claim_version <> p_claim_version then return 'stale'; end if;

  v_ts := transaction_timestamp();

  -- Insert usage records
  for v_usage in select value from jsonb_array_elements(p_usage_records)
  loop
    insert into public.ai_usage_records (
      user_id, task_id, provider, model, operation, input_units,
      output_units, estimated_cost_minor, success, provider_call_id,
      regeneration_request_id
    ) values (
      p_user_id,
      p_task_id,
      btrim(p_provider),
      nullif(btrim(coalesce(v_usage->>'model', '')), ''),
      'mission_regeneration',
      case when v_usage ? 'input_units' and v_usage->>'input_units' is not null
           then (v_usage->>'input_units')::integer else null end,
      case when v_usage ? 'output_units' and v_usage->>'output_units' is not null
           then (v_usage->>'output_units')::integer else null end,
      null,
      false,
      (v_usage->>'provider_call_id')::uuid,
      p_request_id
    )
    on conflict (provider_call_id) where provider_call_id is not null do nothing;
  end loop;

  update public.mission_regeneration_requests
     set status = 'failed',
         error_code = p_error_code,
         provider_attempts = case when p_provider_call_occurred then provider_attempts + 1
                             else provider_attempts end,
         completed_at = v_ts,
         updated_at = v_ts
   where id = p_request_id;

  -- Restore task to idle
  update public.daily_tasks
     set review_operation_status = 'idle',
         updated_at = v_ts
   where id = p_task_id
     and review_operation_status = 'regenerating';

  select * into v_source
    from public.mission_versions
   where id = v_request.source_version_id;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_regeneration_failed',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'source_version_number', coalesce(v_source.version_number, 0),
      'result_code', p_error_code,
      'provider', p_provider
    )
  );

  return 'failed';
end;
$$;

revoke all on function public.fail_mission_regeneration(uuid, uuid, uuid, integer, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_mission_regeneration(uuid, uuid, uuid, integer, text, text, jsonb, boolean)
  to service_role;

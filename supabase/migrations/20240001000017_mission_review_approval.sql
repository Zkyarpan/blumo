-- Unit 11: Mission Review and Approval.
-- Adds mission versioning, regeneration tracking, approval/rejection/regeneration
-- lifecycle functions, and updates the status constraint and active-mission index.

-- ─── 1. daily_tasks additions ────────────────────────────────────────────────

alter table public.daily_tasks
  add column current_mission_version_id uuid,
  add column rejected_at timestamptz,
  add column review_operation_status text not null default 'idle',
  add column regeneration_count smallint not null default 0;

alter table public.daily_tasks
  add constraint daily_tasks_review_operation_status_check
    check (review_operation_status in ('idle', 'regenerating')),
  add constraint daily_tasks_regeneration_count_check
    check (regeneration_count between 0 and 2);

-- ─── 2. Replace status constraint ────────────────────────────────────────────

-- Preflight: abort if any row has an unexpected status that we cannot safely
-- migrate. Operators must resolve unexpected rows explicitly.
do $$
begin
  if exists (
    select 1 from public.daily_tasks
    where status not in (
      'generating', 'generated', 'in_progress', 'ready',
      'committing', 'committed', 'failed', 'archived'
    )
  ) then
    raise exception 'preflight_failed: unexpected daily_tasks status values found';
  end if;
end;
$$;

-- Normalize legacy 'committed' to 'completed' where it is safe.
-- A 'committed' row has a completed commit record. For our purposes they are
-- equivalent to 'completed' at this stage.
update public.daily_tasks
   set status = 'completed'
 where status = 'committed';

-- Drop old constraint and add the expanded one.
alter table public.daily_tasks
  drop constraint if exists daily_tasks_status_check;

alter table public.daily_tasks
  add constraint daily_tasks_status_check
    check (status in (
      'generating', 'generated', 'approved', 'rejected',
      'in_progress', 'completed', 'failed', 'archived'
    ));

-- ─── 3. mission_versions table ───────────────────────────────────────────────

create table public.mission_versions (
  id                     uuid primary key default gen_random_uuid(),
  task_id                uuid not null references public.daily_tasks(id) on delete restrict,
  user_id                uuid not null references public.profiles(id) on delete restrict,
  version_number         integer not null,
  status                 text not null,
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

  constraint mission_versions_version_number_positive check (version_number >= 1),
  constraint mission_versions_status_check check (status in ('generated', 'approved', 'rejected')),
  constraint mission_versions_unique_task_version unique (task_id, version_number),
  constraint mission_versions_estimated_minutes_check check (estimated_minutes in (10, 20, 30, 45, 60)),
  constraint mission_versions_difficulty_check check (difficulty in ('beginner', 'intermediate', 'advanced')),
  constraint mission_versions_rejection_reason_check check (
    rejection_reason is null or (length(btrim(rejection_reason)) between 3 and 500)
  ),
  constraint mission_versions_approval_consistency check (
    (status = 'approved' and approved_at is not null) or
    (status = 'rejected' and rejected_at is not null) or
    (status = 'generated' and approved_at is null and rejected_at is null)
  )
);

-- RLS on mission_versions
alter table public.mission_versions enable row level security;

create policy "mission_versions: owner select"
  on public.mission_versions
  for select
  using (user_id = auth.uid());

-- No browser insert/update/delete: all writes are via service-role functions.

-- ─── 4. mission_regeneration_requests table ──────────────────────────────────

create table public.mission_regeneration_requests (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.daily_tasks(id) on delete restrict,
  user_id           uuid not null references public.profiles(id) on delete restrict,
  source_version_id uuid not null references public.mission_versions(id) on delete restrict,
  result_version_id uuid references public.mission_versions(id) on delete restrict,
  status            text not null default 'processing',
  feedback          text not null,
  claim_version     integer not null default 1,
  provider_attempts smallint not null default 0,
  error_code        text,
  claimed_at        timestamptz not null default now(),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint mission_regen_status_check check (status in ('processing', 'succeeded', 'failed')),
  constraint mission_regen_provider_attempts_check check (provider_attempts between 0 and 3),
  constraint mission_regen_claim_version_check check (claim_version >= 1),
  constraint mission_regen_feedback_length check (length(btrim(feedback)) between 10 and 500)
);

-- One active processing request per task
create unique index mission_regen_one_processing_per_task_idx
  on public.mission_regeneration_requests (task_id)
  where status = 'processing';

-- One successful successor per source version
create unique index mission_regen_one_success_per_source_idx
  on public.mission_regeneration_requests (source_version_id)
  where status = 'succeeded';

alter table public.mission_regeneration_requests enable row level security;

create policy "mission_regen_requests: owner select"
  on public.mission_regeneration_requests
  for select
  using (user_id = auth.uid());

-- ─── 5. ai_usage_records additions ───────────────────────────────────────────

alter table public.ai_usage_records
  add column mission_version_id uuid references public.mission_versions(id) on delete set null,
  add column regeneration_request_id uuid references public.mission_regeneration_requests(id) on delete set null;

-- Extend operation constraint
alter table public.ai_usage_records
  drop constraint if exists ai_usage_records_operation_check;

alter table public.ai_usage_records
  add constraint ai_usage_records_operation_check
    check (operation in ('task_generation', 'review', 'weekly_summary', 'mission_regeneration'));

-- ─── 6. FK from daily_tasks to mission_versions ──────────────────────────────

alter table public.daily_tasks
  add constraint daily_tasks_current_mission_version_fk
    foreign key (current_mission_version_id) references public.mission_versions(id)
    on delete set null;

-- ─── 7. Replace active-mission partial index ─────────────────────────────────

drop index if exists public.daily_tasks_one_active_per_user_idx;

create unique index daily_tasks_one_active_per_user_idx
  on public.daily_tasks (user_id)
  where status in ('generating', 'generated', 'approved', 'in_progress')
     or review_operation_status = 'regenerating';

-- ─── 8. Backfill mission_versions for existing valid generated tasks ──────────

do $$
declare
  v_task record;
  v_version_id uuid;
  v_version_status text;
begin
  for v_task in
    select id, user_id, title, summary, estimated_minutes, difficulty,
           acceptance_checklist, suggested_commit_message, suggested_branch,
           learning_outcome, ai_provider, ai_model, prompt_version,
           generation_attempts, status, approved_at
      from public.daily_tasks
     where prompt_version is not null
       and status in ('generated', 'approved', 'in_progress', 'completed')
       and title is not null and btrim(title) <> ''
       and summary is not null and btrim(summary) <> ''
       and estimated_minutes is not null
       and difficulty is not null
       and acceptance_checklist is not null
       and jsonb_typeof(acceptance_checklist) = 'array'
       and suggested_commit_message is not null
       and suggested_branch is not null
       and learning_outcome is not null
       and ai_provider is not null
  loop
    -- Determine version status
    if v_task.status in ('approved', 'in_progress', 'completed') then
      v_version_status := 'approved';
    else
      v_version_status := 'generated';
    end if;

    -- Only create version 1 if none exists
    if not exists (
      select 1 from public.mission_versions
       where task_id = v_task.id and version_number = 1
    ) then
      insert into public.mission_versions (
        task_id, user_id, version_number, status,
        title, description, estimated_minutes, difficulty,
        acceptance_checklist, suggested_commit_message, suggested_branch,
        learning_outcome, ai_provider, ai_model, prompt_version,
        generation_claim_version,
        approved_at, rejected_at, created_at
      ) values (
        v_task.id, v_task.user_id, 1, v_version_status,
        btrim(v_task.title), btrim(v_task.summary),
        v_task.estimated_minutes, v_task.difficulty,
        v_task.acceptance_checklist,
        btrim(v_task.suggested_commit_message),
        btrim(v_task.suggested_branch),
        btrim(v_task.learning_outcome),
        v_task.ai_provider,
        v_task.ai_model,
        v_task.prompt_version,
        coalesce(v_task.generation_attempts, 1),
        case when v_version_status = 'approved' then coalesce(v_task.approved_at, now()) else null end,
        null,
        now()
      )
      returning id into v_version_id;

      -- Point task to this version
      update public.daily_tasks
         set current_mission_version_id = v_version_id
       where id = v_task.id;
    end if;
  end loop;
end;
$$;

-- ─── 9. approve_mission_version function ─────────────────────────────────────

create or replace function public.approve_mission_version(
  p_user_id uuid,
  p_task_id uuid,
  p_expected_version_number integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.daily_tasks%rowtype;
  v_version public.mission_versions%rowtype;
  v_ts timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_expected_version_number is null
     or p_expected_version_number < 1 then
    raise exception 'invalid_approval_input';
  end if;

  -- Lock the task row
  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_task.status not in ('generated', 'approved') then
    return 'invalid_transition';
  end if;

  if v_task.current_mission_version_id is null then
    return 'not_found';
  end if;

  -- Lock the version row
  select * into v_version
    from public.mission_versions
   where id = v_task.current_mission_version_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_version.version_number <> p_expected_version_number then
    return 'stale_version';
  end if;

  -- Idempotency: already approved
  if v_task.status = 'approved' and v_version.status = 'approved' then
    return 'already_approved';
  end if;

  if v_version.status <> 'generated' then
    return 'invalid_transition';
  end if;

  -- Verify no processing regeneration
  if exists (
    select 1 from public.mission_regeneration_requests
     where task_id = p_task_id and status = 'processing'
  ) then
    return 'invalid_transition';
  end if;

  -- Repository and installation ownership/availability check
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
   where id = v_version.id;

  update public.daily_tasks
     set status = 'approved',
         approved_at = v_ts,
         updated_at = v_ts
   where id = p_task_id;

  insert into public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (
    p_user_id, 'mission_approved', 'task', p_task_id,
    jsonb_build_object(
      'version_number', v_version.version_number,
      'scheduled_date', v_task.scheduled_date,
      'result_code', 'approved'
    )
  );

  return 'approved';
end;
$$;

revoke all on function public.approve_mission_version(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.approve_mission_version(uuid, uuid, integer) to service_role;

-- ─── 10. reject_mission_version function ─────────────────────────────────────

create or replace function public.reject_mission_version(
  p_user_id uuid,
  p_task_id uuid,
  p_expected_version_number integer,
  p_rejection_reason text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.daily_tasks%rowtype;
  v_version public.mission_versions%rowtype;
  v_ts timestamptz;
  v_reason text;
begin
  if p_user_id is null or p_task_id is null or p_expected_version_number is null
     or p_expected_version_number < 1 then
    raise exception 'invalid_rejection_input';
  end if;

  -- Normalize reason
  v_reason := nullif(btrim(coalesce(p_rejection_reason, '')), '');

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_task.status not in ('generated', 'rejected') then
    return 'invalid_transition';
  end if;

  if v_task.current_mission_version_id is null then
    return 'not_found';
  end if;

  select * into v_version
    from public.mission_versions
   where id = v_task.current_mission_version_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  if v_version.version_number <> p_expected_version_number then
    return 'stale_version';
  end if;

  -- Idempotency: already rejected
  if v_task.status = 'rejected' and v_version.status = 'rejected' then
    return 'already_rejected';
  end if;

  if v_version.status <> 'generated' then
    return 'invalid_transition';
  end if;

  v_ts := transaction_timestamp();

  update public.mission_versions
     set status = 'rejected',
         rejected_at = v_ts,
         rejection_reason = v_reason
   where id = v_version.id;

  update public.daily_tasks
     set status = 'rejected',
         rejected_at = v_ts,
         updated_at = v_ts
   where id = p_task_id;

  insert into public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (
    p_user_id, 'mission_rejected', 'task', p_task_id,
    jsonb_build_object(
      'version_number', v_version.version_number,
      'scheduled_date', v_task.scheduled_date,
      'result_code', 'rejected',
      'reason_present', (v_reason is not null)
    )
  );

  return 'rejected';
end;
$$;

revoke all on function public.reject_mission_version(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.reject_mission_version(uuid, uuid, integer, text) to service_role;

-- ─── 11. claim_mission_regeneration function ─────────────────────────────────

create or replace function public.claim_mission_regeneration(
  p_user_id uuid,
  p_task_id uuid,
  p_source_version_number integer,
  p_feedback text
)
returns table (
  claim_result text,
  request_id uuid,
  claim_version integer,
  source_version_id uuid,
  prompt_context jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.daily_tasks%rowtype;
  v_version public.mission_versions%rowtype;
  v_existing_request public.mission_regeneration_requests%rowtype;
  v_goal public.goals%rowtype;
  v_repository public.repositories%rowtype;
  v_profile public.profiles%rowtype;
  v_request_id uuid;
  v_new_claim_version integer := 1;
  v_previous jsonb := '[]'::jsonb;
  v_context jsonb;
  v_24h_count integer;
begin
  if p_user_id is null or p_task_id is null or p_source_version_number is null
     or p_source_version_number < 1 or p_feedback is null
     or length(btrim(p_feedback)) < 10 or length(btrim(p_feedback)) > 500 then
    raise exception 'invalid_regeneration_input';
  end if;

  -- Lock profile to serialize with daily generation claim
  select * into v_profile
    from public.profiles
   where id = p_user_id
   for update;

  if not found or v_profile.onboarding_completed_at is null then
    return query select 'not_found'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  if v_task.status <> 'rejected' then
    return query select 'invalid_transition'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  if v_task.regeneration_count >= 2 then
    return query select 'usage_limit_reached'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  if v_task.review_operation_status = 'regenerating' then
    -- Check for existing processing request; return it for idempotency
    select * into v_existing_request
      from public.mission_regeneration_requests
     where task_id = p_task_id and status = 'processing'
     limit 1;

    if found then
      return query select 'processing'::text, v_existing_request.id,
        v_existing_request.claim_version, v_existing_request.source_version_id, null::jsonb;
      return;
    end if;
  end if;

  if v_task.current_mission_version_id is null then
    return query select 'not_found'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  select * into v_version
    from public.mission_versions
   where id = v_task.current_mission_version_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  if v_version.version_number <> p_source_version_number then
    return query select 'stale_version'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  if v_version.status <> 'rejected' then
    return query select 'invalid_transition'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  -- Check if this source version already has a succeeded successor (idempotency)
  select * into v_existing_request
    from public.mission_regeneration_requests
   where source_version_id = v_version.id and status = 'succeeded'
   limit 1;

  if found then
    return query select 'already_succeeded'::text, v_existing_request.id,
      v_existing_request.claim_version, v_version.id, null::jsonb;
    return;
  end if;

  -- Check per-source provider attempts
  select coalesce(max(req.provider_attempts), 0)
    into v_new_claim_version
    from public.mission_regeneration_requests req
   where req.source_version_id = v_version.id;

  if v_new_claim_version >= 3 then
    return query select 'usage_limit_reached'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  -- Rolling 24-hour per-user regeneration limit
  select count(*)::integer
    into v_24h_count
    from public.ai_usage_records
   where user_id = p_user_id
     and operation = 'mission_regeneration'
     and created_at > now() - interval '24 hours';

  if v_24h_count >= 5 then
    return query select 'usage_limit_reached'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  -- Active goal
  select * into v_goal
    from public.goals
   where user_id = p_user_id and status = 'active'
   limit 1;

  if not found then
    return query select 'invalid_transition'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  -- Active repository
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
    return query select 'repository_unavailable'::text, null::uuid, null::integer, null::uuid, null::jsonb;
    return;
  end if;

  -- Reuse or create regeneration request
  select * into v_existing_request
    from public.mission_regeneration_requests
   where source_version_id = v_version.id and status = 'failed'
   order by created_at desc
   limit 1
   for update;

  if found then
    v_new_claim_version := v_existing_request.claim_version + 1;
    update public.mission_regeneration_requests
       set claim_version = v_new_claim_version,
           claimed_at = now(),
           status = 'processing',
           error_code = null,
           updated_at = now()
     where id = v_existing_request.id
     returning id into v_request_id;
  else
    insert into public.mission_regeneration_requests (
      task_id, user_id, source_version_id, status,
      feedback, claim_version, provider_attempts, claimed_at
    ) values (
      p_task_id, p_user_id, v_version.id, 'processing',
      btrim(p_feedback), 1, 0, now()
    )
    returning id into v_request_id;
    v_new_claim_version := 1;
  end if;

  -- Set review_operation_status = 'regenerating'
  update public.daily_tasks
     set review_operation_status = 'regenerating',
         updated_at = now()
   where id = p_task_id;

  -- Build prompt context
  select coalesce(jsonb_agg(history_item order by completed_at desc), '[]'::jsonb)
    into v_previous
    from (
      select jsonb_build_object(
               'title', mv.title,
               'learning_outcome', mv.learning_outcome,
               'difficulty', mv.difficulty,
               'scheduled_date', dt.scheduled_date
             ) as history_item,
             dt.completed_at
        from public.daily_tasks dt
        join public.mission_versions mv on mv.task_id = dt.id
       where dt.user_id = p_user_id
         and dt.goal_id = v_goal.id
         and dt.status = 'completed'
         and dt.completed_at is not null
         and dt.scheduled_date < v_task.scheduled_date
         and length(btrim(mv.title)) between 5 and 100
         and mv.learning_outcome is not null
         and length(btrim(mv.learning_outcome)) between 10 and 300
         and mv.difficulty in ('beginner', 'intermediate', 'advanced')
       order by dt.completed_at desc
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
    'scheduled_date', v_task.scheduled_date,
    'rejected_version', jsonb_build_object(
      'version_number', v_version.version_number,
      'title', v_version.title,
      'description', v_version.description,
      'difficulty', v_version.difficulty,
      'estimated_minutes', v_version.estimated_minutes,
      'acceptance_checklist', v_version.acceptance_checklist,
      'suggested_commit_message', v_version.suggested_commit_message,
      'learning_outcome', v_version.learning_outcome
    ),
    'feedback', btrim(p_feedback)
  );

  insert into public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (
    p_user_id, 'mission_regeneration_started', 'task', p_task_id,
    jsonb_build_object(
      'source_version_number', v_version.version_number,
      'scheduled_date', v_task.scheduled_date,
      'claim_version', v_new_claim_version,
      'feedback_present', true
    )
  );

  return query select 'claimed'::text, v_request_id, v_new_claim_version, v_version.id, v_context;
end;
$$;

revoke all on function public.claim_mission_regeneration(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_mission_regeneration(uuid, uuid, integer, text) to service_role;

-- ─── 12. finalize_mission_regeneration function ──────────────────────────────

create or replace function public.finalize_mission_regeneration(
  p_user_id uuid,
  p_task_id uuid,
  p_request_id uuid,
  p_claim_version integer,
  p_mission jsonb,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_usage_records jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.daily_tasks%rowtype;
  v_request public.mission_regeneration_requests%rowtype;
  v_source_version public.mission_versions%rowtype;
  v_new_version_id uuid;
  v_new_version_number integer;
  v_usage jsonb;
  v_estimated integer;
  v_ts timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_request_id is null
     or p_claim_version is null or p_claim_version < 1
     or p_mission is null or jsonb_typeof(p_mission) <> 'object'
     or p_provider is null or btrim(p_provider) = '' or length(p_provider) > 100
     or p_prompt_version is null or btrim(p_prompt_version) = ''
     or p_usage_records is null or jsonb_typeof(p_usage_records) <> 'array' then
    raise exception 'invalid_regeneration_finalize';
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id and user_id = p_user_id
   for update;

  if not found or v_task.status <> 'rejected' then
    return 'stale';
  end if;

  select * into v_request
    from public.mission_regeneration_requests
   where id = p_request_id and task_id = p_task_id and user_id = p_user_id
   for update;

  if not found or v_request.status <> 'processing'
     or v_request.claim_version <> p_claim_version then
    return 'stale';
  end if;

  select * into v_source_version
    from public.mission_versions
   where id = v_request.source_version_id
     and task_id = p_task_id
     and user_id = p_user_id
   for update;

  if not found or v_source_version.status <> 'rejected' then
    return 'stale';
  end if;

  -- Recheck active goal, selected repository, and installation state
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

  if length(btrim(p_mission->>'title')) not between 5 and 100
     or length(btrim(p_mission->>'description')) not between 20 and 500
     or v_estimated not in (10, 20, 30, 45, 60)
     or p_mission->>'difficulty' not in ('beginner', 'intermediate', 'advanced')
     or jsonb_array_length(p_mission->'acceptance_checklist') not between 2 and 6
     or length(btrim(p_mission->>'suggested_commit_message')) not between 5 and 100
     or length(btrim(p_mission->>'suggested_branch')) not between 1 and 255
     or length(btrim(p_mission->>'learning_outcome')) not between 10 and 300 then
    raise exception 'invalid_mission_values';
  end if;

  v_new_version_number := v_source_version.version_number + 1;
  v_ts := transaction_timestamp();

  -- Insert new immutable version
  insert into public.mission_versions (
    task_id, user_id, version_number, status,
    title, description, estimated_minutes, difficulty,
    acceptance_checklist, suggested_commit_message, suggested_branch,
    learning_outcome, ai_provider, ai_model, prompt_version,
    generation_claim_version, created_at
  ) values (
    p_task_id, p_user_id, v_new_version_number, 'generated',
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
    v_request.claim_version,
    v_ts
  )
  returning id into v_new_version_id;

  -- Update task to point to new version and mark as generated
  update public.daily_tasks
     set status = 'generated',
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
         generation_error_code = null,
         current_mission_version_id = v_new_version_id,
         rejected_at = null,
         review_operation_status = 'idle',
         regeneration_count = regeneration_count + 1,
         updated_at = v_ts
   where id = p_task_id;

  -- Mark request succeeded and link result version
  update public.mission_regeneration_requests
     set status = 'succeeded',
         result_version_id = v_new_version_id,
         completed_at = v_ts,
         updated_at = v_ts
   where id = p_request_id;

  -- Usage records
  for v_usage in select value from jsonb_array_elements(p_usage_records)
  loop
    insert into public.ai_usage_records (
      user_id, task_id, provider, model, operation, input_units,
      output_units, estimated_cost_minor, success, provider_call_id,
      regeneration_request_id, mission_version_id
    ) values (
      p_user_id, p_task_id, p_provider,
      nullif(btrim(v_usage->>'model'), ''),
      'mission_regeneration',
      case when v_usage ? 'input_units' and v_usage->>'input_units' is not null
           then (v_usage->>'input_units')::integer else null end,
      case when v_usage ? 'output_units' and v_usage->>'output_units' is not null
           then (v_usage->>'output_units')::integer else null end,
      null,
      coalesce((v_usage->>'success')::boolean, false),
      (v_usage->>'provider_call_id')::uuid,
      p_request_id,
      v_new_version_id
    )
    on conflict (provider_call_id) where provider_call_id is not null do nothing;
  end loop;

  insert into public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  values (
    p_user_id, 'mission_regeneration_succeeded', 'task', p_task_id,
    jsonb_build_object(
      'source_version_number', v_source_version.version_number,
      'result_version_number', v_new_version_number,
      'scheduled_date', v_task.scheduled_date,
      'claim_version', p_claim_version,
      'prompt_version', p_prompt_version,
      'provider', p_provider
    )
  );

  return 'finalized';
end;
$$;

revoke all on function public.finalize_mission_regeneration(uuid, uuid, uuid, integer, jsonb, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_mission_regeneration(uuid, uuid, uuid, integer, jsonb, text, text, text, jsonb) to service_role;

-- ─── 13. fail_mission_regeneration function ──────────────────────────────────

create or replace function public.fail_mission_regeneration(
  p_user_id uuid,
  p_task_id uuid,
  p_request_id uuid,
  p_claim_version integer,
  p_error_code text,
  p_provider text,
  p_prompt_version text,
  p_usage_records jsonb,
  p_increment_provider_attempts boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.daily_tasks%rowtype;
  v_request public.mission_regeneration_requests%rowtype;
  v_usage jsonb;
  v_ts timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_request_id is null
     or p_claim_version is null or p_claim_version < 1
     or p_error_code is null or p_error_code not in (
       'configuration_error', 'authentication_error', 'quota_exhausted',
       'rate_limited', 'request_rejected', 'content_rejected',
       'invalid_response', 'unsafe_response', 'timed_out',
       'temporarily_unavailable', 'unknown_provider_error', 'context_changed',
       'usage_limit_reached'
     )
     or p_provider is null or btrim(p_provider) = ''
     or p_usage_records is null or jsonb_typeof(p_usage_records) <> 'array' then
    raise exception 'invalid_regeneration_failure';
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id and user_id = p_user_id
   for update;

  if not found then
    return false;
  end if;

  select * into v_request
    from public.mission_regeneration_requests
   where id = p_request_id and task_id = p_task_id and user_id = p_user_id
   for update;

  if not found or v_request.claim_version <> p_claim_version then
    return false;
  end if;

  v_ts := transaction_timestamp();

  -- Usage records
  for v_usage in select value from jsonb_array_elements(p_usage_records)
  loop
    insert into public.ai_usage_records (
      user_id, task_id, provider, model, operation, input_units,
      output_units, estimated_cost_minor, success, provider_call_id,
      regeneration_request_id
    ) values (
      p_user_id, p_task_id, p_provider,
      nullif(btrim(v_usage->>'model'), ''),
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

  if v_request.status = 'processing' then
    update public.mission_regeneration_requests
       set status = 'failed',
           error_code = p_error_code,
           provider_attempts = case when p_increment_provider_attempts
                               then provider_attempts + 1
                               else provider_attempts end,
           completed_at = v_ts,
           updated_at = v_ts
     where id = p_request_id;

    update public.daily_tasks
       set review_operation_status = 'idle',
           updated_at = v_ts
     where id = p_task_id
       and review_operation_status = 'regenerating';

    insert into public.audit_logs (user_id, action, resource_type, resource_id, metadata)
    values (
      p_user_id, 'mission_regeneration_failed', 'task', p_task_id,
      jsonb_build_object(
        'scheduled_date', v_task.scheduled_date,
        'claim_version', p_claim_version,
        'result_code', p_error_code,
        'feedback_present', true
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.fail_mission_regeneration(uuid, uuid, uuid, integer, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.fail_mission_regeneration(uuid, uuid, uuid, integer, text, text, text, jsonb, boolean) to service_role;

-- ─── 14. Update claim_daily_mission_generation to treat regenerating as active ─

-- Replace the function to check review_operation_status = 'regenerating' as active.
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

  -- Lock profile to serialize with regeneration claims
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

  -- Never create or retry while an earlier mission is active (including regenerating).
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

revoke all on function public.claim_daily_mission_generation(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_daily_mission_generation(uuid, date) to service_role;

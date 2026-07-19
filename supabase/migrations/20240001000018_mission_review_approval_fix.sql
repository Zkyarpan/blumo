-- Unit 11 corrective migration: fix ambiguous column reference in
-- claim_mission_regeneration and replace jsonb_object_length with
-- array_length(akeys()) / jsonb_path_exists equivalent in
-- finalize_mission_regeneration.

-- ─── Fix claim_mission_regeneration: ambiguous source_version_id ─────────────

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
  v_max_provider_attempts integer;
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
      from public.mission_regeneration_requests mrr
     where mrr.task_id = p_task_id and mrr.status = 'processing'
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
    from public.mission_versions mv
   where mv.id = v_task.current_mission_version_id
     and mv.task_id = p_task_id
     and mv.user_id = p_user_id
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
    from public.mission_regeneration_requests mrr
   where mrr.source_version_id = v_version.id and mrr.status = 'succeeded'
   limit 1;

  if found then
    return query select 'already_succeeded'::text, v_existing_request.id,
      v_existing_request.claim_version, v_version.id, null::jsonb;
    return;
  end if;

  -- Check per-source provider attempts
  select coalesce(max(mrr.provider_attempts), 0)
    into v_max_provider_attempts
    from public.mission_regeneration_requests mrr
   where mrr.source_version_id = v_version.id;

  if v_max_provider_attempts >= 3 then
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
    from public.mission_regeneration_requests mrr
   where mrr.source_version_id = v_version.id and mrr.status = 'failed'
   order by mrr.created_at desc
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
  select coalesce(jsonb_agg(history_item order by dt_completed_at desc), '[]'::jsonb)
    into v_previous
    from (
      select jsonb_build_object(
               'title', mv.title,
               'learning_outcome', mv.learning_outcome,
               'difficulty', mv.difficulty,
               'scheduled_date', dt.scheduled_date
             ) as history_item,
             dt.completed_at as dt_completed_at
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

-- ─── Fix finalize_mission_regeneration: replace jsonb_object_length ──────────
-- jsonb_object_length does not exist; use (select count(*) from jsonb_object_keys(p_mission))

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
  v_mission_key_count integer;
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

  -- Count mission keys using jsonb_object_keys
  select count(*)::integer into v_mission_key_count
    from jsonb_object_keys(p_mission);

  if v_mission_key_count <> 8
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

-- Unit 10 real-provider correction.
-- Keep generation_attempts monotonic for stale-response protection while
-- tracking only provider-backed failed claims against the user allowance.

alter table public.daily_tasks
  add column provider_generation_attempts integer not null default 0
  check (provider_generation_attempts between 0 and 3);

-- Preserve the allowance already consumed by any failed rows that reached the
-- provider. Failed rows without usage were application failures and cost zero.
update public.daily_tasks task
   set provider_generation_attempts = least(task.generation_attempts, 3)
 where task.status = 'failed'
   and exists (
     select 1
       from public.ai_usage_records usage_record
      where usage_record.task_id = task.id
   );

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

  select * into v_profile
    from public.profiles
   where id = p_user_id;

  if not found or v_profile.onboarding_completed_at is null then
    return query select 'not_onboarded'::text, null::uuid, null::integer, null::jsonb;
    return;
  end if;

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

    if v_task.provider_generation_attempts >= 3 then
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

  select active_task.* into v_active_task
    from public.daily_tasks active_task
   where active_task.user_id = p_user_id
     and active_task.status in ('generating', 'generated', 'in_progress', 'ready', 'committing')
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
         and status = 'committed'
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
    generation_attempts,
    provider_generation_attempts
  ) values (
    p_user_id,
    v_goal.id,
    v_repository.id,
    p_scheduled_date,
    'Mission generation in progress',
    'generating',
    1,
    0
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
       and status in ('generating', 'generated', 'in_progress', 'ready', 'committing')
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

create or replace function public.fail_daily_mission_generation(
  p_user_id uuid,
  p_task_id uuid,
  p_claim_version integer,
  p_error_code text,
  p_provider text,
  p_prompt_version text,
  p_usage_records jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.daily_tasks%rowtype;
  v_usage jsonb;
  v_provider_called boolean;
begin
  if p_user_id is null or p_task_id is null or p_claim_version is null
     or p_claim_version < 1
     or p_error_code is null or p_error_code not in (
       'configuration_error', 'authentication_error', 'quota_exhausted',
       'rate_limited', 'request_rejected', 'content_rejected',
       'invalid_response', 'unsafe_response', 'timed_out',
       'temporarily_unavailable', 'unknown_provider_error', 'context_changed'
     )
     or p_provider is null or btrim(p_provider) = '' or length(p_provider) > 100
     or p_prompt_version is null or btrim(p_prompt_version) = ''
     or p_usage_records is null or jsonb_typeof(p_usage_records) <> 'array' then
    raise exception 'invalid_generation_failure';
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return false;
  end if;

  v_provider_called := jsonb_array_length(p_usage_records) > 0;

  for v_usage in select value from jsonb_array_elements(p_usage_records)
  loop
    insert into public.ai_usage_records (
      user_id, task_id, provider, model, operation, input_units,
      output_units, estimated_cost_minor, success, provider_call_id
    ) values (
      p_user_id,
      p_task_id,
      p_provider,
      nullif(btrim(v_usage->>'model'), ''),
      'task_generation',
      case when v_usage ? 'input_units' and v_usage->>'input_units' is not null
           then (v_usage->>'input_units')::integer else null end,
      case when v_usage ? 'output_units' and v_usage->>'output_units' is not null
           then (v_usage->>'output_units')::integer else null end,
      null,
      false,
      (v_usage->>'provider_call_id')::uuid
    )
    on conflict (provider_call_id) where provider_call_id is not null do nothing;
  end loop;

  if v_task.status <> 'generating'
     or v_task.generation_attempts <> p_claim_version then
    return false;
  end if;

  update public.daily_tasks
     set status = 'failed',
         generation_error_code = p_error_code,
         provider_generation_attempts = case
           when v_provider_called then least(provider_generation_attempts + 1, 3)
           else provider_generation_attempts
         end,
         updated_at = transaction_timestamp()
   where id = p_task_id;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_generation_failed',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'prompt_version', p_prompt_version,
      'provider', p_provider,
      'generation_attempt', p_claim_version,
      'result_code', p_error_code
    )
  );

  return true;
end;
$$;

create or replace function public.reset_failed_mission_allowance_after_usage_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.task_id is not null
     and not exists (
       select 1
         from public.ai_usage_records usage_record
        where usage_record.task_id = old.task_id
     ) then
    update public.daily_tasks
       set provider_generation_attempts = 0,
           updated_at = transaction_timestamp()
     where id = old.task_id
       and status = 'failed';
  end if;

  return old;
end;
$$;

create trigger ai_usage_records_reset_failed_mission_allowance
  after delete on public.ai_usage_records
  for each row execute function public.reset_failed_mission_allowance_after_usage_delete();

revoke all on function public.claim_daily_mission_generation(uuid, date)
  from public, anon, authenticated;
grant execute on function public.claim_daily_mission_generation(uuid, date)
  to service_role;

revoke all on function public.fail_daily_mission_generation(uuid, uuid, integer, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.fail_daily_mission_generation(uuid, uuid, integer, text, text, text, jsonb)
  to service_role;

revoke all on function public.reset_failed_mission_allowance_after_usage_delete()
  from public, anon, authenticated;

-- Unit 10 corrective migration: replace the unsupported JSON object-length
-- helper in only the privileged finalization function
-- and count top-level keys with jsonb_object_keys instead.

create or replace function public.finalize_daily_mission_generation(
  p_user_id uuid,
  p_task_id uuid,
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
  v_usage jsonb;
  v_estimated integer;
begin
  if p_user_id is null or p_task_id is null or p_claim_version is null
     or p_claim_version < 1 or p_mission is null
     or jsonb_typeof(p_mission) <> 'object'
     or p_provider is null or btrim(p_provider) = '' or length(p_provider) > 100
     or (p_model is not null and length(p_model) > 200)
     or p_prompt_version is null or btrim(p_prompt_version) = '' or length(p_prompt_version) > 100
     or p_usage_records is null or jsonb_typeof(p_usage_records) <> 'array' then
    raise exception 'invalid_generation_finalize';
  end if;

  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found
     or v_task.status <> 'generating'
     or v_task.generation_attempts <> p_claim_version then
    return 'stale';
  end if;

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

  if (select count(*) from jsonb_object_keys(p_mission)) <> 8
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

  if not exists (
    select 1
      from public.profiles p
      join public.goals g
        on g.id = v_task.goal_id
       and g.user_id = p_user_id
       and g.status = 'active'
      join public.repositories r
        on r.id = v_task.repository_id
       and r.user_id = p_user_id
       and r.is_selected = true
       and r.access_status = 'active'
      join public.github_installations gi
        on gi.id = r.installation_id
       and gi.user_id = p_user_id
       and gi.status = 'active'
     where p.id = p_user_id
       and p.experience_level = p_mission->>'difficulty'
       and g.daily_minutes >= v_estimated
       and r.default_branch = p_mission->>'suggested_branch'
  ) then
    return 'context_changed';
  end if;

  update public.daily_tasks
     set title = btrim(p_mission->>'title'),
         summary = btrim(p_mission->>'description'),
         estimated_minutes = v_estimated,
         difficulty = p_mission->>'difficulty',
         acceptance_checklist = p_mission->'acceptance_checklist',
         suggested_commit_message = btrim(p_mission->>'suggested_commit_message'),
         suggested_branch = btrim(p_mission->>'suggested_branch'),
         learning_outcome = btrim(p_mission->>'learning_outcome'),
         ai_provider = btrim(p_provider),
         ai_model = nullif(btrim(p_model), ''),
         prompt_version = btrim(p_prompt_version),
         generation_error_code = null,
         status = 'generated',
         updated_at = transaction_timestamp()
   where id = v_task.id;

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
      coalesce((v_usage->>'success')::boolean, false),
      (v_usage->>'provider_call_id')::uuid
    )
    on conflict (provider_call_id) where provider_call_id is not null do nothing;
  end loop;

  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_generation_succeeded',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'prompt_version', p_prompt_version,
      'provider', p_provider,
      'generation_attempt', p_claim_version,
      'result_code', 'generated'
    )
  );

  return 'finalized';
end;
$$;

revoke all on function public.finalize_daily_mission_generation(uuid, uuid, integer, jsonb, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_daily_mission_generation(uuid, uuid, integer, jsonb, text, text, text, jsonb)
  to service_role;

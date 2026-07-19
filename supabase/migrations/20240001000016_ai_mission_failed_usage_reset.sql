-- Unit 10 real-provider correction.
-- Deleting every failed provider usage row during local development must make
-- the preserved failed task retryable, regardless of its previous fixed error.

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
           generation_error_code = 'unknown_provider_error',
           updated_at = transaction_timestamp()
     where id = old.task_id
       and status = 'failed';
  end if;

  return old;
end;
$$;

revoke all on function public.reset_failed_mission_allowance_after_usage_delete()
  from public, anon, authenticated;

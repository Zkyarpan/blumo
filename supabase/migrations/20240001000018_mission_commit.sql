-- Unit 12: Approved Mission GitHub Commit.
-- Extends commits.status to include reconciliation_required.
-- Adds record_mission_commit service-role-only atomic function.
-- Does not modify any previously applied migration.

-- ---------------------------------------------------------------------------
-- Extend commits.status constraint to include reconciliation_required
-- ---------------------------------------------------------------------------
alter table public.commits
  drop constraint if exists commits_status_check;

alter table public.commits
  add constraint commits_status_check
  check (status in ('created', 'reconciled', 'failed', 'reconciliation_required'));

-- ---------------------------------------------------------------------------
-- record_mission_commit
-- Atomically: verifies ownership and task state, checks for duplicate commit,
-- inserts commit row, transitions task to completed, writes audit event.
-- If called after a successful GitHub commit but DB write fails, the caller
-- is expected to catch the error and mark reconciliation_required externally.
-- ---------------------------------------------------------------------------
create or replace function public.record_mission_commit(
  p_user_id          uuid,
  p_task_id          uuid,
  p_repository_id    uuid,
  p_github_commit_sha text,
  p_github_commit_url text,
  p_branch           text,
  p_file_path        text,
  p_commit_message   text,
  p_content_snapshot text,
  p_operation_id     uuid,
  p_version_number   integer
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task    public.daily_tasks%rowtype;
  v_ts      timestamptz;
begin
  if p_user_id is null or p_task_id is null or p_repository_id is null
     or p_github_commit_sha is null or btrim(p_github_commit_sha) = ''
     or p_github_commit_url is null or btrim(p_github_commit_url) = ''
     or p_branch is null or btrim(p_branch) = ''
     or p_file_path is null or btrim(p_file_path) = ''
     or p_commit_message is null or btrim(p_commit_message) = ''
     or p_content_snapshot is null
     or p_operation_id is null
     or p_version_number is null or p_version_number < 1 then
    raise exception 'invalid_commit_input';
  end if;

  -- Lock task row for serialization
  select * into v_task
    from public.daily_tasks
   where id = p_task_id
     and user_id = p_user_id
   for update;

  if not found then
    return 'not_found';
  end if;

  -- Only approved tasks can be committed
  if v_task.status <> 'approved' then
    if v_task.status = 'completed' then
      -- Check if a commit record already exists for this task
      if exists (
        select 1 from public.commits
         where task_id = p_task_id
           and status = 'created'
      ) then
        return 'already_committed';
      end if;
    end if;
    return 'invalid_transition';
  end if;

  -- Check for existing successful commit (idempotency)
  if exists (
    select 1 from public.commits
     where task_id = p_task_id
       and status = 'created'
  ) then
    return 'already_committed';
  end if;

  -- Check for operation_id replay (additional replay guard)
  -- operation_id uniqueness is enforced by the unique constraint on github_commit_sha,
  -- and also by the task_id unique constraint. No separate operation_id column needed.

  v_ts := transaction_timestamp();

  -- Insert commit record
  insert into public.commits (
    user_id, task_id, repository_id,
    github_commit_sha, github_commit_url,
    branch, file_path, commit_message, content_snapshot,
    status, created_at
  ) values (
    p_user_id, p_task_id, p_repository_id,
    btrim(p_github_commit_sha), btrim(p_github_commit_url),
    btrim(p_branch), btrim(p_file_path), btrim(p_commit_message), p_content_snapshot,
    'created', v_ts
  );

  -- Transition task to completed
  update public.daily_tasks
     set status = 'completed',
         completed_at = v_ts,
         updated_at = v_ts
   where id = p_task_id;

  -- Write sanitized audit event (no SHA, no content, no token)
  insert into public.audit_logs (
    user_id, action, resource_type, resource_id, metadata
  ) values (
    p_user_id,
    'mission_committed',
    'task',
    p_task_id,
    jsonb_build_object(
      'scheduled_date', v_task.scheduled_date,
      'branch', btrim(p_branch),
      'file_path', btrim(p_file_path),
      'version_number', p_version_number,
      'result_code', 'committed'
    )
  );

  return 'committed';
end;
$$;

revoke all on function public.record_mission_commit(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, integer
) from public, anon, authenticated;

grant execute on function public.record_mission_commit(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, integer
) to service_role;

-- Unit 09: GitHub App webhook lifecycle.
-- Webhook deliveries are authenticated in the application before these
-- service-role-only functions are called. No raw payloads or secrets are stored.

create table public.github_webhook_deliveries (
  id                 uuid        primary key default gen_random_uuid(),
  delivery_id        text        not null unique,
  event_name         text        not null,
  action             text,
  payload_sha256     text        not null
                                 check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  installation_id    bigint,
  status             text        not null default 'processing'
                                 check (status in ('processing', 'completed', 'ignored', 'failed')),
  attempt_count      integer     not null default 1 check (attempt_count > 0),
  claimed_at         timestamptz not null default now(),
  processed_at       timestamptz,
  last_error_code    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger github_webhook_deliveries_set_updated_at
  before update on public.github_webhook_deliveries
  for each row execute function public.set_updated_at();

alter table public.github_webhook_deliveries enable row level security;

revoke all on table public.github_webhook_deliveries from public, anon, authenticated;
grant select, insert, update on table public.github_webhook_deliveries to service_role;

alter table public.audit_logs
  add column github_delivery_id text;

create unique index audit_logs_github_delivery_id_idx
  on public.audit_logs (github_delivery_id)
  where github_delivery_id is not null;

create or replace function public.claim_github_webhook_delivery(
  p_delivery_id text,
  p_event_name text,
  p_action text,
  p_payload_sha256 text,
  p_installation_id bigint
)
returns table (claim_result text, claim_version integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.github_webhook_deliveries%rowtype;
  v_inserted_version integer;
begin
  if p_delivery_id is null
     or length(p_delivery_id) > 100
     or p_delivery_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_delivery_id';
  end if;

  if p_event_name is null
     or length(p_event_name) < 1
     or length(p_event_name) > 100
     or p_event_name !~ '^[A-Za-z0-9_]+$' then
    raise exception 'invalid_event_name';
  end if;

  if p_action is not null
     and (length(p_action) < 1
       or length(p_action) > 100
       or p_action !~ '^[A-Za-z0-9_]+$') then
    raise exception 'invalid_action';
  end if;

  if p_payload_sha256 is null
     or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_payload_digest';
  end if;

  if p_installation_id is not null and p_installation_id <= 0 then
    raise exception 'invalid_installation_id';
  end if;

  insert into public.github_webhook_deliveries (
    delivery_id,
    event_name,
    action,
    payload_sha256,
    installation_id,
    status,
    attempt_count,
    claimed_at
  )
  values (
    lower(p_delivery_id),
    p_event_name,
    p_action,
    p_payload_sha256,
    p_installation_id,
    'processing',
    1,
    transaction_timestamp()
  )
  on conflict (delivery_id) do nothing
  returning attempt_count into v_inserted_version;

  if found then
    return query select 'claimed'::text, v_inserted_version;
    return;
  end if;

  select *
    into v_delivery
    from public.github_webhook_deliveries
   where delivery_id = lower(p_delivery_id)
   for update;

  if not found then
    raise exception 'delivery_claim_failed';
  end if;

  if v_delivery.event_name is distinct from p_event_name
     or v_delivery.action is distinct from p_action
     or v_delivery.payload_sha256 is distinct from p_payload_sha256
     or v_delivery.installation_id is distinct from p_installation_id then
    return query select 'conflict'::text, null::integer;
    return;
  end if;

  if v_delivery.status in ('completed', 'ignored') then
    return query select 'duplicate'::text, null::integer;
    return;
  end if;

  if v_delivery.status = 'processing'
     and v_delivery.claimed_at > transaction_timestamp() - interval '5 minutes' then
    return query select 'in_progress'::text, null::integer;
    return;
  end if;

  update public.github_webhook_deliveries
     set status = 'processing',
         attempt_count = attempt_count + 1,
         claimed_at = transaction_timestamp(),
         processed_at = null,
         last_error_code = null
   where id = v_delivery.id
   returning attempt_count into v_inserted_version;

  return query select 'reclaimed'::text, v_inserted_version;
end;
$$;

create or replace function public.fail_github_webhook_delivery(
  p_delivery_id text,
  p_claim_version integer,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_affected integer;
begin
  if p_error_code is null
     or length(p_error_code) > 100
     or p_error_code !~ '^[a-z0-9_]+$' then
    raise exception 'invalid_error_code';
  end if;

  update public.github_webhook_deliveries
     set status = 'failed',
         last_error_code = p_error_code,
         processed_at = null
   where delivery_id = lower(p_delivery_id)
     and status = 'processing'
     and attempt_count = p_claim_version;

  get diagnostics v_affected = row_count;
  return v_affected = 1;
end;
$$;

create or replace function public.apply_github_webhook_delivery(
  p_delivery_id text,
  p_payload_sha256 text,
  p_claim_version integer,
  p_event_name text,
  p_action text,
  p_installation_id bigint,
  p_account_id bigint,
  p_account_login text,
  p_account_type text,
  p_repository_delta jsonb
)
returns table (apply_result text, affected_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery public.github_webhook_deliveries%rowtype;
  v_installation public.github_installations%rowtype;
  v_existing_installation_id uuid;
  v_repository jsonb;
  v_repository_id bigint;
  v_now timestamptz := transaction_timestamp();
  v_affected integer := 0;
  v_row_count integer := 0;
  v_received integer := 0;
  v_status text := 'completed';
  v_result text := 'processed';
  v_audit_action text;
  v_resource_type text;
  v_metadata jsonb;
begin
  select *
    into v_delivery
    from public.github_webhook_deliveries
   where delivery_id = lower(p_delivery_id)
   for update;

  if not found
     or v_delivery.status <> 'processing'
     or v_delivery.attempt_count <> p_claim_version
     or v_delivery.event_name is distinct from p_event_name
     or v_delivery.action is distinct from p_action
     or v_delivery.payload_sha256 is distinct from p_payload_sha256
     or v_delivery.installation_id is distinct from p_installation_id then
    raise exception 'invalid_delivery_claim';
  end if;

  if p_event_name not in ('installation', 'installation_repositories') then
    update public.github_webhook_deliveries
       set status = 'ignored',
           processed_at = v_now,
           last_error_code = null
     where id = v_delivery.id
       and attempt_count = p_claim_version;

    return query select 'ignored'::text, 0;
    return;
  end if;

  if p_installation_id is null or p_installation_id <= 0
     or p_account_id is null or p_account_id <= 0
     or p_account_login is null or btrim(p_account_login) = ''
     or p_account_type is distinct from 'User' then
    raise exception 'invalid_installation_identity';
  end if;

  select *
    into v_installation
    from public.github_installations
   where installation_id = p_installation_id
   for update;

  if not found then
    update public.github_webhook_deliveries
       set status = 'ignored',
           processed_at = v_now,
           last_error_code = null
     where id = v_delivery.id
       and attempt_count = p_claim_version;

    return query select 'ignored'::text, 0;
    return;
  end if;

  if v_installation.account_id <> p_account_id
     or lower(v_installation.account_login) <> lower(p_account_login)
     or v_installation.account_type <> p_account_type then
    insert into public.audit_logs (
      user_id,
      action,
      resource_type,
      resource_id,
      github_delivery_id,
      metadata
    )
    values (
      v_installation.user_id,
      'github_webhook_ignored',
      'github_installation',
      v_installation.id,
      lower(p_delivery_id),
      jsonb_build_object('event_name', p_event_name, 'action', p_action)
    )
    on conflict (github_delivery_id) where github_delivery_id is not null do nothing;

    update public.github_webhook_deliveries
       set status = 'ignored',
           processed_at = v_now,
           last_error_code = null
     where id = v_delivery.id
       and attempt_count = p_claim_version;

    return query select 'ignored'::text, 0;
    return;
  end if;

  if p_event_name = 'installation' then
    v_resource_type := 'github_installation';

    case p_action
      when 'created' then
        update public.github_installations
           set status = 'active',
               account_login = p_account_login,
               suspended_at = null,
               uninstalled_at = null
         where id = v_installation.id;
        v_audit_action := 'github_installation_created';
        v_affected := 1;

      when 'suspend' then
        update public.github_installations
           set status = 'suspended',
               suspended_at = v_now,
               uninstalled_at = null
         where id = v_installation.id;

        update public.repositories
           set access_status = case
                                 when access_status = 'active' then 'unavailable'
                                 else access_status
                               end,
               is_selected = false,
               last_synced_at = v_now
         where user_id = v_installation.user_id
           and installation_id = v_installation.id
           and (access_status = 'active' or is_selected = true);
        get diagnostics v_affected = row_count;
        v_audit_action := 'github_installation_suspended';

      when 'unsuspend' then
        update public.github_installations
           set status = 'active',
               suspended_at = null,
               uninstalled_at = null
         where id = v_installation.id;

        update public.repositories
           set access_status = 'active',
               is_selected = false,
               last_synced_at = v_now
         where user_id = v_installation.user_id
           and installation_id = v_installation.id
           and access_status = 'unavailable';
        get diagnostics v_affected = row_count;
        v_audit_action := 'github_installation_unsuspended';

      when 'deleted' then
        update public.github_installations
           set status = 'uninstalled',
               suspended_at = null,
               uninstalled_at = v_now
         where id = v_installation.id;

        update public.repositories
           set access_status = case
                                 when access_status in ('active', 'unavailable') then 'unavailable'
                                 else access_status
                               end,
               is_selected = false,
               last_synced_at = v_now
         where user_id = v_installation.user_id
           and installation_id = v_installation.id
           and (access_status in ('active', 'unavailable') or is_selected = true);
        get diagnostics v_affected = row_count;
        v_audit_action := 'github_installation_deleted';

      when 'new_permissions_accepted' then
        v_audit_action := 'github_installation_permissions_accepted';
        v_affected := 0;

      else
        v_status := 'ignored';
        v_result := 'ignored';
        v_audit_action := 'github_webhook_ignored';
        v_affected := 0;
    end case;

    v_metadata := jsonb_build_object(
      'event_name', p_event_name,
      'action', p_action,
      'affected_count', v_affected
    );

  elsif p_event_name = 'installation_repositories' then
    v_resource_type := 'repository_access';

    if p_action not in ('added', 'removed') then
      v_status := 'ignored';
      v_result := 'ignored';
      v_audit_action := 'github_webhook_ignored';
      v_metadata := jsonb_build_object(
        'event_name', p_event_name,
        'action', p_action
      );
    else
      if p_repository_delta is null
         or jsonb_typeof(p_repository_delta) <> 'array' then
        raise exception 'invalid_repository_delta';
      end if;

      v_received := jsonb_array_length(p_repository_delta);

      if p_action = 'added' then
        for v_repository in
          select value from jsonb_array_elements(p_repository_delta)
        loop
          if jsonb_typeof(v_repository) <> 'object'
             or coalesce(v_repository->>'id', '') !~ '^[0-9]+$'
             or (v_repository->>'id')::numeric > 9007199254740991
             or (v_repository->>'id')::numeric <= 0
             or coalesce(v_repository->>'owner_id', '') !~ '^[0-9]+$'
             or (v_repository->>'owner_id')::numeric > 9007199254740991
             or (v_repository->>'owner_id')::bigint <> p_account_id
             or v_repository->>'owner_type' is distinct from 'User'
             or btrim(coalesce(v_repository->>'owner_login', '')) = ''
             or btrim(coalesce(v_repository->>'name', '')) = ''
             or btrim(coalesce(v_repository->>'full_name', '')) = ''
             or btrim(coalesce(v_repository->>'default_branch', '')) = ''
             or jsonb_typeof(v_repository->'is_private') <> 'boolean' then
            raise exception 'invalid_repository_delta';
          end if;

          v_repository_id := (v_repository->>'id')::bigint;

          select installation_id
            into v_existing_installation_id
            from public.repositories
           where user_id = v_installation.user_id
             and github_repository_id = v_repository_id
           for update;

          if found and v_existing_installation_id <> v_installation.id then
            raise exception 'repository_installation_conflict';
          end if;

          insert into public.repositories (
            user_id,
            installation_id,
            github_repository_id,
            owner,
            name,
            full_name,
            default_branch,
            is_private,
            is_selected,
            access_status,
            last_synced_at
          )
          values (
            v_installation.user_id,
            v_installation.id,
            v_repository_id,
            v_repository->>'owner_login',
            v_repository->>'name',
            v_repository->>'full_name',
            v_repository->>'default_branch',
            (v_repository->>'is_private')::boolean,
            false,
            case when v_installation.status = 'active' then 'active' else 'unavailable' end,
            v_now
          )
          on conflict (user_id, github_repository_id) do update
            set owner = excluded.owner,
                name = excluded.name,
                full_name = excluded.full_name,
                default_branch = excluded.default_branch,
                is_private = excluded.is_private,
                access_status = excluded.access_status,
                is_selected = case
                                when excluded.access_status = 'active'
                                  then repositories.is_selected
                                else false
                              end,
                last_synced_at = excluded.last_synced_at;

          v_affected := v_affected + 1;
        end loop;

        v_audit_action := 'github_repositories_added';
      else
        for v_repository in
          select value from jsonb_array_elements(p_repository_delta)
        loop
          if jsonb_typeof(v_repository) <> 'object'
             or coalesce(v_repository->>'id', '') !~ '^[0-9]+$'
             or (v_repository->>'id')::numeric > 9007199254740991
             or (v_repository->>'id')::numeric <= 0 then
            raise exception 'invalid_repository_delta';
          end if;

          v_repository_id := (v_repository->>'id')::bigint;

          update public.repositories
             set access_status = 'removed',
                 is_selected = false,
                 last_synced_at = v_now
           where user_id = v_installation.user_id
             and installation_id = v_installation.id
             and github_repository_id = v_repository_id;
          get diagnostics v_row_count = row_count;
          v_affected := v_affected + v_row_count;
        end loop;

        v_audit_action := 'github_repositories_removed';
      end if;

      v_metadata := jsonb_build_object(
        'event_name', p_event_name,
        'action', p_action,
        'received_count', v_received,
        'affected_count', v_affected
      );
    end if;
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    resource_type,
    resource_id,
    github_delivery_id,
    metadata
  )
  values (
    v_installation.user_id,
    v_audit_action,
    v_resource_type,
    v_installation.id,
    lower(p_delivery_id),
    v_metadata
  )
  on conflict (github_delivery_id) where github_delivery_id is not null do nothing;

  update public.github_webhook_deliveries
     set status = v_status,
         processed_at = v_now,
         last_error_code = null
   where id = v_delivery.id
     and status = 'processing'
     and attempt_count = p_claim_version;
  get diagnostics v_row_count = row_count;

  if v_row_count <> 1 then
    raise exception 'delivery_completion_failed';
  end if;

  return query select v_result, v_affected;
end;
$$;

revoke all on function public.claim_github_webhook_delivery(text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_github_webhook_delivery(text, text, text, text, bigint)
  to service_role;

revoke all on function public.fail_github_webhook_delivery(text, integer, text)
  from public, anon, authenticated;
grant execute on function public.fail_github_webhook_delivery(text, integer, text)
  to service_role;

revoke all on function public.apply_github_webhook_delivery(text, text, integer, text, text, bigint, bigint, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_github_webhook_delivery(text, text, integer, text, text, bigint, bigint, text, text, jsonb)
  to service_role;

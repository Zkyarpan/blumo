-- Migration 20: Auto-commit schedules
-- Creates the schedules table and a service-role-only auto_approve_mission RPC.

-- ============================================================
-- schedules table
-- ============================================================

CREATE TABLE IF NOT EXISTS schedules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_id           uuid        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  timezone          text        NOT NULL,
  -- preferred local time expressed as HH:MM (24-hour)
  local_time        text        NOT NULL DEFAULT '09:00'
    CHECK (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- ISO weekdays 1=Monday … 7=Sunday; NULL means every day
  days_of_week      smallint[]  NULL,
  -- next UTC instant at which the cron should fire
  next_run_at       timestamptz NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  last_run_at       timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- One active schedule per user (opt-in / opt-out model)
CREATE UNIQUE INDEX schedules_one_active_per_user_idx
  ON schedules (user_id)
  WHERE is_active = true;

-- Cron query index
CREATE INDEX schedules_due_idx
  ON schedules (is_active, next_run_at)
  WHERE is_active = true;

-- RLS
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- Users may read their own schedule rows
CREATE POLICY "schedules_select_own"
  ON schedules FOR SELECT
  USING (user_id = auth.uid());

-- Users may NOT insert / update / delete directly; all writes go through
-- the service-role upsert functions below.

-- updated_at trigger
CREATE TRIGGER set_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- upsert_auto_commit_schedule
-- Callable only by the service role (Blumo server-only code).
-- Inserts or replaces the user's active schedule.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_auto_commit_schedule(
  p_user_id     uuid,
  p_timezone    text,
  p_local_time  text,      -- HH:MM 24-hour
  p_next_run_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal_id uuid;
BEGIN
  -- Verify the user exists and is onboarded
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND onboarding_completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'not_onboarded';
  END IF;

  -- Verify the user has an active goal
  SELECT id INTO v_goal_id
  FROM goals
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;

  IF v_goal_id IS NULL THEN
    RAISE EXCEPTION 'no_active_goal';
  END IF;

  -- Deactivate any existing schedule rows first (idempotent)
  UPDATE schedules
  SET is_active = false, updated_at = now()
  WHERE user_id = p_user_id AND is_active = true;

  -- Insert the new active schedule
  INSERT INTO schedules (
    user_id, goal_id, timezone, local_time, next_run_at, is_active
  ) VALUES (
    p_user_id, v_goal_id, p_timezone, p_local_time, p_next_run_at, true
  );
END;
$$;

REVOKE ALL ON FUNCTION upsert_auto_commit_schedule FROM public, anon, authenticated;

-- ============================================================
-- delete_auto_commit_schedule
-- Deactivates the user's schedule (soft disable).
-- ============================================================

CREATE OR REPLACE FUNCTION delete_auto_commit_schedule(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE schedules
  SET is_active = false, updated_at = now()
  WHERE user_id = p_user_id AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION delete_auto_commit_schedule FROM public, anon, authenticated;

-- ============================================================
-- advance_schedule_next_run
-- Called after a successful auto-commit to push next_run_at
-- forward by exactly 24 hours.
-- ============================================================

CREATE OR REPLACE FUNCTION advance_schedule_next_run(
  p_schedule_id uuid,
  p_last_run_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE schedules
  SET
    last_run_at = p_last_run_at,
    next_run_at = p_last_run_at + interval '24 hours',
    updated_at  = now()
  WHERE id = p_schedule_id AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION advance_schedule_next_run FROM public, anon, authenticated;

-- ============================================================
-- auto_approve_mission
-- Service-role-only. Transitions a generated mission to
-- approved so the auto-commit pipeline can commit it.
-- Records an audit event with source = auto_commit.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_approve_mission(
  p_user_id  uuid,
  p_task_id  uuid
)
RETURNS text   -- 'approved' | 'already_approved' | 'not_found' | 'not_approvable'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task        daily_tasks%ROWTYPE;
  v_version_id  uuid;
BEGIN
  SELECT * INTO v_task
  FROM daily_tasks
  WHERE id = p_task_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_task.status = 'approved' THEN
    RETURN 'already_approved';
  END IF;

  IF v_task.status = 'completed' THEN
    RETURN 'already_approved';
  END IF;

  IF v_task.status NOT IN ('generated') THEN
    RETURN 'not_approvable';
  END IF;

  IF v_task.current_mission_version_id IS NULL THEN
    RETURN 'not_approvable';
  END IF;

  v_version_id := v_task.current_mission_version_id;

  -- Transition task
  UPDATE daily_tasks
  SET
    status      = 'approved',
    approved_at = now(),
    updated_at  = now()
  WHERE id = p_task_id AND user_id = p_user_id;

  -- Transition mission version
  UPDATE mission_versions
  SET
    status      = 'approved',
    approved_at = now()
  WHERE id = v_version_id AND task_id = p_task_id AND user_id = p_user_id;

  -- Audit event
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_user_id,
    'mission_auto_approved',
    'task',
    p_task_id,
    jsonb_build_object('source', 'auto_commit', 'version_id', v_version_id)
  );

  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION auto_approve_mission FROM public, anon, authenticated;

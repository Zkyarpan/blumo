-- Migration 21: Fix advance_schedule_next_run to be timezone-aware.
--
-- The previous implementation always added exactly 24 hours to p_last_run_at.
-- This works most of the time but drifts by one hour when the UK transitions
-- between GMT (UTC+0) and BST (UTC+1) at daylight saving boundaries.
--
-- The new implementation re-computes next_run_at from scratch using the same
-- logic as computeNextRunAt() in schedule.service.ts:
--   1. Parse local_time (HH:MM) and timezone stored on the schedule row.
--   2. Find the next occurrence of that local clock time that is at least
--      30 minutes after p_last_run_at.
--
-- This ensures the commit always fires at the stored local time regardless
-- of DST changes.

CREATE OR REPLACE FUNCTION advance_schedule_next_run(
  p_schedule_id uuid,
  p_last_run_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row         schedules%ROWTYPE;
  v_hour        int;
  v_minute      int;
  v_candidate   timestamptz;
  v_local_date  date;
BEGIN
  SELECT * INTO v_row
  FROM schedules
  WHERE id = p_schedule_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Parse HH:MM stored as text
  v_hour   := split_part(v_row.local_time, ':', 1)::int;
  v_minute := split_part(v_row.local_time, ':', 2)::int;

  -- Build candidate: today at HH:MM in user's timezone, starting from
  -- p_last_run_at. Use AT TIME ZONE to get the local wall-clock date.
  v_local_date := (p_last_run_at AT TIME ZONE v_row.timezone)::date;

  -- Construct today's candidate as a local timestamp then convert to UTC
  v_candidate := (
    (v_local_date::text || ' ' ||
     lpad(v_hour::text, 2, '0') || ':' ||
     lpad(v_minute::text, 2, '0') || ':00')::timestamp
    AT TIME ZONE v_row.timezone
  );

  -- If the candidate is not at least 30 minutes after last run, advance by one day
  IF v_candidate <= p_last_run_at + interval '30 minutes' THEN
    v_candidate := (
      ((v_local_date + 1)::text || ' ' ||
       lpad(v_hour::text, 2, '0') || ':' ||
       lpad(v_minute::text, 2, '0') || ':00')::timestamp
      AT TIME ZONE v_row.timezone
    );
  END IF;

  UPDATE schedules
  SET
    last_run_at = p_last_run_at,
    next_run_at = v_candidate,
    updated_at  = now()
  WHERE id = p_schedule_id AND is_active = true;
END;
$$;

REVOKE ALL ON FUNCTION advance_schedule_next_run FROM public, anon, authenticated;

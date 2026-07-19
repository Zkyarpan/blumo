-- Local development seed: two test profiles for RLS verification.
-- Profile rows are normally created by the handle_new_user() trigger.
-- These UUIDs do not correspond to real auth.users rows; they are used
-- only for local SQL-level testing of constraints and RLS policies.
--
-- To use: run `supabase db reset` which applies all migrations then this seed.
-- Do NOT apply this file in production.

-- Insert directly into profiles (bypasses trigger, used for seeding only).
-- In a real local Supabase instance, auth.users rows must exist first.
-- For SQL-level constraint tests only, insert with no FK check bypass:

insert into public.profiles (id, github_username, display_name, timezone, experience_level)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'test-user-alpha',
    'Test User Alpha',
    'UTC',
    'beginner'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'test-user-beta',
    'Test User Beta',
    'UTC',
    'beginner'
  )
on conflict (id) do nothing;

-- One active goal per test user.
insert into public.goals (id, user_id, title, technology, task_type, daily_minutes, status)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Learn React fundamentals',
    'React',
    'learning_note',
    30,
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'Practice TypeScript',
    'TypeScript',
    'coding_challenge',
    20,
    'active'
  )
on conflict (id) do nothing;

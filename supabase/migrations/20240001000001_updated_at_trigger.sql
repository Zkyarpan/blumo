-- Migration 2: Reusable trigger function that auto-sets updated_at on every UPDATE.
-- Referenced by trigger definitions in each subsequent table migration.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

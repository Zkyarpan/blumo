import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve("supabase/migrations/20240001000013_ai_mission_generation.sql"),
  "utf8"
).toLowerCase();
const correctiveSql = readFileSync(
  resolve(
    "supabase/migrations/20240001000014_ai_mission_generation_jsonb_fix.sql"
  ),
  "utf8"
).toLowerCase();
const allowanceSql = readFileSync(
  resolve(
    "supabase/migrations/20240001000015_ai_mission_attempt_reset.sql"
  ),
  "utf8"
).toLowerCase();
const failedUsageResetSql = readFileSync(
  resolve(
    "supabase/migrations/20240001000016_ai_mission_failed_usage_reset.sql"
  ),
  "utf8"
).toLowerCase();

describe("Unit 10 mission migration", () => {
  it("enforces one historical row per user-local date and idempotent provider calls", () => {
    expect(sql).toContain("on public.daily_tasks (user_id, scheduled_date)");
    expect(sql).toContain("daily_tasks_one_active_per_user_idx");
    expect(sql).toContain(
      "where status in ('generating', 'generated', 'in_progress', 'ready', 'committing')"
    );
    expect(sql).toContain("on public.ai_usage_records (provider_call_id)");
    expect(sql).not.toContain("delete from public.daily_tasks");
  });

  it("defines fixed-search-path atomic claim, finalize, and fail functions", () => {
    expect(sql).toContain("function public.claim_daily_mission_generation");
    expect(sql).toContain("function public.finalize_daily_mission_generation");
    expect(sql).toContain("function public.fail_daily_mission_generation");
    expect(sql.match(/security definer/g)).toHaveLength(3);
    expect(sql.match(/set search_path = public, pg_temp/g)).toHaveLength(3);
  });

  it("revokes browser execution and grants only the service role", () => {
    expect(sql.match(/from public, anon, authenticated/g)).toHaveLength(3);
    expect(sql.match(/to service_role/g)).toHaveLength(3);
    expect(sql).toContain('drop policy if exists "daily_tasks: owner insert"');
    expect(sql).toContain('drop policy if exists "daily_tasks: owner update"');
  });

  it("preserves legacy nullable mission fields while constraining versioned success", () => {
    expect(sql).toContain("prompt_version is null");
    expect(sql).toContain("daily_tasks_unit10_fields_check");
    expect(sql).toContain("generation_attempts > 0");
  });

  it("records fixed lifecycle audits and limits manual claims to three", () => {
    expect(sql).toContain("mission_generation_started");
    expect(sql).toContain("mission_generation_retried");
    expect(sql).toContain("mission_generation_succeeded");
    expect(sql).toContain("mission_generation_failed");
    expect(sql).toContain("v_task.generation_attempts >= 3");
  });

  it("replaces the unsupported JSON object length call in an ordered corrective migration", () => {
    expect(correctiveSql).toContain("from jsonb_object_keys(p_mission)");
    expect(correctiveSql).not.toContain("jsonb_object_length(");
    expect(correctiveSql).toContain("security definer");
    expect(correctiveSql).toContain("set search_path = public, pg_temp");
  });

  it("does not consume allowance when validation fails before a provider call", () => {
    expect(allowanceSql).toContain("jsonb_array_length(p_usage_records) > 0");
    expect(allowanceSql).toContain("provider_generation_attempts integer");
    expect(allowanceSql).toContain(
      "else provider_generation_attempts"
    );
    expect(allowanceSql).toContain(
      "v_task.provider_generation_attempts >= 3"
    );
    expect(allowanceSql).toContain(
      "generation_attempts = generation_attempts + 1"
    );
  });

  it("restores retry state after all failed provider usage rows are deleted locally", () => {
    expect(allowanceSql).toContain(
      "function public.reset_failed_mission_allowance_after_usage_delete"
    );
    expect(allowanceSql).toContain("after delete on public.ai_usage_records");
    expect(allowanceSql).toContain("set provider_generation_attempts = 0");
    expect(allowanceSql).toContain("status = 'failed'");
    expect(allowanceSql).toContain("set search_path = public, pg_temp");
    expect(allowanceSql).toContain("from public, anon, authenticated");
    expect(failedUsageResetSql).toContain(
      "function public.reset_failed_mission_allowance_after_usage_delete"
    );
    expect(failedUsageResetSql).toContain(
      "generation_error_code = 'unknown_provider_error'"
    );
    expect(failedUsageResetSql).toContain(
      "set search_path = public, pg_temp"
    );
  });
});

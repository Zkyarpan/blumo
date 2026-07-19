// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20240001000012_github_webhook_lifecycle.sql"
  ),
  "utf8"
);

describe("Unit 09 webhook migration contract", () => {
  it("creates a private unique delivery ledger and one audit key per delivery", () => {
    expect(migration).toContain("create table public.github_webhook_deliveries");
    expect(migration).toContain("delivery_id        text        not null unique");
    expect(migration).toContain("alter table public.github_webhook_deliveries enable row level security");
    expect(migration).toContain("revoke all on table public.github_webhook_deliveries from public, anon, authenticated");
    expect(migration).toContain("create unique index audit_logs_github_delivery_id_idx");
  });

  it("uses locked atomic claim, reclaim, conflict, and claim-version checks", () => {
    expect(migration).toContain("claim_github_webhook_delivery");
    expect(migration).toContain("for update");
    expect(migration).toContain("'in_progress'");
    expect(migration).toContain("'reclaimed'");
    expect(migration).toContain("'conflict'");
    expect(migration).toContain("attempt_count <> p_claim_version");
  });

  it("implements all installation lifecycle transitions without deleting history", () => {
    expect(migration).toContain("when 'created'");
    expect(migration).toContain("when 'deleted'");
    expect(migration).toContain("when 'suspend'");
    expect(migration).toContain("when 'unsuspend'");
    expect(migration).toContain("when 'new_permissions_accepted'");
    expect(migration).toContain("set status = 'uninstalled'");
    expect(migration).toContain("set status = 'suspended'");
    expect(migration.toLowerCase()).not.toContain("delete from public.repositories");
    expect(migration.toLowerCase()).not.toContain("delete from public.commits");
    expect(migration.toLowerCase()).not.toContain("insert into public.github_installations");
    expect(migration).toContain(
      "lower(v_installation.account_login) <> lower(p_account_login)"
    );
  });

  it("marks removed repositories inaccessible and clears selection", () => {
    expect(migration).toContain("set access_status = 'removed'");
    expect(migration).toContain("is_selected = false");
    expect(migration).toContain("github_repositories_added");
    expect(migration).toContain("github_repositories_removed");
    expect(migration).toContain("and access_status = 'unavailable'");
    expect(migration).toContain(
      "when v_installation.status = 'active' then 'active' else 'unavailable'"
    );
  });

  it("stores sanitized metadata rather than payloads, signatures, or tokens", () => {
    expect(migration).toContain("jsonb_build_object(");
    expect(migration).not.toMatch(/raw_payload\s+(text|jsonb|bytea)/i);
    expect(migration).not.toMatch(/signature\s+(text|jsonb|bytea)/i);
    expect(migration).not.toMatch(/installation_token\s+(text|jsonb|bytea)/i);
  });
});

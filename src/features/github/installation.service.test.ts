import { describe, it, expect, vi, beforeEach } from "vitest";

// Must be at the top before any imports — vitest hoists vi.mock() calls
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-anon-key",
    SUPABASE_SECRET_KEY: "test-service-key",
    GITHUB_APP_ID: "1234567",
    GITHUB_APP_SLUG: "blumo-development",
    GITHUB_APP_PRIVATE_KEY:
      "-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----\n",
    GITHUB_WEBHOOK_SECRET: undefined,
    GITHUB_APP_CLIENT_ID: undefined,
    GITHUB_APP_CLIENT_SECRET: undefined,
  },
}));
vi.mock("@/lib/github/app-auth", () => ({
  createAppOctokit: vi.fn(),
}));
vi.mock("@/lib/github/installation-lookup", () => ({
  getInstallationById: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { createAppOctokit } from "@/lib/github/app-auth";
import { getInstallationById } from "@/lib/github/installation-lookup";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processInstallationCallback } from "./installation.service";

// Typed mock references
const mockCreateAppOctokit = vi.mocked(createAppOctokit);
const mockGetInstallationById = vi.mocked(getInstallationById);
const mockCreateSupabaseAdminClient = vi.mocked(createSupabaseAdminClient);

// Reusable Supabase fluent-chain builders
function makeAdminMocks() {
  const mockMaybeSingle = vi.fn();
  const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

  const mockSingle = vi.fn();
  const mockSelectAfterUpsert = vi.fn().mockReturnValue({ single: mockSingle });
  const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectAfterUpsert });

  const mockInsert = vi.fn();

  const mockFrom = vi.fn();

  const adminClient = { from: mockFrom } as unknown as ReturnType<typeof createSupabaseAdminClient>;

  return {
    adminClient,
    mockFrom,
    mockSelect,
    mockEq,
    mockMaybeSingle,
    mockUpsert,
    mockSelectAfterUpsert,
    mockSingle,
    mockInsert,
  };
}

const VALID_INSTALLATION = {
  id: 12345,
  account: { id: 9876543, login: "testuser", type: "User" as const },
};

describe("processInstallationCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: createAppOctokit returns a dummy object
    mockCreateAppOctokit.mockReturnValue({} as ReturnType<typeof createAppOctokit>);
  });

  it("returns ok:true and upserts record for a valid matching User installation", async () => {
    mockGetInstallationById.mockResolvedValueOnce(VALID_INSTALLATION);

    const mocks = makeAdminMocks();
    mockCreateSupabaseAdminClient.mockReturnValue(mocks.adminClient);

    // 1st from() → conflict check select
    mocks.mockFrom.mockReturnValueOnce({ select: mocks.mockSelect });
    mocks.mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // 2nd from() → upsert
    mocks.mockFrom.mockReturnValueOnce({ upsert: mocks.mockUpsert });
    mocks.mockSingle.mockResolvedValueOnce({ data: { id: "uuid-row-1" }, error: null });

    // 3rd from() → audit insert
    mocks.mockFrom.mockReturnValueOnce({ insert: mocks.mockInsert });
    mocks.mockInsert.mockResolvedValueOnce({ data: null, error: null });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: true, installationRowId: "uuid-row-1" });
    expect(mocks.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        suspended_at: null,
        uninstalled_at: null,
      }),
      expect.any(Object)
    );
  });

  it("returns INVALID_INSTALLATION when GitHub API returns null (404)", async () => {
    mockGetInstallationById.mockResolvedValueOnce(null);

    const result = await processInstallationCallback(99999, "user-uuid", 9876543);

    expect(result).toEqual({ ok: false, errorCode: "INVALID_INSTALLATION" });
  });

  it("returns GITHUB_UNAVAILABLE when GitHub API throws an unexpected error", async () => {
    mockGetInstallationById.mockRejectedValueOnce(
      new Error("Unexpected GitHub API error")
    );

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: false, errorCode: "GITHUB_UNAVAILABLE" });
  });

  it("returns OWNERSHIP_MISMATCH when account.id does not match profile.github_user_id", async () => {
    mockGetInstallationById.mockResolvedValueOnce({
      id: 12345,
      account: { id: 1111111, login: "otheruser", type: "User" as const },
    });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: false, errorCode: "OWNERSHIP_MISMATCH" });
  });

  it("returns ORG_NOT_SUPPORTED when account.type is Organization", async () => {
    mockGetInstallationById.mockResolvedValueOnce({
      id: 12345,
      account: { id: 9876543, login: "myorg", type: "Organization" as const },
    });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: false, errorCode: "ORG_NOT_SUPPORTED" });
  });

  it("returns INSTALLATION_CONFLICT when installation_id already belongs to a different user", async () => {
    mockGetInstallationById.mockResolvedValueOnce(VALID_INSTALLATION);

    const mocks = makeAdminMocks();
    mockCreateSupabaseAdminClient.mockReturnValue(mocks.adminClient);

    // Existing record with a DIFFERENT user_id
    mocks.mockFrom.mockReturnValueOnce({ select: mocks.mockSelect });
    mocks.mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "uuid-row-existing", user_id: "different-user-uuid" },
      error: null,
    });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: false, errorCode: "INSTALLATION_CONFLICT" });
  });

  it("returns ok:true when same user calls callback twice (idempotent)", async () => {
    mockGetInstallationById.mockResolvedValueOnce(VALID_INSTALLATION);

    const mocks = makeAdminMocks();
    mockCreateSupabaseAdminClient.mockReturnValue(mocks.adminClient);

    // Existing record belongs to the SAME user
    mocks.mockFrom.mockReturnValueOnce({ select: mocks.mockSelect });
    mocks.mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "uuid-row-1", user_id: "user-uuid" },
      error: null,
    });

    // Upsert succeeds
    mocks.mockFrom.mockReturnValueOnce({ upsert: mocks.mockUpsert });
    mocks.mockSingle.mockResolvedValueOnce({ data: { id: "uuid-row-1" }, error: null });

    // Audit insert
    mocks.mockFrom.mockReturnValueOnce({ insert: mocks.mockInsert });
    mocks.mockInsert.mockResolvedValueOnce({ data: null, error: null });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: true, installationRowId: "uuid-row-1" });
  });

  it("returns DB_ERROR when database upsert fails", async () => {
    mockGetInstallationById.mockResolvedValueOnce(VALID_INSTALLATION);

    const mocks = makeAdminMocks();
    mockCreateSupabaseAdminClient.mockReturnValue(mocks.adminClient);

    // No conflict
    mocks.mockFrom.mockReturnValueOnce({ select: mocks.mockSelect });
    mocks.mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // Upsert fails — return error from single()
    mocks.mockFrom.mockReturnValueOnce({ upsert: mocks.mockUpsert });
    mocks.mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "DB constraint failed" },
    });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: false, errorCode: "DB_ERROR" });
  });

  it("returns DB_ERROR when conflict check query fails", async () => {
    mockGetInstallationById.mockResolvedValueOnce(VALID_INSTALLATION);

    const mocks = makeAdminMocks();
    mockCreateSupabaseAdminClient.mockReturnValue(mocks.adminClient);

    // Conflict check returns an error
    mocks.mockFrom.mockReturnValueOnce({ select: mocks.mockSelect });
    mocks.mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "DB read error" },
    });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: false, errorCode: "DB_ERROR" });
  });

  it("returns ok:true even when audit log insert fails (non-blocking)", async () => {
    mockGetInstallationById.mockResolvedValueOnce(VALID_INSTALLATION);

    const mocks = makeAdminMocks();
    mockCreateSupabaseAdminClient.mockReturnValue(mocks.adminClient);

    // No conflict
    mocks.mockFrom.mockReturnValueOnce({ select: mocks.mockSelect });
    mocks.mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // Upsert succeeds
    mocks.mockFrom.mockReturnValueOnce({ upsert: mocks.mockUpsert });
    mocks.mockSingle.mockResolvedValueOnce({ data: { id: "uuid-row-2" }, error: null });

    // Audit insert FAILS — should not affect the result
    mocks.mockFrom.mockReturnValueOnce({ insert: mocks.mockInsert });
    mocks.mockInsert.mockResolvedValueOnce({
      data: null,
      error: { message: "audit table unavailable" },
    });

    const result = await processInstallationCallback(12345, "user-uuid", 9876543);

    expect(result).toEqual({ ok: true, installationRowId: "uuid-row-2" });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/get-user", () => ({ getUser: vi.fn() }));
vi.mock("./mission-generation.service", () => ({
  generateMissionForUser: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getUser } from "@/features/auth/get-user";
import { revalidatePath } from "next/cache";
import { generateMissionForUser } from "./mission-generation.service";
import { generateMissionAction } from "./mission-generation.actions";

describe("generateMissionAction", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("authenticates before any mission work", async () => {
    vi.mocked(getUser).mockResolvedValue(null);
    const result = await generateMissionAction(null, new FormData());
    expect(result).toEqual({ ok: false, code: "unauthorized", retryable: false });
    expect(generateMissionForUser).not.toHaveBeenCalled();
  });

  it("rejects unexpected fields and trusts no client identifiers or date", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(getUser).mockResolvedValue({ id: "user-1" } as never);
    const formData = new FormData();
    formData.set("repository_id", "foreign-repository");
    formData.set("scheduled_date", "2099-01-01");
    const result = await generateMissionAction(null, formData);
    expect(result).toEqual({ ok: false, code: "invalid_request", retryable: false });
    expect(generateMissionForUser).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith("[mission-validation]", {
      stage: "action_input",
      failedFields: ["repository_id", "scheduled_date"],
      issueCodes: ["unrecognized_keys"],
      category: "unexpected_client_fields",
    });
    expect(JSON.stringify(warning.mock.calls)).not.toContain("foreign-repository");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("2099-01-01");
  });

  it("accepts framework transport fields from an otherwise empty action form", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(generateMissionForUser).mockResolvedValue({
      ok: true,
      status: "generated",
      taskId: "task-1",
    });
    const formData = new FormData();
    formData.set("$ACTION_ID_9f4c", "opaque-framework-value");

    const result = await generateMissionAction(null, formData);

    expect(generateMissionForUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({ ok: true, status: "generated", taskId: "task-1" });
  });

  it("passes only the authenticated user ID and revalidates the dashboard", async () => {
    vi.mocked(getUser).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(generateMissionForUser).mockResolvedValue({
      ok: true,
      status: "generated",
      taskId: "task-1",
    });
    const result = await generateMissionAction(null, new FormData());
    expect(generateMissionForUser).toHaveBeenCalledWith("user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result).toEqual({ ok: true, status: "generated", taskId: "task-1" });
    expect(JSON.stringify(result)).not.toContain("prompt");
    expect(JSON.stringify(result)).not.toContain("usage");
  });
});

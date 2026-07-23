import { describe, expect, it } from "vitest";
import {
  normalizeTitleSlug,
  buildBranchName,
  validateBranchName,
} from "@/lib/security/branch-name";

describe("normalizeTitleSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(normalizeTitleSlug("Practice State Transitions")).toBe(
      "practice-state-transitions"
    );
  });

  it("strips diacritics", () => {
    expect(normalizeTitleSlug("Café learning")).toBe("cafe-learning");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    expect(normalizeTitleSlug("Hello: World! Test")).toBe("hello-world-test");
  });

  it("collapses consecutive hyphens", () => {
    expect(normalizeTitleSlug("hello   world")).toBe("hello-world");
  });

  it("removes leading and trailing hyphens", () => {
    expect(normalizeTitleSlug("  Hello World  ")).toBe("hello-world");
  });

  it("truncates to 60 characters", () => {
    const long = "a".repeat(80);
    const result = normalizeTitleSlug(long);
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it("handles special characters", () => {
    const slug = normalizeTitleSlug("Build a REST API with Node.js");
    expect(slug).toBe("build-a-rest-api-with-node-js");
  });
});

describe("buildBranchName", () => {
  it("produces blumo/<date>-<slug>", () => {
    const result = buildBranchName("2026-07-20", "practice-state-transitions");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.branchName).toBe(
        "blumo/2026-07-20-practice-state-transitions"
      );
    }
  });

  it("rejects when slug is empty", () => {
    const result = buildBranchName("2026-07-20", "");
    expect(result.ok).toBe(false);
  });
});

describe("validateBranchName", () => {
  it("accepts a valid blumo/ branch", () => {
    const r = validateBranchName("blumo/2026-07-20-my-mission");
    expect(r.ok).toBe(true);
  });

  it("rejects an empty branch", () => {
    const r = validateBranchName("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("rejects branch over 250 characters", () => {
    const r = validateBranchName("blumo/" + "a".repeat(250));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_long");
  });

  it("rejects branch not starting with blumo/", () => {
    const r = validateBranchName("feature/my-branch");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_in_blumo");
  });

  it("rejects branch with invalid characters like spaces", () => {
    const r = validateBranchName("blumo/my branch");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_characters");
  });

  it("rejects branch with consecutive slashes", () => {
    const r = validateBranchName("blumo//branch");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("consecutive_slashes");
  });

  it("rejects branch ending with a hyphen", () => {
    const r = validateBranchName("blumo/my-branch-");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_start_end");
  });

  it("rejects branch ending with a slash", () => {
    const r = validateBranchName("blumo/my-branch/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_start_end");
  });

  it("accepts branch with underscore", () => {
    const r = validateBranchName("blumo/2026-07-20-my_mission");
    expect(r.ok).toBe(true);
  });
});

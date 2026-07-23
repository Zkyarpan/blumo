import { describe, expect, it } from "vitest";
import { validateSafePath, buildFilePath } from "@/lib/security/safe-path";

describe("validateSafePath", () => {
  // --- Valid paths ---
  it("accepts a valid blumo/ path", () => {
    expect(validateSafePath("blumo/2026-07-20-my-mission.md").ok).toBe(true);
  });

  it("accepts a path with subdirectory inside blumo/", () => {
    expect(validateSafePath("blumo/learning/2026-07-20-react.md").ok).toBe(true);
  });

  // --- Empty / blank ---
  it("rejects an empty path", () => {
    const r = validateSafePath("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("rejects a blank/whitespace path", () => {
    const r = validateSafePath("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  // --- Absolute ---
  it("rejects an absolute path", () => {
    const r = validateSafePath("/etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("absolute");
  });

  // --- Traversal ---
  it("rejects .. in path", () => {
    const r = validateSafePath("blumo/../etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("traversal");
  });

  it("rejects .. as segment", () => {
    const r = validateSafePath("../blumo/file.md");
    expect(r.ok).toBe(false);
  });

  // --- Null byte ---
  it("rejects null byte", () => {
    const r = validateSafePath("blumo/file\0.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("null_byte");
  });

  // --- Backslash ---
  it("rejects backslash", () => {
    const r = validateSafePath("blumo\\file.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("backslash");
  });

  // --- URL-encoded traversal ---
  it("rejects %2e%2e (url-encoded ..)", () => {
    const r = validateSafePath("blumo/%2e%2e/etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("encoded_traversal");
  });

  it("rejects %2f (url-encoded /)", () => {
    const r = validateSafePath("blumo%2fetc%2fpasswd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("encoded_traversal");
  });

  it("rejects %5c (url-encoded backslash)", () => {
    const r = validateSafePath("blumo%5cfile.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("encoded_traversal");
  });

  // --- Not in blumo/ ---
  it("rejects path not starting with blumo/", () => {
    const r = validateSafePath("src/components/Button.tsx");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_in_blumo");
  });

  // --- Blocked patterns ---
  it("rejects .env", () => {
    const r = validateSafePath("blumo/.env");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects .env.local", () => {
    const r = validateSafePath("blumo/.env.local");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects .github/**", () => {
    const r = validateSafePath(".github/workflows/deploy.yml");
    expect(r.ok).toBe(false);
  });

  it("rejects .git/**", () => {
    const r = validateSafePath(".git/config");
    expect(r.ok).toBe(false);
  });

  it("rejects node_modules/**", () => {
    const r = validateSafePath("node_modules/evil/index.js");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects credentials/**", () => {
    const r = validateSafePath("credentials/key.pem");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects secrets/**", () => {
    const r = validateSafePath("secrets/token.txt");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects keys/**", () => {
    const r = validateSafePath("keys/private.pem");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects certificates/**", () => {
    const r = validateSafePath("certificates/cert.pem");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects infrastructure/**", () => {
    const r = validateSafePath("infrastructure/terraform/main.tf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects secret/**", () => {
    const r = validateSafePath("secret/token.txt");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  it("rejects credential/**", () => {
    const r = validateSafePath("credential/creds.json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("blocked_pattern");
  });

  // --- Hidden files in blumo root ---
  it("rejects hidden file at blumo root level", () => {
    const r = validateSafePath("blumo/.hidden-file.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("hidden_root_file");
  });

  // --- Length ---
  it("rejects path over 240 characters", () => {
    const longSlug = "a".repeat(240);
    const r = validateSafePath(`blumo/${longSlug}.md`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_long");
  });

  it("accepts path exactly at 240 chars", () => {
    const slug = "a".repeat(240 - "blumo/".length - ".md".length);
    const path = `blumo/${slug}.md`;
    expect(path.length).toBe(240);
    expect(validateSafePath(path).ok).toBe(true);
  });
});

describe("buildFilePath", () => {
  it("builds the correct path from date and slug", () => {
    const path = buildFilePath("2026-07-20", "practice-state-transitions");
    expect(path).toBe("blumo/2026-07-20-practice-state-transitions.md");
  });

  it("returns null when path exceeds 240 characters", () => {
    const longSlug = "a".repeat(240);
    expect(buildFilePath("2026-07-20", longSlug)).toBeNull();
  });
});

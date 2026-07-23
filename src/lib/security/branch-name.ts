/**
 * Server-side branch-name normalization and validation for blumo/ branches.
 * Pure function — no I/O, no database access, no GitHub calls.
 */

const MAX_BRANCH_LENGTH = 250;

export type BranchNameResult =
  | { ok: true; branchName: string }
  | { ok: false; reason: BranchNameRejection };

export type BranchNameRejection =
  | "empty"
  | "too_long"
  | "invalid_characters"
  | "consecutive_slashes"
  | "bad_start_end"
  | "not_in_blumo";

/**
 * Normalizes a mission title into a URL-safe slug:
 * - Unicode NFC normalize
 * - Lowercase
 * - Strip diacritics (NFD + remove combining marks)
 * - Replace non-alphanumeric (except hyphens) with hyphens
 * - Collapse consecutive hyphens
 * - Remove leading/trailing hyphens
 * - Truncate to 60 characters
 */
export function normalizeTitleSlug(title: string): string {
  // NFC normalize then NFD to separate diacritics
  const nfd = title.normalize("NFD");
  // Remove combining diacritical marks (U+0300–U+036F)
  const stripped = nfd.replace(/[\u0300-\u036f]/g, "");
  // Lowercase
  const lowered = stripped.toLowerCase();
  // Replace anything not alphanumeric or hyphen with a hyphen
  const hyphenated = lowered.replace(/[^a-z0-9-]/g, "-");
  // Collapse consecutive hyphens
  const collapsed = hyphenated.replace(/-+/g, "-");
  // Remove leading/trailing hyphens
  const trimmed = collapsed.replace(/^-+|-+$/g, "");
  // Truncate to 60 chars
  return trimmed.slice(0, 60);
}

/**
 * Builds and validates a mission branch name.
 * Returns ok:true with the branch name if valid.
 *
 * The branch name format is: blumo/<YYYY-MM-DD>-<normalized-title>
 */
export function buildBranchName(
  scheduledDate: string,
  titleSlug: string
): BranchNameResult {
  if (!titleSlug) {
    return { ok: false, reason: "empty" };
  }

  const branch = `blumo/${scheduledDate}-${titleSlug}`;
  return validateBranchName(branch);
}

/**
 * Validates that a branch name meets the blumo/ branch rules.
 */
export function validateBranchName(branch: string): BranchNameResult {
  if (!branch || branch.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (branch.length > MAX_BRANCH_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  if (!branch.startsWith("blumo/")) {
    return { ok: false, reason: "not_in_blumo" };
  }

  // Only alphanumeric, hyphens, forward slashes, underscores
  if (!/^[a-zA-Z0-9/_-]+$/.test(branch)) {
    return { ok: false, reason: "invalid_characters" };
  }

  // No consecutive slashes
  if (branch.includes("//")) {
    return { ok: false, reason: "consecutive_slashes" };
  }

  // Must not begin or end with slash or hyphen
  if (
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.startsWith("-") ||
    branch.endsWith("-")
  ) {
    return { ok: false, reason: "bad_start_end" };
  }

  return { ok: true, branchName: branch };
}

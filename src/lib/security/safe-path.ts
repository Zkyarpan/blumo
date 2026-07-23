/**
 * Server-side safe-path validation for the blumo/** directory.
 * Pure function — no I/O, no database access, no GitHub calls.
 * Must be called on the server-computed path immediately before any GitHub API call.
 */

/** Maximum allowed path length in characters. */
const MAX_PATH_LENGTH = 240;

/** Paths that match any of these blocked prefixes/patterns are rejected. */
const BLOCKED_PREFIXES = [
  ".git/",
  ".github/",
  "node_modules/",
  "credentials/",
  "credential/",
  "secrets/",
  "secret/",
  "keys/",
  "key/",
  "certificates/",
  "infrastructure/",
];

/** Exact blocked filenames (with or without extensions). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const BLOCKED_EXACT = [".env"];
const BLOCKED_PREFIX_DOT_ENV = ".env.";

/** URL-encoded traversal sequences to reject (after lower-casing). */
const ENCODED_TRAVERSAL = ["%2e%2e", "%2f", "%5c", "%00", "%2F", "%5C", "%00"];

export type SafePathResult =
  | { ok: true }
  | { ok: false; reason: SafePathRejection };

export type SafePathRejection =
  | "empty"
  | "absolute"
  | "traversal"
  | "null_byte"
  | "backslash"
  | "encoded_traversal"
  | "not_in_blumo"
  | "blocked_pattern"
  | "hidden_root_file"
  | "too_long";

/**
 * Validates a server-computed file path against the safe-path rules defined
 * in context/security-model.md. Returns ok:true if the path is safe to use.
 *
 * Never trust a client-submitted path. Always recompute server-side and
 * validate the recomputed result with this function.
 */
export function validateSafePath(path: string): SafePathResult {
  if (!path || path.trim().length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (path.length > MAX_PATH_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  // Reject absolute paths
  if (path.startsWith("/") || path.startsWith("\\")) {
    return { ok: false, reason: "absolute" };
  }

  // Reject backslashes
  if (path.includes("\\")) {
    return { ok: false, reason: "backslash" };
  }

  // Reject null bytes
  if (path.includes("\0")) {
    return { ok: false, reason: "null_byte" };
  }

  // Reject URL-encoded traversal sequences (check lowercased)
  const lower = path.toLowerCase();
  for (const seq of ENCODED_TRAVERSAL) {
    if (lower.includes(seq.toLowerCase())) {
      return { ok: false, reason: "encoded_traversal" };
    }
  }

  // Reject .. in any path segment
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === "..") {
      return { ok: false, reason: "traversal" };
    }
  }

  // Check blocked prefixes (these apply to the full path, regardless of blumo/ prefix)
  for (const prefix of BLOCKED_PREFIXES) {
    if (path === prefix.slice(0, -1) || path.startsWith(prefix)) {
      return { ok: false, reason: "blocked_pattern" };
    }
  }

  // Reject .env and .env.* — checked before not_in_blumo to surface the right reason
  // when someone passes e.g. ".env.local" directly
  if (
    path === ".env" ||
    path.startsWith(BLOCKED_PREFIX_DOT_ENV)
  ) {
    return { ok: false, reason: "blocked_pattern" };
  }

  // Must begin with blumo/
  if (!path.startsWith("blumo/")) {
    return { ok: false, reason: "not_in_blumo" };
  }

  // Reject .env and .env.* relative to blumo/
  const relativePart = path.slice("blumo/".length);
  if (
    relativePart === ".env" ||
    relativePart.startsWith(BLOCKED_PREFIX_DOT_ENV)
  ) {
    return { ok: false, reason: "blocked_pattern" };
  }

  // Reject hidden files at top-level relative part (starts with .)
  const firstName = segments[1]; // after "blumo"
  if (firstName && firstName.startsWith(".")) {
    return { ok: false, reason: "hidden_root_file" };
  }

  return { ok: true };
}

/**
 * Constructs the safe file path from a scheduled date and a normalized title slug.
 * Returns null if the constructed path exceeds 240 characters.
 */
export function buildFilePath(
  scheduledDate: string,
  titleSlug: string
): string | null {
  const path = `blumo/${scheduledDate}-${titleSlug}.md`;
  if (path.length > MAX_PATH_LENGTH) return null;
  return path;
}

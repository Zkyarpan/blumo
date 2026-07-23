/**
 * Server-side Markdown content formatter for approved mission commits.
 * Pure function — no I/O, no database access, no GitHub calls.
 * All fields come from the approved mission_versions snapshot.
 */

const MAX_CONTENT_BYTES = 10 * 1024; // 10 KB

export interface MissionSnapshot {
  title: string;
  description: string;
  acceptanceChecklist: string[];
  learningOutcome: string;
  scheduledDate: string;
  aiProvider: string;
}

export type FormatResult =
  | { ok: true; content: string }
  | { ok: false; reason: "content_too_large" };

/**
 * Escapes a string for safe inclusion as Markdown text.
 * Prevents any embedded Markdown syntax from being interpreted as structure.
 * Does not produce HTML — only escapes characters that could break the
 * surrounding Markdown document.
 */
function escapeMarkdown(text: string): string {
  // Escape characters that have special meaning in Markdown
  return text
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;")
    .replace(/\|/g, "\\|")
    .replace(/#/g, "\\#");
}

/**
 * Assembles the mission Markdown document from validated mission fields.
 *
 * Format (exactly as specified):
 *
 * # <title>
 *
 * > AI-generated mission · <scheduled_date> · <ai_provider>
 *
 * ## What you will do
 *
 * <description>
 *
 * ## Acceptance checklist
 *
 * - <item 1>
 * - <item 2>
 * ...
 *
 * ## Learning outcome
 *
 * <learning_outcome>
 */
export function formatMissionContent(snapshot: MissionSnapshot): FormatResult {
  const titleLine = `# ${escapeMarkdown(snapshot.title)}`;
  const tagline = `> AI-generated mission · ${snapshot.scheduledDate} · ${escapeMarkdown(snapshot.aiProvider)}`;
  const descSection = `## What you will do\n\n${escapeMarkdown(snapshot.description)}`;
  const checklistItems = snapshot.acceptanceChecklist
    .map((item) => `- ${escapeMarkdown(item)}`)
    .join("\n");
  const checklistSection = `## Acceptance checklist\n\n${checklistItems}`;
  const outcomeSection = `## Learning outcome\n\n${escapeMarkdown(snapshot.learningOutcome)}`;

  const content = [
    titleLine,
    "",
    tagline,
    "",
    descSection,
    "",
    checklistSection,
    "",
    outcomeSection,
  ].join("\n");

  // Enforce 10 KB limit
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_CONTENT_BYTES) {
    return { ok: false, reason: "content_too_large" };
  }

  return { ok: true, content };
}

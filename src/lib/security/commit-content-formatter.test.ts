import { describe, expect, it } from "vitest";
import { formatMissionContent } from "@/lib/security/commit-content-formatter";
import type { MissionSnapshot } from "@/lib/security/commit-content-formatter";

const baseSnapshot: MissionSnapshot = {
  title: "Practice State Transitions",
  description: "A focused exercise on understanding state change.",
  acceptanceChecklist: [
    "Identify two state transitions",
    "Describe each clearly in writing",
  ],
  learningOutcome: "Explain predictable state transitions using a focused example.",
  scheduledDate: "2026-07-20",
  aiProvider: "pollinations",
};

describe("formatMissionContent", () => {
  it("produces a Markdown document with all required sections", () => {
    const result = formatMissionContent(baseSnapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { content } = result;
    expect(content).toContain("# Practice State Transitions");
    expect(content).toContain("AI-generated mission");
    expect(content).toContain("2026-07-20");
    expect(content).toContain("pollinations");
    expect(content).toContain("## What you will do");
    expect(content).toContain("A focused exercise on understanding state change.");
    expect(content).toContain("## Acceptance checklist");
    expect(content).toContain("- Identify two state transitions");
    expect(content).toContain("- Describe each clearly in writing");
    expect(content).toContain("## Learning outcome");
    expect(content).toContain(
      "Explain predictable state transitions using a focused example."
    );
  });

  it("does not contain raw HTML in the output", () => {
    const snapshot: MissionSnapshot = {
      ...baseSnapshot,
      title: '<script>alert("xss")</script>Title',
      description: "<b>bold</b> description",
    };
    const result = formatMissionContent(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).not.toContain("<script>");
    expect(result.content).not.toContain("<b>");
  });

  it("escapes Markdown special characters in title", () => {
    const snapshot: MissionSnapshot = {
      ...baseSnapshot,
      title: "# Heading in Title",
    };
    const result = formatMissionContent(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Title is in h1 position — the # in title itself should be escaped
    // The output has `# <escaped_title>` — the inner # should be escaped
    expect(result.content).toContain("\\#");
  });

  it("does not add repository paths, filenames, or commands", () => {
    const result = formatMissionContent(baseSnapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Should not contain file paths like src/ or npm commands
    expect(result.content).not.toMatch(/^src\//m);
    expect(result.content).not.toContain("npm");
    expect(result.content).not.toContain("git commit");
  });

  it("returns content_too_large for oversized content", () => {
    const bigSnapshot: MissionSnapshot = {
      ...baseSnapshot,
      description: "x".repeat(8000),
      learningOutcome: "y".repeat(4000),
    };
    const result = formatMissionContent(bigSnapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("content_too_large");
  });

  it("formats checklist items with - prefix", () => {
    const result = formatMissionContent(baseSnapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("- Identify two state transitions");
  });
});

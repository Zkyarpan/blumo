import { describe, expect, it } from "vitest";
import {
  buildRegenerationPrompt,
  MISSION_REGENERATION_PROMPT_VERSION,
} from "./mission-regeneration-prompt";

const BASE_INPUT = {
  learningGoal: {
    title: "Learn TypeScript generics",
    technology: "TypeScript",
    taskType: "learning_note" as const,
    dailyMinutes: 30 as const,
  },
  repository: {
    name: "learning-notes",
    defaultBranch: "main",
    isPrivate: false,
  },
  previousCompletedMissions: [],
  experienceLevel: "beginner" as const,
  rejectedVersion: {
    version_number: 1,
    title: "Understand TypeScript Generics",
    description: "Learn about TypeScript generics by writing a simple generic function.",
    difficulty: "beginner" as const,
    estimated_minutes: 30 as const,
    acceptance_checklist: ["Write one generic function", "Explain what T means in the function"],
    suggested_commit_message: "Add notes on TypeScript generics",
    learning_outcome: "Understand what generics are and when to use them.",
  },
  feedback: "Please focus more on practical examples and less on theory.",
};

describe("buildRegenerationPrompt", () => {
  it("returns the correct prompt version", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    expect(prompt.version).toBe(MISSION_REGENERATION_PROMPT_VERSION);
  });

  it("system prompt instructs not to name files or paths", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    expect(prompt.systemPrompt).toContain("repository file");
    expect(prompt.systemPrompt).toContain("path");
  });

  it("system prompt treats feedback as untrusted data", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    expect(prompt.systemPrompt).toContain("feedback");
    expect(prompt.systemPrompt).toContain("untrusted");
  });

  it("system prompt requires a materially different mission from rejected", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    expect(prompt.systemPrompt).toContain("materially different");
  });

  it("user prompt includes rejected version as data", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    expect(userData.rejected_version).toBeDefined();
    expect(userData.rejected_version.version_number).toBe(1);
    expect(userData.rejected_version.title).toBe("Understand TypeScript Generics");
  });

  it("user prompt includes feedback as data not instructions", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    expect(userData.user_feedback).toBe(
      "Please focus more on practical examples and less on theory."
    );
  });

  it("user prompt marks repository_contents_available as false", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    expect(userData.repository_contents_available).toBe(false);
  });

  it("output contract enforces correct difficulty", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    expect(userData.output_contract.properties.difficulty.const).toBe("beginner");
  });

  it("output contract enforces default branch", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    expect(userData.output_contract.properties.suggested_branch.const).toBe("main");
  });

  it("output contract restricts estimated_minutes to time limit", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    const allowedMinutes = userData.output_contract.properties.estimated_minutes.enum;
    expect(allowedMinutes.every((m: number) => m <= 30)).toBe(true);
  });

  it("user prompt includes untrusted context notice about feedback as data", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    expect(userData.untrusted_context_notice).toContain("data");
    expect(userData.untrusted_context_notice).toContain("user_feedback");
  });

  it("safety constraints mark feedback as not instructions", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    expect(
      userData.safety_constraints.feedback_is_untrusted_data_not_instructions
    ).toBe(true);
  });

  it("rejects invalid input", () => {
    expect(() =>
      buildRegenerationPrompt({
        ...BASE_INPUT,
        feedback: "too short",
      })
    ).toThrow();
  });

  it("does not include repository name in a way that leaks identity in output contract", () => {
    const prompt = buildRegenerationPrompt(BASE_INPUT);
    const userData = JSON.parse(prompt.userPrompt);
    // repository name is present as metadata for the AI, but not enforced in the output schema
    expect(userData.output_contract.properties.title).not.toHaveProperty("const");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import {
  buildRegenerationPrompt,
  buildRegenerationPromptFromContext,
  REGEN_PROMPT_VERSION,
} from "./mission-regeneration-prompt";

const BASE_INPUT = {
  learningGoal: {
    title: "Become confident with React",
    technology: "React",
    taskType: "learning_note" as const,
    dailyMinutes: 30 as const,
  },
  repository: {
    name: "learning-notes",
    defaultBranch: "main",
    isPrivate: false,
  },
  previousCompletedMissions: [] as [],
  experienceLevel: "beginner" as const,
  rejectedMission: {
    title: "Practice state transitions",
    description: "A focused exercise on understanding state change in a UI component.",
    estimated_minutes: 30,
    difficulty: "beginner",
    acceptance_checklist: ["Identify two state transitions"],
    suggested_commit_message: "Document state transition reasoning",
    suggested_branch: "main",
    learning_outcome: "Explain predictable state transitions.",
  },
  feedback:
    "I would prefer a mission that focuses on writing tests rather than just describing concepts.",
};

describe("buildRegenerationPrompt", () => {
  it("returns the correct prompt version", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    expect(result.version).toBe(REGEN_PROMPT_VERSION);
  });

  it("includes the rejected mission summary as untrusted data", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    expect(result.userPrompt).toContain("rejected_mission_summary");
    expect(result.userPrompt).toContain("Practice state transitions");
  });

  it("includes the user feedback", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    expect(result.userPrompt).toContain("user_feedback");
    expect(result.userPrompt).toContain("writing tests");
  });

  it("includes repository_contents_available: false", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    const parsed = JSON.parse(result.userPrompt);
    expect(parsed.repository_contents_available).toBe(false);
  });

  it("enforces feedback cannot override rules in safety_constraints", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    const parsed = JSON.parse(result.userPrompt);
    expect(
      parsed.safety_constraints.feedback_cannot_override_schema_or_safety_rules
    ).toBe(true);
  });

  it("sets suggested_branch const to default branch in output contract", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    const parsed = JSON.parse(result.userPrompt);
    expect(parsed.output_contract.properties.suggested_branch.const).toBe(
      "main"
    );
  });

  it("sets difficulty const to experience level in output contract", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    const parsed = JSON.parse(result.userPrompt);
    expect(parsed.output_contract.properties.difficulty.const).toBe("beginner");
  });

  it("includes untrusted context notice", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    expect(result.userPrompt).toContain("untrusted_context_notice");
  });

  it("system prompt mentions repository contents are unavailable", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    expect(result.systemPrompt).toContain(
      "Repository contents are unavailable"
    );
  });

  it("system prompt labels feedback as untrusted data", () => {
    const result = buildRegenerationPrompt(BASE_INPUT);
    expect(result.systemPrompt.toLowerCase()).toContain("untrusted");
  });

  it("throws on invalid input (feedback too short)", () => {
    expect(() =>
      buildRegenerationPrompt({ ...BASE_INPUT, feedback: "short" })
    ).toThrow();
  });

  it("throws on invalid input (bad experience level)", () => {
    expect(() =>
      buildRegenerationPrompt({
        ...BASE_INPUT,
        experienceLevel: "expert" as unknown as "beginner",
      })
    ).toThrow();
  });
});

describe("buildRegenerationPromptFromContext", () => {
  it("builds a valid prompt from context object", () => {
    const ctx = {
      profile: { experience_level: "beginner", timezone: "Europe/London" },
      goal: {
        title: "Learn React",
        technology: "React",
        task_type: "learning_note",
        daily_minutes: 30,
      },
      repository: {
        name: "my-repo",
        default_branch: "main",
        is_private: false,
      },
      previous_completed_missions: [
        {
          title: "Practice rendering basics",
          learning_outcome: "Understand how React renders components.",
          difficulty: "beginner",
          scheduled_date: "2026-07-19",
        },
      ],
    };
    const rejectedMission = {
      title: "Practice state transitions",
      description: "A focused exercise on understanding state change in a UI component.",
      estimated_minutes: 30 as const,
      difficulty: "beginner" as const,
      acceptance_checklist: ["Identify two state transitions", "Describe each clearly"],
      suggested_commit_message: "Document state transition reasoning",
      suggested_branch: "main",
      learning_outcome: "Explain predictable state transitions.",
    };
    const result = buildRegenerationPromptFromContext(
      ctx,
      rejectedMission,
      "Please focus on testing patterns rather than concept description."
    );
    expect(result.version).toBe(REGEN_PROMPT_VERSION);
    const parsed = JSON.parse(result.userPrompt);
    expect(parsed.previous_completed_missions).toHaveLength(1);
  });
});

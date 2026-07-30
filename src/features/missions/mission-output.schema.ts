import { z } from "zod";
import {
  EXPERIENCE_LEVELS,
  type DailyMinutes,
  type ExperienceLevel,
} from "@/features/onboarding/onboarding.schema";
import { validateMissionTextSafety } from "./mission-safety";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";

const trimmedText = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

export const missionOutputSchema = z
  .object({
    title: trimmedText(5, 100),
    description: trimmedText(20, 500),
    estimated_minutes: z.union([
      z.literal(10),
      z.literal(20),
      z.literal(30),
      z.literal(45),
      z.literal(60),
    ]),
    difficulty: z.enum(EXPERIENCE_LEVELS),
    acceptance_checklist: z.array(trimmedText(5, 160)).min(2).max(6),
    suggested_commit_message: trimmedText(5, 100),
    suggested_branch: trimmedText(1, 255),
    learning_outcome: trimmedText(10, 300),
  })
  .strip(); // strip unknown fields from AI output instead of failing on them

export type MissionOutput = z.infer<typeof missionOutputSchema>;

export type MissionValidationResult =
  | { ok: true; mission: MissionOutput }
  | { ok: false; code: "invalid_response" | "unsafe_response" };

const IMPERATIVE_VERBS = new Set([
  "add",
  "analyze",
  "build",
  "compare",
  "create",
  "design",
  "document",
  "explain",
  "explore",
  "implement",
  "improve",
  "learn",
  "practice",
  "refactor",
  "review",
  "test",
  "update",
  "validate",
  "write",
]);

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

export function validateMissionOutput(
  raw: unknown,
  context: {
    dailyMinutes: DailyMinutes;
    experienceLevel: ExperienceLevel;
    defaultBranch: string;
  }
): MissionValidationResult {
  let candidate = raw;
  if (typeof raw === "string") {
    try {
      candidate = JSON.parse(raw);
    } catch {
      logSafeValidationFailure({
        stage: "provider_content_json",
        failedFields: ["content"],
        issueCodes: ["custom"],
        category: "malformed_ai_json",
      });
      return { ok: false, code: "invalid_response" };
    }
  }

  const parsed = missionOutputSchema.safeParse(candidate);
  if (!parsed.success) {
    logSafeValidationFailure({
      stage: "mission_output_schema",
      ...summarizeZodIssues(parsed.error.issues),
      category: "invalid_ai_mission_shape",
    });
    return { ok: false, code: "invalid_response" };
  }

  const mission = parsed.data;
  const textFields = [
    mission.title,
    mission.description,
    ...mission.acceptance_checklist,
    mission.suggested_commit_message,
    mission.learning_outcome,
  ];

  const domainFailures: string[] = [];
  if (mission.estimated_minutes > context.dailyMinutes) {
    domainFailures.push("estimated_minutes");
  }
  if (mission.difficulty !== context.experienceLevel) {
    domainFailures.push("difficulty");
  }
  if (mission.suggested_branch !== context.defaultBranch) {
    domainFailures.push("suggested_branch");
  }
  if (
    mission.suggested_commit_message.includes("\n") ||
    !IMPERATIVE_VERBS.has(
      mission.suggested_commit_message.split(/\s+/u)[0].toLocaleLowerCase("en-US")
    )
  ) {
    domainFailures.push("suggested_commit_message");
  }
  if (
    textFields.some(
      (value) => hasControlCharacter(value) || /<\/?[a-z][^>]*>/iu.test(value)
    )
  ) {
    domainFailures.push("mission_text");
  }

  if (domainFailures.length > 0) {
    logSafeValidationFailure({
      stage: "mission_output_domain",
      failedFields: domainFailures,
      issueCodes: ["custom"],
      category: "mission_domain_mismatch",
    });
    return { ok: false, code: "invalid_response" };
  }

  const normalizedChecklist = mission.acceptance_checklist.map((item) =>
    item.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")
  );
  if (new Set(normalizedChecklist).size !== normalizedChecklist.length) {
    logSafeValidationFailure({
      stage: "mission_output_domain",
      failedFields: ["acceptance_checklist"],
      issueCodes: ["custom"],
      category: "duplicate_checklist_items",
    });
    return { ok: false, code: "invalid_response" };
  }

  const safety = validateMissionTextSafety(textFields);
  const branchSafety = validateMissionTextSafety([mission.suggested_branch], {
    checkPaths: false,
  });
  if (!safety.safe || !branchSafety.safe) {
    logSafeValidationFailure({
      stage: "mission_output_domain",
      failedFields: [safety.safe ? "suggested_branch" : "mission_text"],
      issueCodes: ["custom"],
      category: "unsafe_ai_mission",
    });
    return { ok: false, code: "unsafe_response" };
  }

  if (Buffer.byteLength(JSON.stringify(mission), "utf8") > 12 * 1024) {
    logSafeValidationFailure({
      stage: "mission_output_domain",
      failedFields: ["mission"],
      issueCodes: ["too_big"],
      category: "mission_size_limit",
    });
    return { ok: false, code: "invalid_response" };
  }

  return { ok: true, mission };
}

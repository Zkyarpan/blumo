import { z } from "zod";
import { validateMissionTextSafety } from "./mission-safety";
import { logSafeValidationFailure, summarizeZodIssues } from "@/lib/validation/safe-validation-diagnostics";

/** Validates the approve action input from the browser. */
export const approveActionInputSchema = z
  .object({
    taskId: z.string().uuid(),
    expectedVersionNumber: z.coerce.number().int().positive(),
  })
  .strict();

export type ApproveActionInput = z.infer<typeof approveActionInputSchema>;

/**
 * Validates the optional plain-text rejection reason.
 * Returns { ok: true, reason } or { ok: false, error }.
 */
export function validateRejectionReason(raw: unknown): {
  ok: true;
  reason: string | null;
} | {
  ok: false;
  error: string;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, reason: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "Reason must be text." };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, reason: null };
  }
  if (trimmed.length < 3) {
    return { ok: false, error: "Reason must be at least 3 characters." };
  }
  if (trimmed.length > 500) {
    return { ok: false, error: "Reason must be 500 characters or fewer." };
  }
  // No HTML tags
  if (/<\/?[a-z][^>]*>/iu.test(trimmed)) {
    return { ok: false, error: "Reason must be plain text." };
  }
  // No control characters
  if (Array.from(trimmed).some((c) => { const n = c.codePointAt(0) ?? 0; return n < 32 || n === 127; })) {
    return { ok: false, error: "Reason contains invalid characters." };
  }
  // Normalize
  const normalized = trimmed.normalize("NFC");
  // Safety check
  const safety = validateMissionTextSafety([normalized], { checkPaths: false });
  if (!safety.safe) {
    return { ok: false, error: "Reason contains prohibited content." };
  }
  return { ok: true, reason: normalized };
}

/** Validates the required plain-text regeneration feedback. */
export function validateRegenerationFeedback(raw: unknown): {
  ok: true;
  feedback: string;
} | {
  ok: false;
  error: string;
} {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Feedback is required." };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 10) {
    return { ok: false, error: "Feedback must be at least 10 characters." };
  }
  if (trimmed.length > 500) {
    return { ok: false, error: "Feedback must be 500 characters or fewer." };
  }
  if (/<\/?[a-z][^>]*>/iu.test(trimmed)) {
    return { ok: false, error: "Feedback must be plain text." };
  }
  if (Array.from(trimmed).some((c) => { const n = c.codePointAt(0) ?? 0; return n < 32 || n === 127; })) {
    return { ok: false, error: "Feedback contains invalid characters." };
  }
  const normalized = trimmed.normalize("NFC");
  // Full safety check for feedback (same rules as mission safety + path checks)
  const safety = validateMissionTextSafety([normalized], { checkPaths: true });
  if (!safety.safe) {
    logSafeValidationFailure({
      stage: "action_input",
      failedFields: ["feedback"],
      issueCodes: ["custom"],
      category: `unsafe_regeneration_feedback_${safety.reason}`,
    });
    return { ok: false, error: "Feedback contains prohibited content." };
  }
  // Additional feedback-specific checks
  // No attempts to select repository, provider, model, or endpoint
  const lower = normalized.toLocaleLowerCase("en-US");
  if (
    /\b(?:use|select|switch|change)\b.{0,30}\b(?:repository|repo|provider|model|endpoint|api|user)\b/u.test(lower)
  ) {
    logSafeValidationFailure({
      stage: "action_input",
      failedFields: ["feedback"],
      issueCodes: ["custom"],
      category: "unsafe_regeneration_feedback_selection_attempt",
    });
    return { ok: false, error: "Feedback contains prohibited content." };
  }
  return { ok: true, feedback: normalized };
}

/** Validates the reject action input from the browser. */
export const rejectActionInputSchema = z
  .object({
    taskId: z.string().uuid(),
    expectedVersionNumber: z.coerce.number().int().positive(),
    reason: z.string().optional().default(""),
  })
  .strict();

export type RejectActionInput = z.infer<typeof rejectActionInputSchema>;

/** Validates the regenerate action input from the browser. */
export const regenerateActionInputSchema = z
  .object({
    taskId: z.string().uuid(),
    expectedVersionNumber: z.coerce.number().int().positive(),
    feedback: z.string(),
  })
  .strict();

export type RegenerateActionInput = z.infer<typeof regenerateActionInputSchema>;

/** Validates raw form data, filtering Next.js transport fields. Returns parsed input or null. */
export function parseActionFormData<T>(
  formData: FormData,
  schema: z.ZodSchema<T>
): { ok: true; data: T } | { ok: false } {
  const rawEntries = Array.from(formData.entries()).filter(
    ([key]) => !key.startsWith("$ACTION_")
  );
  const raw = Object.fromEntries(rawEntries.map(([k, v]) => [k, v]));
  const result = schema.safeParse(raw);
  if (!result.success) {
    logSafeValidationFailure({
      stage: "action_input",
      ...summarizeZodIssues(result.error.issues),
      category: "invalid_review_action_input",
    });
    return { ok: false };
  }
  return { ok: true, data: result.data };
}

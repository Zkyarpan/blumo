import { z } from "zod";
import { validateMissionTextSafety } from "./mission-safety";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** UUID validator used for task and version IDs from the client. */
export const uuidSchema = z.string().uuid();

// --------------------------------------------------------------------------
// Rejection reason
// --------------------------------------------------------------------------

const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/u;
const HTML_TAG_RE = /<\/?[a-z][^>]*>/iu;
const SECRET_PATTERN_RE =
  /(?:api[_-]?key|access[_-]?token|private[_-]?key|password|secret|bearer)\s*[:=]\s*\S+/iu;

function validateUserText(value: string): boolean {
  const normalized = value.normalize("NFC").trim();
  if (CONTROL_CHAR_RE.test(normalized)) return false;
  if (HTML_TAG_RE.test(normalized)) return false;
  if (SECRET_PATTERN_RE.test(normalized)) return false;
  const safety = validateMissionTextSafety([normalized]);
  return safety.safe;
}

export const rejectionReasonSchema = z
  .string()
  .transform((v) => {
    const trimmed = v.normalize("NFC").trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .pipe(
    z
      .string()
      .min(3, "Reason must be at least 3 characters")
      .max(500, "Reason must be at most 500 characters")
      .refine(
        (v) => !CONTROL_CHAR_RE.test(v),
        "Reason contains invalid characters"
      )
      .refine((v) => !HTML_TAG_RE.test(v), "Reason must be plain text")
      .refine(
        (v) => !SECRET_PATTERN_RE.test(v),
        "Reason must not contain secrets"
      )
      .refine(
        (v) => validateUserText(v),
        "Reason contains disallowed content"
      )
      .nullable()
  );

// --------------------------------------------------------------------------
// Regeneration feedback
// --------------------------------------------------------------------------

export const feedbackSchema = z
  .string()
  .transform((v) => v.normalize("NFC").trim())
  .pipe(
    z
      .string()
      .min(10, "Feedback must be at least 10 characters")
      .max(500, "Feedback must be at most 500 characters")
      .refine(
        (v) => !CONTROL_CHAR_RE.test(v),
        "Feedback contains invalid characters"
      )
      .refine((v) => !HTML_TAG_RE.test(v), "Feedback must be plain text")
      .refine(
        (v) => !SECRET_PATTERN_RE.test(v),
        "Feedback must not contain secrets"
      )
      .refine(
        (v) => validateUserText(v),
        "Feedback contains disallowed content"
      )
  );

// --------------------------------------------------------------------------
// Server Action input schemas
// --------------------------------------------------------------------------

export const approveActionSchema = z
  .object({
    taskId: uuidSchema,
    versionId: uuidSchema,
  })
  .strict();

export const rejectActionSchema = z
  .object({
    taskId: uuidSchema,
    versionId: uuidSchema,
    reason: z.string().default(""),
  })
  .strict();

export const regenerateActionSchema = z
  .object({
    taskId: uuidSchema,
    sourceVersionId: uuidSchema,
    feedback: z.string(),
  })
  .strict();

export type ApproveActionSchema = z.infer<typeof approveActionSchema>;
export type RejectActionSchema = z.infer<typeof rejectActionSchema>;
export type RegenerateActionSchema = z.infer<typeof regenerateActionSchema>;

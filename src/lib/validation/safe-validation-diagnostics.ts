import type { ZodIssue } from "zod";

export type ValidationStage =
  | "action_input"
  | "approve_action_input"
  | "reject_action_input"
  | "regenerate_action_input"
  | "profile_context"
  | "goal_context"
  | "repository_context"
  | "mission_history_context"
  | "claim_result"
  | "claim_context"
  | "prompt_input"
  | "regeneration_prompt_input"
  | "provider_configuration"
  | "provider_envelope"
  | "provider_content_json"
  | "mission_output_schema"
  | "mission_output_domain"
  | "mission_persistence";

interface SafeValidationDiagnostic {
  stage: ValidationStage;
  failedFields: string[];
  issueCodes: string[];
  category: string;
}

function sanitizeName(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_$.[\]-]/gu, "_").slice(0, 64);
  return sanitized || "unknown_field";
}

export function summarizeZodIssues(issues: ZodIssue[]): {
  failedFields: string[];
  issueCodes: string[];
} {
  const failedFields = new Set<string>();
  const issueCodes = new Set<string>();

  for (const issue of issues) {
    issueCodes.add(issue.code);
    if (issue.path.length > 0) {
      failedFields.add(sanitizeName(issue.path.map(String).join(".")));
    }
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) failedFields.add(sanitizeName(key));
    }
  }

  return {
    failedFields: Array.from(failedFields).slice(0, 20),
    issueCodes: Array.from(issueCodes).slice(0, 10),
  };
}

/** Logs validation structure only. Values, prompts, responses, and IDs are absent. */
export function logSafeValidationFailure(
  diagnostic: SafeValidationDiagnostic
): void {
  console.warn("[mission-validation]", {
    stage: diagnostic.stage,
    failedFields: diagnostic.failedFields.map(sanitizeName).slice(0, 20),
    issueCodes: diagnostic.issueCodes.map(sanitizeName).slice(0, 10),
    category: sanitizeName(diagnostic.category),
  });
}

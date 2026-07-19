import "server-only";

import { z } from "zod";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";
import { AIProviderError } from "../ai-provider.errors";

export const POLLINATIONS_TEXT_ENDPOINT =
  "https://gen.pollinations.ai/v1/chat/completions";

const pollinationsConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(100).default("openai"),
});

export interface PollinationsConfig {
  apiKey: string;
  model: string;
}

export function getPollinationsConfig(): PollinationsConfig {
  const result = pollinationsConfigSchema.safeParse({
    apiKey: process.env.POLLINATIONS_API_KEY,
    model: process.env.POLLINATIONS_TEXT_MODEL || "openai",
  });

  if (!result.success) {
    logSafeValidationFailure({
      stage: "provider_configuration",
      ...summarizeZodIssues(result.error.issues),
      category: "configuration_error",
    });
    throw new AIProviderError({
      code: "configuration_error",
      retrySafe: false,
      providerId: "pollinations",
    });
  }

  return result.data;
}

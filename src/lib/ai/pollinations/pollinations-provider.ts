import "server-only";

import type { AIProvider } from "../ai-provider";
import { AIProviderError } from "../ai-provider.errors";
import type {
  ProviderMissionRequest,
  ProviderMissionResult,
} from "../ai-provider.types";
import {
  logSafeValidationFailure,
  summarizeZodIssues,
} from "@/lib/validation/safe-validation-diagnostics";
import {
  getPollinationsConfig,
  POLLINATIONS_TEXT_ENDPOINT,
  type PollinationsConfig,
} from "./pollinations.config";
import { pollinationsResponseSchema } from "./pollinations.schema";

type FetchImplementation = typeof fetch;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 2) {
    return Math.round(seconds * 1_000);
  }
  return undefined;
}

function errorForStatus(
  status: number,
  retryAfter: string | null,
  model: string
): AIProviderError {
  const shared = { status, providerId: "pollinations", modelId: model };

  if (status === 401 || status === 403) {
    return new AIProviderError({
      ...shared,
      code: "authentication_error",
      retrySafe: false,
    });
  }
  if (status === 402) {
    return new AIProviderError({
      ...shared,
      code: "quota_exhausted",
      retrySafe: false,
    });
  }
  if (status === 408) {
    return new AIProviderError({
      ...shared,
      code: "timed_out",
      retrySafe: true,
      retryAfterMs: parseRetryAfter(retryAfter),
    });
  }
  if (status === 429) {
    return new AIProviderError({
      ...shared,
      code: "rate_limited",
      retrySafe: true,
      retryAfterMs: parseRetryAfter(retryAfter),
    });
  }
  if (status === 502 || status === 503 || status === 504) {
    return new AIProviderError({
      ...shared,
      code: "temporarily_unavailable",
      retrySafe: true,
      retryAfterMs: parseRetryAfter(retryAfter),
    });
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new AIProviderError({
      ...shared,
      code: "request_rejected",
      retrySafe: false,
    });
  }

  return new AIProviderError({
    ...shared,
    code: "unknown_provider_error",
    retrySafe: false,
  });
}

export class PollinationsProvider implements AIProvider {
  readonly providerId = "pollinations";

  constructor(
    private readonly fetchImplementation: FetchImplementation = fetch,
    private readonly configLoader: () => PollinationsConfig =
      getPollinationsConfig
  ) {}

  validateConfiguration(): void {
    this.configLoader();
  }

  async generateMission(
    request: ProviderMissionRequest,
    options: { signal: AbortSignal }
  ): Promise<ProviderMissionResult> {
    const config = this.configLoader();
    let response: Response;

    try {
      response = await this.fetchImplementation(POLLINATIONS_TEXT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          stream: false,
          response_format: { type: "json_object" },
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          safe: "sexual,violence",
        }),
        signal: options.signal,
      });
    } catch (error: unknown) {
      if (options.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new AIProviderError({
          code: "timed_out",
          retrySafe: true,
          providerId: this.providerId,
          modelId: config.model,
        });
      }
      throw new AIProviderError({
        code: "temporarily_unavailable",
        retrySafe: true,
        providerId: this.providerId,
        modelId: config.model,
      });
    }

    if (!response.ok) {
      logSafeValidationFailure({
        stage: "provider_envelope",
        failedFields: ["request"],
        issueCodes: ["custom"],
        category: `provider_http_${response.status}`,
      });
      throw errorForStatus(
        response.status,
        response.headers.get("retry-after"),
        config.model
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      logSafeValidationFailure({
        stage: "provider_envelope",
        failedFields: ["response_body"],
        issueCodes: ["custom"],
        category: "invalid_json_envelope",
      });
      throw new AIProviderError({
        code: "invalid_response",
        retrySafe: false,
        providerId: this.providerId,
        modelId: config.model,
      });
    }

    const parsed = pollinationsResponseSchema.safeParse(body);
    if (!parsed.success) {
      logSafeValidationFailure({
        stage: "provider_envelope",
        ...summarizeZodIssues(parsed.error.issues),
        category: "invalid_provider_envelope",
      });
      throw new AIProviderError({
        code: "invalid_response",
        retrySafe: false,
        providerId: this.providerId,
        modelId: config.model,
      });
    }

    return {
      content: parsed.data.choices[0].message.content,
      providerId: this.providerId,
      modelId: parsed.data.model ?? config.model,
      usage: {
        inputUnits: parsed.data.usage?.prompt_tokens ?? null,
        outputUnits: parsed.data.usage?.completion_tokens ?? null,
      },
      requestId: parsed.data.id ?? null,
    };
  }
}

export const AI_PROVIDER_ERROR_CODES = [
  "configuration_error",
  "authentication_error",
  "quota_exhausted",
  "rate_limited",
  "request_rejected",
  "content_rejected",
  "invalid_response",
  "timed_out",
  "temporarily_unavailable",
  "unknown_provider_error",
] as const;

export type AIProviderErrorCode = (typeof AI_PROVIDER_ERROR_CODES)[number];

interface AIProviderErrorOptions {
  code: AIProviderErrorCode;
  retrySafe: boolean;
  status?: number;
  retryAfterMs?: number;
  providerId?: string;
  modelId?: string;
}

/** A deliberately message-free provider error safe to cross internal layers. */
export class AIProviderError extends Error {
  readonly code: AIProviderErrorCode;
  readonly retrySafe: boolean;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  readonly providerId: string | null;
  readonly modelId: string | null;

  constructor(options: AIProviderErrorOptions) {
    super(options.code);
    this.name = "AIProviderError";
    this.code = options.code;
    this.retrySafe = options.retrySafe;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.providerId = options.providerId ?? null;
    this.modelId = options.modelId ?? null;
  }
}

export function isAIProviderError(value: unknown): value is AIProviderError {
  return value instanceof AIProviderError;
}

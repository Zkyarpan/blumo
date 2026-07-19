export interface ProviderMissionRequest {
  systemPrompt: string;
  userPrompt: string;
  responseSchemaVersion: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface ProviderUsage {
  inputUnits: number | null;
  outputUnits: number | null;
}

export interface ProviderMissionResult {
  content: unknown;
  providerId: string;
  modelId: string | null;
  usage: ProviderUsage;
  requestId: string | null;
}

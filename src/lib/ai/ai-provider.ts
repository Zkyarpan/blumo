import "server-only";

import type {
  ProviderMissionRequest,
  ProviderMissionResult,
} from "./ai-provider.types";

export interface AIProvider {
  readonly providerId: string;

  validateConfiguration(): void;

  generateMission(
    request: ProviderMissionRequest,
    options: { signal: AbortSignal }
  ): Promise<ProviderMissionResult>;
}

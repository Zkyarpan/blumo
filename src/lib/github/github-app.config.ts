import "server-only";

import { serverEnv } from "@/lib/env/server";

export type GitHubAppConfig = {
  appId: number;
  appSlug: string;
  privateKey: string;
  webhookSecret: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
};

let _config: GitHubAppConfig | undefined;

/**
 * Returns the GitHub App configuration.
 * Normalises escaped `\\n` sequences in the private key back to real newlines
 * so the PEM value survives `.env.local` parsing.
 *
 * Server-only — never import in client code.
 */
export function getGitHubAppConfig(): GitHubAppConfig {
  if (_config) return _config;

  const rawKey = serverEnv.GITHUB_APP_PRIVATE_KEY;
  // Replace literal \n sequences with real newlines. This handles the common
  // pattern of storing the PEM as a single-line value in env files.
  const privateKey = rawKey.includes("\\n")
    ? rawKey.replace(/\\n/g, "\n")
    : rawKey;

  _config = {
    appId: parseInt(serverEnv.GITHUB_APP_ID, 10),
    appSlug: serverEnv.GITHUB_APP_SLUG,
    privateKey,
    webhookSecret: serverEnv.GITHUB_WEBHOOK_SECRET,
    clientId: serverEnv.GITHUB_APP_CLIENT_ID,
    clientSecret: serverEnv.GITHUB_APP_CLIENT_SECRET,
  };

  return _config;
}

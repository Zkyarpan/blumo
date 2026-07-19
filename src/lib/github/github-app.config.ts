import "server-only";
import { serverEnv } from "@/lib/env/server";

export type GitHubAppConfig = {
  appId: number;
  appSlug: string;
  privateKey: string; // normalised — real newlines, never logged
  webhookSecret: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
};

/**
 * Returns the GitHub App configuration parsed from validated environment
 * variables. Normalises the private key from escaped `\n` sequences to
 * real newlines.
 *
 * Marked server-only. Never returned to the client.
 */
export function getGitHubAppConfig(): GitHubAppConfig {
  return {
    appId: parseInt(serverEnv.GITHUB_APP_ID, 10),
    appSlug: serverEnv.GITHUB_APP_SLUG,
    privateKey: serverEnv.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    webhookSecret: serverEnv.GITHUB_WEBHOOK_SECRET,
    clientId: serverEnv.GITHUB_APP_CLIENT_ID,
    clientSecret: serverEnv.GITHUB_APP_CLIENT_SECRET,
  };
}

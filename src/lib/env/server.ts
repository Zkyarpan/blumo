import "server-only";
import { z } from "zod";

/**
 * Server-only environment variable schema.
 * Credentials and secrets are added in later units as required.
 * Never prefix server secrets with NEXT_PUBLIC_.
 *
 * Units that add integrations must extend this schema:
 *   - Unit 02: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   - Unit 03: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET
 *   - Unit 05: AI provider key
 *   - Unit 06: RESEND_API_KEY, RESEND_SMTP_*
 */
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let _serverEnv: ServerEnv | undefined;

function parseServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;

  const result = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!result.success) {
    console.error("Invalid server environment variables:", result.error.format());
    throw new Error("Invalid server environment variables. Check .env.local.");
  }

  _serverEnv = result.data;
  return _serverEnv;
}

export const serverEnv = parseServerEnv();

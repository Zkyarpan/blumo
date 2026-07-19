import "server-only";
import { z } from "zod";

/**
 * Server-only environment variable schema.
 * Secrets are never prefixed NEXT_PUBLIC_.
 *
 * Unit additions:
 *   Unit 02: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY
 *   Unit 06: GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET,
 *            GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET
 *   Unit 10: AI provider key
 *   Unit 16: RESEND_API_KEY, RESEND_SMTP_*
 */
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Supabase (Unit 02)
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1, "SUPABASE_SECRET_KEY is required"),

  // GitHub App (Unit 06)
  GITHUB_APP_ID: z
    .string()
    .min(1, "GITHUB_APP_ID is required")
    .regex(/^\d+$/, "GITHUB_APP_ID must be a numeric string"),
  GITHUB_APP_SLUG: z
    .string()
    .min(1, "GITHUB_APP_SLUG is required"),
  GITHUB_APP_PRIVATE_KEY: z
    .string()
    .min(1, "GITHUB_APP_PRIVATE_KEY is required"),
  // GitHub webhook HMAC secret (Unit 09). Server-only and required.
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .min(1, "GITHUB_WEBHOOK_SECRET is required"),
  // Optional until Unit 07 OAuth flow
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

let _serverEnv: ServerEnv | undefined;

function parseServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;

  const result = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    GITHUB_APP_ID: process.env.GITHUB_APP_ID,
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
    GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET,
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
  });

  if (!result.success) {
    console.error(
      "Invalid server environment variables:",
      result.error.format()
    );
    throw new Error(
      "Invalid server environment variables. Check .env.local."
    );
  }

  _serverEnv = result.data;
  return _serverEnv;
}

export const serverEnv = parseServerEnv();

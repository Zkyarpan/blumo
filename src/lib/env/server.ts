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
 *   Stabilization: RESEND_API_KEY, RESEND_*_FROM, RESEND_REPLY_TO, NEXT_PUBLIC_SITE_URL
 */

// Validates a friendly-name email string like: Blumo <no-reply@mail.arpankarki.com.np>
// Also accepts a bare email address.
const VERIFIED_DOMAIN = "mail.arpankarki.com.np";

const senderAddressSchema = z
  .string()
  .min(1)
  .refine(
    (val) => {
      // Strip optional friendly name: "Name <addr>" or just "addr"
      const match = val.match(/<([^>]+)>/) ?? val.match(/^([^\s]+)$/);
      const addr = match ? match[1] : val;
      return addr.endsWith(`@${VERIFIED_DOMAIN}`);
    },
    { message: `Sender address must use the verified domain @${VERIFIED_DOMAIN}` }
  );

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

  // Pollinations (Unit 10). The key is validated lazily by the provider so
  // unrelated routes can still build when mission generation is not configured.
  POLLINATIONS_API_KEY: z.string().optional(),
  POLLINATIONS_TEXT_MODEL: z.string().optional(),

  // Resend product email (Stabilization).
  // RESEND_API_KEY is server-only and must NEVER use NEXT_PUBLIC_ prefix.
  // It must start with re_ per the Resend API key format.
  RESEND_API_KEY: z
    .string()
    .refine((v) => v === "" || v.startsWith("re_"), {
      message: "RESEND_API_KEY must start with re_",
    })
    .optional(),

  // Sender addresses — must use the verified domain.
  RESEND_AUTH_FROM: senderAddressSchema.optional(),
  RESEND_TASKS_FROM: senderAddressSchema.optional(),
  RESEND_PROGRESS_FROM: senderAddressSchema.optional(),
  RESEND_SUPPORT_FROM: senderAddressSchema.optional(),
  RESEND_REPLY_TO: z.string().email("RESEND_REPLY_TO must be a valid email address").optional(),

  // Application URLs
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
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
    POLLINATIONS_API_KEY: process.env.POLLINATIONS_API_KEY,
    POLLINATIONS_TEXT_MODEL: process.env.POLLINATIONS_TEXT_MODEL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_AUTH_FROM: process.env.RESEND_AUTH_FROM,
    RESEND_TASKS_FROM: process.env.RESEND_TASKS_FROM,
    RESEND_PROGRESS_FROM: process.env.RESEND_PROGRESS_FROM,
    RESEND_SUPPORT_FROM: process.env.RESEND_SUPPORT_FROM,
    RESEND_REPLY_TO: process.env.RESEND_REPLY_TO,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
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

// --------------------------------------------------------------------------
// Safe configuration-state helpers — never return secret values to callers
// --------------------------------------------------------------------------

/** Returns true when Resend is fully configured for product email delivery. */
export function isResendConfigured(): boolean {
  const env = serverEnv;
  return (
    typeof env.RESEND_API_KEY === "string" &&
    env.RESEND_API_KEY.startsWith("re_") &&
    typeof env.RESEND_AUTH_FROM === "string" &&
    env.RESEND_AUTH_FROM.length > 0
  );
}

/** Returns a safe diagnostics object with no secrets. */
export function getResendConfigState(): {
  configured: boolean;
  hasApiKey: boolean;
  hasAuthFrom: boolean;
  hasTasksFrom: boolean;
  hasReplyTo: boolean;
} {
  const env = serverEnv;
  return {
    configured: isResendConfigured(),
    hasApiKey: typeof env.RESEND_API_KEY === "string" && env.RESEND_API_KEY.startsWith("re_"),
    hasAuthFrom: typeof env.RESEND_AUTH_FROM === "string" && env.RESEND_AUTH_FROM.length > 0,
    hasTasksFrom: typeof env.RESEND_TASKS_FROM === "string" && env.RESEND_TASKS_FROM.length > 0,
    hasReplyTo: typeof env.RESEND_REPLY_TO === "string" && env.RESEND_REPLY_TO.length > 0,
  };
}

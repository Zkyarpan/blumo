import { z } from "zod";

/**
 * Public environment variables exposed to the browser.
 * Only include variables prefixed with NEXT_PUBLIC_.
 * Do not add secrets here.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Blumo"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000"),
});

function parsePublicEnv() {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!result.success) {
    console.error("Invalid public environment variables:", result.error.format());
    throw new Error("Invalid public environment variables. Check .env.local.");
  }

  return result.data;
}

export const publicEnv = parsePublicEnv();

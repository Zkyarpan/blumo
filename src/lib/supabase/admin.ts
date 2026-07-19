import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

/**
 * Supabase admin client — uses the service-role key.
 * Bypasses Row Level Security. Use ONLY for privileged server operations
 * such as profile creation after verifying user identity independently.
 * Never expose this client or its key to the browser.
 */
export function createSupabaseAdminClient() {
  return createClient(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

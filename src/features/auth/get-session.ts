import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Retrieves the current session. Note: prefer getUser() for security-
 * sensitive operations because getSession() reads from the cookie without
 * server-side validation. This helper is provided for cases where the full
 * session object (tokens, expires_at) is needed.
 */
export async function getSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return session;
}

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Retrieves the currently authenticated user from the server.
 * Uses getUser() — which validates the JWT with the Supabase server —
 * rather than getSession() which only reads from the cookie.
 * Returns null if no valid session exists.
 */
export async function getUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthCallbackUrl } from "@/features/auth/auth-redirect";

/**
 * Initiates the GitHub OAuth flow via Supabase Auth.
 * Redirects the user to the GitHub authorization page.
 * The callback is handled by /api/github/callback.
 */
export async function signInWithGitHub() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: getAuthCallbackUrl(),
      scopes: "read:user user:email",
    },
  });

  if (error || !data.url) {
    redirect("/login?error=auth_failed");
  }

  redirect(data.url);
}

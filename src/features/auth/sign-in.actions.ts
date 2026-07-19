"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env/public";

/**
 * Initiates the GitHub OAuth flow via Supabase Auth.
 * Redirects the user to the GitHub authorization page.
 * The callback is handled by /api/auth/callback.
 */
export async function signInWithGitHub() {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/api/auth/callback`,
      scopes: "read:user user:email",
    },
  });

  if (error || !data.url) {
    redirect("/login?error=auth_failed");
  }

  redirect(data.url);
}

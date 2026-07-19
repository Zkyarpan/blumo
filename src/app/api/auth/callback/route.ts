import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase Auth callback — exchanges the one-time code for a session.
 * GitHub redirects here after the user authorises the OAuth app.
 * The session cookie is set by the server client's cookie helpers.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchange error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=auth_failed`
    );
  }

  // Ensure redirect stays within the same origin
  const redirectUrl = next.startsWith("/")
    ? `${origin}${next}`
    : `${origin}/dashboard`;

  return NextResponse.redirect(redirectUrl);
}

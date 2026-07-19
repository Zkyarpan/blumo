import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protected application path prefixes.
 * Unauthenticated requests to these paths are redirected to /login.
 */
const PROTECTED_PATHS = [
  "/dashboard",
  "/onboarding",
  "/history",
  "/settings",
  "/tasks",
  "/github",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Always refresh the session cookie on every matched request
  const { supabaseResponse, user, supabase } = await updateSession(request);

  // Gate protected routes
  if (isProtectedPath(pathname) && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from /login
  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Onboarding gate — only for authenticated users on app paths.
  // Skip for /api/auth/callback and /login (already handled above).
  if (user) {
    const isOnboardingPath =
      pathname === "/onboarding" || pathname.startsWith("/onboarding/");
    const isProtectedAppPath = isProtectedPath(pathname) && !isOnboardingPath;

    // Fetch minimal profile — select only the sentinel column.
    // maybeSingle() so a missing row (trigger delay) is treated as not onboarded.
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();

    const isOnboarded = !!profile?.onboarding_completed_at;

    if (isOnboardingPath && isOnboarded) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    if (isProtectedAppPath && !isOnboarded) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - image/font files
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

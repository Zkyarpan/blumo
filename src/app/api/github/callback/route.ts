import type { NextRequest } from "next/server";
import { handleAuthCallback } from "@/features/auth/auth-callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Canonical Supabase GitHub authentication callback. */
export async function GET(request: NextRequest) {
  return handleAuthCallback(request);
}

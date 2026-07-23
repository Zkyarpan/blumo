import "server-only";

import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function isAuthorized(authorization: string | null, secret: string): boolean {
  if (!authorization) return false;

  const supplied = Buffer.from(authorization, "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

/**
 * Vercel invokes this route once per day. The query intentionally returns no
 * rows or counts; it exists only to generate minimal database activity.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv.CRON_SECRET;

  if (!secret) {
    return jsonResponse(
      {
        data: null,
        error: {
          code: "CRON_NOT_CONFIGURED",
          message: "Scheduled service is not configured.",
        },
      },
      503
    );
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return jsonResponse(
      {
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Unauthorized.",
        },
      },
      401
    );
  }

  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (error) {
      return jsonResponse(
        {
          data: null,
          error: {
            code: "KEEP_ALIVE_FAILED",
            message: "Database keep-alive failed.",
          },
        },
        503
      );
    }

    return jsonResponse(
      {
        data: { ok: true },
        error: null,
      },
      200
    );
  } catch {
    return jsonResponse(
      {
        data: null,
        error: {
          code: "KEEP_ALIVE_FAILED",
          message: "Database keep-alive failed.",
        },
      },
      503
    );
  }
}

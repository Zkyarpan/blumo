"use client";

import { useEffect } from "react";
import { PageContainer } from "@/components/layout/PageContainer";

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the authenticated app route group.
 * Catches unexpected errors during render and offers a retry action.
 */
export default function AppError({ error, reset }: AppErrorProps) {
  useEffect(() => {
    // Log the error to the browser console for debugging.
    // Production: send to an error monitoring service (e.g. Sentry) in Unit 19.
    console.error("[app error boundary]", error.message);
  }, [error]);

  return (
    <div className="py-20">
      <PageContainer width="narrow" className="text-center">
        <h2
          className="text-xl font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Something went wrong
        </h2>
        <p
          className="text-sm mb-6"
          style={{ color: "var(--text-muted)" }}
        >
          An unexpected error occurred. Please try again.
          {error.digest && (
            <span className="block mt-1 text-xs">
              Reference: {error.digest}
            </span>
          )}
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "var(--text-inverse)",
          }}
        >
          Try again
        </button>
      </PageContainer>
    </div>
  );
}

"use client";

import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AlertCircle } from "lucide-react";

export default function TasksError() {
  return (
    <PageContainer width="wide" className="py-10">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-xl border p-6"
        style={{
          borderColor: "var(--state-error-soft)",
          backgroundColor: "var(--state-error-soft)",
        }}
      >
        <AlertCircle
          className="mt-0.5 size-5 shrink-0"
          aria-hidden="true"
          style={{ color: "var(--state-error)" }}
        />
        <div>
          <p className="font-medium" style={{ color: "var(--text-primary)" }}>
            Unable to load your tasks.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Refresh the page or return to the dashboard.
          </p>
          <Link
            href="/dashboard"
            className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}

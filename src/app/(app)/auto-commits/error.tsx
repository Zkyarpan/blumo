"use client";

import Link from "next/link";

export default function AutoCommitsError() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-base font-medium" style={{ color: "var(--state-error)" }}>
        Something went wrong loading auto-commits.
      </p>
      <Link
        href="/dashboard"
        className="text-sm underline underline-offset-4"
        style={{ color: "var(--accent-primary)" }}
      >
        Return to dashboard
      </Link>
    </div>
  );
}

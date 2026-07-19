import { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Tasks — Blumo",
  description: "Your Blumo daily missions.",
};

export default function TasksPage() {
  return (
    <PageContainer width="default" className="py-10">
      <h1
        className="text-2xl font-semibold mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        Tasks
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Mission generation is coming soon. Complete your GitHub connection first.
      </p>
      <Link
        href="/dashboard"
        className="text-sm font-medium"
        style={{ color: "var(--accent-primary)" }}
      >
        ← Back to dashboard
      </Link>
    </PageContainer>
  );
}

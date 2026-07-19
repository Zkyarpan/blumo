import { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "History — Blumo",
  description: "Your completed mission history.",
};

export default function HistoryPage() {
  return (
    <PageContainer width="default" className="py-10">
      <h1
        className="text-2xl font-semibold mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        History
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Your completed missions will appear here after you start generating.
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

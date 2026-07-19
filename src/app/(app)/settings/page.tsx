import { Metadata } from "next";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Settings — Blumo",
  description: "Manage your Blumo account and GitHub connection.",
};

export default function SettingsPage() {
  return (
    <PageContainer width="default" className="py-10">
      <h1
        className="text-2xl font-semibold mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        Settings
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Account settings and GitHub connection are coming soon.
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

import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";
import { HomeIcon } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <PageContainer width="narrow" className="text-center py-24">
        <div className="mb-6">
          <BlumoWordmark size="lg" />
        </div>
        <p
          className="text-8xl font-bold tracking-tight mb-4"
          style={{ color: "var(--border-strong)" }}
          aria-hidden="true"
        >
          404
        </p>
        <h1
          className="text-2xl font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Page not found
        </h1>
        <p
          className="text-sm mb-8"
          style={{ color: "var(--text-muted)" }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--accent-primary)",
            color: "var(--text-inverse)",
          }}
        >
          <HomeIcon size={16} aria-hidden="true" />
          Back to home
        </Link>
      </PageContainer>
    </div>
  );
}

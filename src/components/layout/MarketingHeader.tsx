import Link from "next/link";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Top navigation for the public marketing site.
 * Sticky, minimal, brand-forward.
 */
export function MarketingHeader() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <PageContainer width="wide">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Blumo home">
            <BlumoWordmark size="md" />
          </Link>
          <nav className="hidden sm:flex items-center gap-6">
            <Link
              href="#how-it-works"
              className="text-sm font-medium transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              How it works
            </Link>
          </nav>
        </div>
      </PageContainer>
    </header>
  );
}

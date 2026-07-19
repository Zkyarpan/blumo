import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { PageContainer } from "@/components/layout/PageContainer";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";

/**
 * Footer for the public marketing site.
 */
export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-auto"
      style={{ backgroundColor: "var(--bg-subtle)" }}
    >
      <PageContainer width="wide">
        <Separator style={{ backgroundColor: "var(--border-default)" }} />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-8">
          <div className="flex items-center gap-2">
            <BlumoWordmark size="sm" />
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              &copy; {year}
            </span>
          </div>
          <p
            className="text-xs text-center"
            style={{ color: "var(--text-muted)" }}
          >
            Meaningful progress, not fake commits.
          </p>
          <nav className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="text-xs hover:underline transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs hover:underline transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              Terms
            </Link>
          </nav>
        </div>
      </PageContainer>
    </footer>
  );
}

import Link from "next/link";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";
import { PageContainer } from "@/components/layout/PageContainer";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Top navigation bar for the authenticated application shell.
 * Full sidebar navigation with collapsible mobile sheet is introduced in later units.
 */
export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <PageContainer width="wide">
        <div className="flex h-14 items-center gap-6">
          <Link href="/dashboard" aria-label="Blumo dashboard">
            <BlumoWordmark size="md" />
          </Link>
          <Separator
            orientation="vertical"
            className="h-5"
            style={{ backgroundColor: "var(--border-default)" }}
          />
          <nav className="flex items-center gap-1">
            {navLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  "hover:bg-[var(--bg-subtle)]"
                )}
                style={{ color: "var(--text-secondary)" }}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </PageContainer>
    </header>
  );
}

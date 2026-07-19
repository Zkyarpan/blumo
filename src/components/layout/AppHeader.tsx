import Link from "next/link";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";
import { PageContainer } from "@/components/layout/PageContainer";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { signOut } from "@/features/auth/sign-out.actions";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface AppHeaderUser {
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

interface AppHeaderProps {
  /** Authenticated user data. Undefined when running as unprotected placeholder. */
  user?: AppHeaderUser;
}

/**
 * Top navigation bar for the authenticated application shell.
 * Shows brand, nav links, and the current user with a sign-out action.
 */
export function AppHeader({ user }: AppHeaderProps) {
  /** Returns the first letter(s) of the display name for the avatar fallback. */
  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <PageContainer width="wide">
        <div className="flex h-14 items-center gap-4">
          <Link href="/dashboard" aria-label="Blumo dashboard">
            <BlumoWordmark size="md" />
          </Link>
          <Separator
            orientation="vertical"
            className="h-5"
            style={{ backgroundColor: "var(--border-default)" }}
          />
          <nav className="flex items-center gap-1 flex-1">
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

          {/* User area */}
          {user && (
            <div className="flex items-center gap-3 ml-auto">
              <div className="hidden sm:flex flex-col items-end">
                <span
                  className="text-sm font-medium leading-none"
                  style={{ color: "var(--text-primary)" }}
                >
                  {user.displayName}
                </span>
                {user.email && (
                  <span
                    className="text-xs leading-none mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {user.email}
                  </span>
                )}
              </div>

              {/* Avatar */}
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  className="size-8 rounded-full border"
                  style={{ borderColor: "var(--border-default)" }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="size-8 rounded-full flex items-center justify-center text-xs font-semibold select-none"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    color: "var(--accent-strong)",
                  }}
                  aria-hidden="true"
                >
                  {getInitials(user.displayName)}
                </div>
              )}

              {/* Sign out */}
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
                  style={{
                    color: "var(--text-muted)",
                    backgroundColor: "transparent",
                  }}
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </PageContainer>
    </header>
  );
}

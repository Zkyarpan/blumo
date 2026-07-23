import Link from "next/link";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";
import { PageContainer } from "@/components/layout/PageContainer";
import { MobileNav } from "@/components/layout/MobileNav";
import { signOut } from "@/features/auth/sign-out.actions";

interface AppHeaderUser {
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

interface AppHeaderProps {
  /** Authenticated user data. Undefined when running as unprotected placeholder. */
  user?: AppHeaderUser;
  /** When true (default), renders the mobile hamburger nav on small screens. */
  showMobileNav?: boolean;
}

/**
 * Top navigation bar for the authenticated application shell.
 * Navigation links have moved to AppSidebar (desktop) and MobileNav (mobile).
 * This header shows the wordmark, user info, and sign-out control.
 */
export function AppHeader({ user, showMobileNav = true }: AppHeaderProps) {
  /** Returns the first two initials of the display name. */
  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 border-b"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <PageContainer width="wide">
        <div className="flex h-14 items-center gap-3">
          {/* Mobile nav trigger — shown only on smaller than lg */}
          {showMobileNav && <MobileNav />}

          {/* Wordmark */}
          <Link href="/dashboard" aria-label="Blumo dashboard">
            <BlumoWordmark size="md" />
          </Link>

          {/* Push user block to the right */}
          <div className="flex-1" />

          {/* User area */}
          {user && (
            <div className="flex items-center gap-3">
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
                  className="text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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

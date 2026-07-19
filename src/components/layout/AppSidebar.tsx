"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Zap, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks",     label: "Tasks",     icon: Zap           },
  { href: "/history",   label: "History",   icon: History       },
  { href: "/settings",  label: "Settings",  icon: Settings      },
] as const;

/**
 * Fixed left sidebar navigation for desktop (lg and wider).
 * Hidden on smaller viewports — mobile navigation is handled by MobileNav.
 */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden lg:flex fixed top-14 left-0 bottom-0 w-56 flex-col border-r z-40"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <nav
        className="flex flex-col gap-1 p-3"
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "font-medium border-l-2"
                  : "hover:bg-[var(--bg-subtle)]"
              )}
              style={
                isActive
                  ? {
                      backgroundColor: "var(--bg-subtle)",
                      color: "var(--text-primary)",
                      borderLeftColor: "var(--accent-primary)",
                    }
                  : { color: "var(--text-secondary)" }
              }
            >
              <Icon size={20} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

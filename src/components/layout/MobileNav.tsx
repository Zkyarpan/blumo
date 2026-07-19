"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LayoutDashboard, Zap, History, Settings } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks",     label: "Tasks",     icon: Zap           },
  { href: "/history",   label: "History",   icon: History       },
  { href: "/settings",  label: "Settings",  icon: Settings      },
] as const;

/**
 * Mobile sheet navigation — visible only on viewports smaller than lg.
 * Opens via a hamburger icon. Closes when a nav link is selected.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-subtle)]"
        aria-label="Open navigation"
        style={{ color: "var(--text-secondary)" }}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--border-default)" }}
          >
            <SheetTitle className="sr-only">Navigation menu</SheetTitle>
            <BlumoWordmark size="md" />
          </SheetHeader>

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
                  onClick={() => setOpen(false)}
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
        </SheetContent>
      </Sheet>
    </>
  );
}

import { AppHeader } from "@/components/layout/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}

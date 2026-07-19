import { getUser } from "@/features/auth/get-user";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  const headerUser = user
    ? {
        displayName:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.user_name as string | undefined) ??
          user.email ??
          "User",
        email: user.email ?? undefined,
        avatarUrl:
          (user.user_metadata?.avatar_url as string | undefined) ??
          undefined,
      }
    : undefined;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <AppHeader user={headerUser} />
      <AppSidebar />
      {/* pt-14 = header height (h-14). lg:pl-56 = sidebar width. */}
      <main className="pt-14 lg:pl-56">{children}</main>
    </div>
  );
}

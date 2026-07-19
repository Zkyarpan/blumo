import { getUser } from "@/features/auth/get-user";
import { AppHeader } from "@/components/layout/AppHeader";

// TODO (Unit 02): Route protection is handled by middleware.
// This layout fetches the user server-side to pass to the header.

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
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <AppHeader user={headerUser} />
      <main className="flex-1">{children}</main>
    </div>
  );
}

import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/get-user";
import { getDashboardData } from "@/features/dashboard/dashboard.service";
import { DashboardShell } from "@/features/dashboard/DashboardShell";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata: Metadata = {
  title: "Dashboard — Blumo",
  description: "Your Blumo developer growth dashboard.",
};

export default async function DashboardPage() {
  // Defensive auth check — proxy already handles this, but be explicit.
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const data = await getDashboardData(user.id);

  // Profile missing (trigger propagation delay) or onboarding incomplete.
  if (!data || !data.profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  return (
    <PageContainer width="wide">
      <DashboardShell data={data} />
    </PageContainer>
  );
}

import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/get-user";
import { getProfile } from "@/features/auth/get-profile";
import { getInstallationUrl } from "@/lib/github/installation-url";
import { ConnectGitHubPage } from "@/features/github/ConnectGitHubPage";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata = { title: "Connect GitHub — Blumo" };

interface ConnectPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile();
  if (!profile?.onboarding_completed_at) {
    redirect("/onboarding");
  }

  const resolvedParams = await searchParams;
  const installationUrl = getInstallationUrl();

  return (
    <PageContainer width="narrow" className="py-10">
      <ConnectGitHubPage
        installationUrl={installationUrl}
        error={resolvedParams.error}
      />
    </PageContainer>
  );
}

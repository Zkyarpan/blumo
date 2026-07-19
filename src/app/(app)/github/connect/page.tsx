import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/get-user";
import { getProfile } from "@/features/auth/get-profile";
<<<<<<< HEAD
import { getGitHubAppConfig } from "@/lib/github/github-app.config";
import { buildInstallationUrl } from "@/lib/github/installation-url";
=======
import { getInstallationUrl } from "@/lib/github/installation-url";
>>>>>>> origin/main
import { ConnectGitHubPage } from "@/features/github/ConnectGitHubPage";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata = { title: "Connect GitHub — Blumo" };

<<<<<<< HEAD
export default async function ConnectPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (!profile?.onboarding_completed_at) redirect("/onboarding");

  // Build the installation URL server-side.
  // If GitHub App is not configured (missing env vars), serverEnv will have
  // already thrown at startup. getGitHubAppConfig() is therefore always safe
  // to call here.
  const config = getGitHubAppConfig();
  const installationUrl = buildInstallationUrl(config.appSlug);

  return (
    <PageContainer width="narrow" className="py-10">
      <ConnectGitHubPage installationUrl={installationUrl} />
=======
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
>>>>>>> origin/main
    </PageContainer>
  );
}

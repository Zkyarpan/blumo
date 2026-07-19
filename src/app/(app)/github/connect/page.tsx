import { redirect } from "next/navigation";
import { getUser } from "@/features/auth/get-user";
import { getProfile } from "@/features/auth/get-profile";
import { getGitHubAppConfig } from "@/lib/github/github-app.config";
import { buildInstallationUrl } from "@/lib/github/installation-url";
import { ConnectGitHubPage } from "@/features/github/ConnectGitHubPage";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata = { title: "Connect GitHub — Blumo" };

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
    </PageContainer>
  );
}

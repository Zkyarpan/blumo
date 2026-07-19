import { redirect } from "next/navigation";
import { getProfile } from "@/features/auth/get-profile";
import { OnboardingForm } from "@/features/onboarding/OnboardingForm";
import { PageContainer } from "@/components/layout/PageContainer";

export const metadata = { title: "Set up your learning profile — Blumo" };

export default async function OnboardingPage() {
  const profile = await getProfile();

  // Proxy should have redirected, but be defensive.
  if (profile?.onboarding_completed_at) {
    redirect("/dashboard");
  }

  return (
    <PageContainer width="narrow" className="py-10">
      <OnboardingForm />
    </PageContainer>
  );
}

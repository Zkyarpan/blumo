import { Metadata } from "next";
import { LoginCard } from "@/features/auth/LoginCard";

export const metadata: Metadata = {
  title: "Sign in — Blumo",
  description: "Sign in to Blumo with your GitHub account.",
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "auth_failed";

  return <LoginCard hasError={hasError} />;
}

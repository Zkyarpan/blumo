import Link from "next/link";
import { signInWithGitHub } from "@/features/auth/sign-in.actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GitHubIcon } from "@/components/shared/GitHubIcon";

interface LoginCardProps {
  hasError?: boolean;
}

/**
 * Login card rendered on the /login page.
 * Displays the GitHub sign-in button and handles the error state
 * when authentication fails or the user cancels.
 */
export function LoginCard({ hasError = false }: LoginCardProps) {
  return (
    <Card
      className="rounded-2xl border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <CardHeader className="text-center pb-2">
        <CardTitle
          className="text-xl font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Grow every day.
        </CardTitle>
        <CardDescription
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Sign in to start your daily missions and track your progress.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        {hasError && (
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            role="alert"
            style={{
              backgroundColor: "var(--state-error-soft)",
              borderColor: "var(--state-error)",
              color: "var(--state-error)",
            }}
          >
            Sign-in failed. Please try again or contact support if the
            problem continues.
          </div>
        )}

        {/* GitHub sign-in form */}
        <form action={signInWithGitHub}>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors border"
            style={{
              backgroundColor: "var(--text-primary)",
              color: "var(--text-inverse)",
              borderColor: "var(--text-primary)",
            }}
          >
            <GitHubIcon className="size-4 shrink-0" aria-hidden="true" />
            Continue with GitHub
          </button>
        </form>

        <p
          className="text-center text-xs leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          By signing in you agree to our{" "}
          <Link
            href="/terms"
            className="underline underline-offset-2 hover:no-underline"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:no-underline"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

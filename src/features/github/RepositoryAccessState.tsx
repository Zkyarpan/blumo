import Link from "next/link";
import { AlertTriangle, GitBranch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface RepositoryAccessStateProps {
  state: "missing" | "suspended" | "uninstalled";
}

export function RepositoryAccessState({ state }: RepositoryAccessStateProps) {
  const suspended = state === "suspended";
  const title = suspended
    ? "GitHub access is suspended"
    : state === "uninstalled"
      ? "GitHub App disconnected"
      : "Connect the GitHub App";
  const description = suspended
    ? "Repository actions and selection remain disabled until access is restored in GitHub."
    : state === "uninstalled"
      ? "The GitHub App was uninstalled. Reconnect it before selecting a repository."
      : "Install the Blumo GitHub App before synchronizing repositories.";

  return (
    <Card className="rounded-xl border" style={{ borderColor: "var(--border-default)" }}>
      <CardContent className="py-8 text-center">
        {suspended ? (
          <AlertTriangle
            className="mx-auto size-8"
            aria-hidden="true"
            style={{ color: "var(--state-warning)" }}
          />
        ) : (
          <GitBranch
            className="mx-auto size-8"
            aria-hidden="true"
            style={{ color: "var(--border-strong)" }}
          />
        )}
        <p className="mt-3 font-medium" style={{ color: "var(--text-primary)" }}>
          {title}
        </p>
        <p className="mx-auto mt-1 max-w-lg text-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
        {suspended ? (
          <a
            href="https://github.com/settings/installations"
            className="mt-4 inline-flex text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--state-warning)" }}
          >
            Manage GitHub App access
          </a>
        ) : (
          <Link
            href="/github/connect"
            className="mt-4 inline-flex text-sm font-medium underline underline-offset-4"
            style={{ color: "var(--accent-strong)" }}
          >
            {state === "uninstalled" ? "Reconnect GitHub" : "Connect GitHub"}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectGitHubButton } from "@/features/github/ConnectGitHubButton";

interface ConnectGitHubPageProps {
  installationUrl: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  cancelled:
    "Installation was cancelled. You can try again when you're ready.",
  missing_installation:
    "Something went wrong with the GitHub redirect. Please try again.",
  invalid_installation:
    "Blumo could not verify that installation. Please install the App again.",
  github_unavailable:
    "GitHub is temporarily unavailable. Please try again in a moment.",
  ownership_mismatch:
    "This installation belongs to a different GitHub account. Sign in with the correct account and try again.",
  org_not_supported:
    "Organisation installations are not yet supported. Please install the App on a personal account.",
  installation_conflict:
    "This installation is already connected to another Blumo account. Contact support if you believe this is an error.",
  installation_suspended:
    "Your GitHub App installation is suspended. Restore it in GitHub before synchronizing repositories.",
  server_error: "Something went wrong on our end. Please try again.",
};

function getErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}

/**
 * Server Component for the GitHub connection page.
 * Displays permissions explanation, privacy note, and the connect button.
 * Shows an error banner if an error query parameter is present.
 */
export function ConnectGitHubPage({
  installationUrl,
  error,
}: ConnectGitHubPageProps) {
  const errorMessage = getErrorMessage(error);
  const isSuspended = error === "installation_suspended";

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {errorMessage && (
        <div
          className="rounded-lg border p-4 text-sm"
          role="alert"
          style={{
            backgroundColor: isSuspended
              ? "var(--state-warning-soft)"
              : "var(--state-error-soft)",
            borderColor: isSuspended
              ? "var(--state-warning)"
              : "var(--state-error)",
            color: isSuspended
              ? "var(--state-warning)"
              : "var(--state-error)",
          }}
        >
          <p className="font-medium mb-1">
            {isSuspended ? "GitHub installation suspended" : "Could not connect GitHub"}
          </p>
          <p>{errorMessage}</p>
          {isSuspended ? (
            <a
              href="https://github.com/settings/installations"
              className="mt-2 inline-block text-sm font-medium underline"
            >
              Open GitHub App settings
            </a>
          ) : (
            <a
              href="/github/connect"
              className="mt-2 inline-block text-sm font-medium underline"
            >
              Try again
            </a>
          )}
        </div>
      )}

      <Card
        className="rounded-xl border"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-default)",
        }}
      >
        <CardHeader className="pb-2">
          <CardTitle
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Connect your GitHub account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Blumo uses a GitHub App to access only the repositories you choose.
            You&apos;ll select exactly which repositories to allow before
            anything is connected.
          </p>

          <div className="space-y-2">
            <p
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              Requested permissions
            </p>
            <ul className="space-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              <li>✓ Read repository metadata</li>
              <li>✓ Read and write repository contents (inside blumo/ only)</li>
            </ul>
          </div>

          <p
            className="text-xs rounded-lg p-3"
            style={{
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-muted)",
            }}
          >
            Blumo never reads your source code or writes outside the{" "}
            <code>blumo/</code> directory. You approve every contribution before
            it is committed.
          </p>

          <ConnectGitHubButton installationUrl={installationUrl} />
        </CardContent>
      </Card>
    </div>
  );
}

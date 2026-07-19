import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConnectGitHubButton } from "./ConnectGitHubButton";

interface ConnectGitHubPageProps {
  installationUrl: string;
}

export function ConnectGitHubPage({ installationUrl }: ConnectGitHubPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-2xl md:text-3xl font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Connect your GitHub repository
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Blumo needs repository access to write approved learning notes and
          coding challenges on your behalf.
        </p>
      </div>

      <Card
        className="rounded-xl border"
        style={{
          backgroundColor: "var(--bg-subtle)",
          borderColor: "var(--border-default)",
        }}
      >
        <CardHeader className="pb-2">
          <CardTitle
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            What Blumo can access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-3">
            <li>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Read and write files in{" "}
                <code className="text-xs font-mono">blumo/</code>
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Blumo writes approved learning notes and coding challenges only
                inside the <code className="text-xs font-mono">blumo/</code>{" "}
                directory.
              </p>
            </li>
            <li>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Read repository metadata
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Required by GitHub for all Apps.
              </p>
            </li>
          </ul>

          <Separator />

          <div>
            <p
              className="text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              What Blumo cannot access
            </p>
            <ul className="space-y-1">
              {[
                "Issues and pull requests",
                "Code history outside blumo/",
                "Organisation settings",
                "Secrets and Actions workflows",
              ].map((item) => (
                <li
                  key={item}
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  — {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            You choose which repositories to allow. You can remove access at any
            time from your GitHub settings.
          </p>
        </CardContent>
      </Card>

      <ConnectGitHubButton installationUrl={installationUrl} />

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Blumo never requests your GitHub password or a personal access token.
        Repository connection uses a GitHub App with selected-repository access
        only.
      </p>
    </div>
  );
}

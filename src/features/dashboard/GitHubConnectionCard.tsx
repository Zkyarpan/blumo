import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GitBranch } from "lucide-react";

/**
 * GitHub repository connection card — always renders the not-connected state
 * in Unit 05. Real connection is introduced in Unit 06.
 */
export function GitHubConnectionCard() {
  return (
    <Card
      className="rounded-xl border"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-default)",
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <GitBranch
            size={18}
            style={{ color: "var(--text-secondary)" }}
            aria-hidden="true"
          />
          <CardTitle
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            GitHub repository
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="rounded-lg border-2 border-dashed p-6 text-center"
          style={{ borderColor: "var(--border-default)" }}
        >
          <GitBranch
            size={32}
            className="mx-auto mb-2"
            style={{ color: "var(--border-strong)" }}
            aria-hidden="true"
          />
          <p
            className="text-sm font-medium mb-1"
            style={{ color: "var(--text-muted)" }}
          >
            Not connected
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Connect a repository to enable mission commits.
          </p>
        </div>

        <Link
          href="/settings"
          className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors w-full justify-center"
          style={{
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
          }}
        >
          Connect GitHub →
        </Link>
      </CardContent>
    </Card>
  );
}

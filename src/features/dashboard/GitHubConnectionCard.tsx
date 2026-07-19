import Link from "next/link";
import { Check, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GitHubConnectionCardProps {
  hasActiveInstallation: boolean;
  selectedRepository: {
    id: string;
    full_name: string;
    default_branch: string;
  } | null;
}

export function GitHubConnectionCard({
  hasActiveInstallation,
  selectedRepository,
}: GitHubConnectionCardProps) {
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
          <CardTitle className="text-base font-semibold">GitHub repository</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {selectedRepository ? (
          <div
            className="rounded-lg border p-4"
            style={{
              backgroundColor: "var(--accent-soft)",
              borderColor: "var(--accent-primary)",
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <Badge
                style={{
                  backgroundColor: "var(--state-success-soft)",
                  color: "var(--state-success)",
                }}
              >
                <Check aria-hidden="true" /> Active
              </Badge>
            </div>
            <a
              href={`https://github.com/${selectedRepository.full_name}`}
              className="mt-3 block break-all font-mono text-sm font-medium underline-offset-4 hover:underline"
              style={{ color: "var(--text-primary)" }}
            >
              {selectedRepository.full_name}
            </a>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Default branch: {selectedRepository.default_branch}
            </p>
          </div>
        ) : hasActiveInstallation ? (
          <div
            className="rounded-lg border p-5 text-center"
            style={{
              backgroundColor: "var(--bg-subtle)",
              borderColor: "var(--border-default)",
            }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Installation connected
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Select one repository to make it active.
            </p>
          </div>
        ) : (
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
            <p className="mb-1 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              Not connected
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Connect a repository to enable mission commits.
            </p>
          </div>
        )}

        <Link
          href={
            hasActiveInstallation ? "/github/repositories" : "/github/connect"
          }
          className="inline-flex w-full items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-secondary)",
            borderColor: "var(--border-default)",
          }}
        >
          {selectedRepository
            ? "Manage repositories"
            : hasActiveInstallation
              ? "Select a repository →"
              : "Connect GitHub →"}
        </Link>
      </CardContent>
    </Card>
  );
}

import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getUser } from "@/features/auth/get-user";
import { PageContainer } from "@/components/layout/PageContainer";
import { buildCommitProposal } from "@/features/commits/commit-proposal.service";
import {
  CommitProposal,
  CommitNotApproved,
  CommitRepositoryUnavailable,
  CommitInstallationSuspended,
  CommitAlreadyCommitted,
} from "@/features/commits/CommitProposal";

interface CommitPageProps {
  params: Promise<{ taskId: string }>;
}

export const metadata: Metadata = {
  title: "Commit Mission — Blumo",
  description: "Confirm and commit your approved Blumo mission to GitHub.",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CommitPage({ params }: CommitPageProps) {
  const { taskId } = await params;

  // Validate taskId shape before any database call
  if (!UUID_RE.test(taskId)) {
    notFound();
  }

  const user = await getUser();
  if (!user) {
    notFound();
  }

  const result = await buildCommitProposal(user.id, taskId);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "not_approved") {
    return (
      <PageContainer width="wide" className="py-10">
        <CommitNotApproved taskId={taskId} />
      </PageContainer>
    );
  }

  if (result.kind === "repository_unavailable") {
    return (
      <PageContainer width="wide" className="py-10">
        <CommitRepositoryUnavailable />
      </PageContainer>
    );
  }

  if (result.kind === "installation_suspended") {
    return (
      <PageContainer width="wide" className="py-10">
        <CommitInstallationSuspended />
      </PageContainer>
    );
  }

  if (result.kind === "already_committed") {
    return (
      <PageContainer width="wide" className="py-10">
        <CommitAlreadyCommitted
          commitSha={result.commitSha}
          commitUrl={result.commitUrl}
          branch={result.branch}
          filePath={result.filePath}
        />
      </PageContainer>
    );
  }

  if (result.kind === "error") {
    return (
      <PageContainer width="wide" className="py-10">
        <div
          role="alert"
          className="rounded-xl border p-6"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-default)",
          }}
        >
          <p className="font-medium" style={{ color: "var(--state-error)" }}>
            Unable to load commit proposal.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Refresh the page. If the problem continues, return to the
            dashboard.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide" className="py-10">
      <CommitProposal proposal={result.data} />
    </PageContainer>
  );
}

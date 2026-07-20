import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

// Mock server actions so client component can render without server context
vi.mock("./mission-review.actions", () => ({
  approveMissionAction: vi.fn(),
  rejectMissionAction: vi.fn(),
  regenerateMissionAction: vi.fn(),
}));

// Mock useActionState since jsdom doesn't support form actions
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: vi.fn().mockReturnValue([null, vi.fn(), false]),
    useTransition: vi.fn().mockReturnValue([false, vi.fn()]),
  };
});

import { MissionReview } from "./MissionReview";
import type { MissionReviewReadModel } from "./mission-review.types";

const TASK_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VERSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeReviewData(
  taskOverrides: Partial<MissionReviewReadModel["task"]> = {},
  versionOverrides: Partial<MissionReviewReadModel["currentVersion"]> = {}
): MissionReviewReadModel {
  return {
    task: {
      id: TASK_ID,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      scheduledDate: "2026-07-20",
      status: "generated",
      reviewOperationStatus: "idle",
      regenerationCount: 0,
      approvedAt: null,
      rejectedAt: null,
      currentMissionVersionId: VERSION_ID,
      repositoryFullName: "user/my-repo",
      repositoryAccessStatus: "active",
      installationStatus: "active",
      ...taskOverrides,
    },
    currentVersion: {
      id: VERSION_ID,
      taskId: TASK_ID,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      versionNumber: 1,
      status: "generated",
      title: "Practice state transitions",
      description:
        "A focused exercise on understanding state change in a UI component.",
      estimatedMinutes: 30,
      difficulty: "beginner",
      acceptanceChecklist: [
        "Identify two state transitions",
        "Describe each clearly",
      ],
      suggestedCommitMessage: "Document state transition reasoning",
      suggestedBranch: "main",
      learningOutcome:
        "Explain predictable state transitions using a focused example.",
      aiProvider: "pollinations",
      promptVersion: "mission-v2",
      generationClaimVersion: 1,
      approvedAt: null,
      rejectedAt: null,
      createdAt: "2026-07-20T10:00:00.000Z",
      ...versionOverrides,
    },
  };
}

describe("MissionReview", () => {
  it("renders the AI-generated label", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText(/AI-generated mission/i)).toBeInTheDocument();
  });

  it("renders the no-GitHub-write explanation", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(
      screen.getByText(/does not create a branch, file, commit, or pull request/i)
    ).toBeInTheDocument();
  });

  it("renders the mission title", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText("Practice state transitions")).toBeInTheDocument();
  });

  it("renders the mission description", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(
      screen.getByText(
        "A focused exercise on understanding state change in a UI component."
      )
    ).toBeInTheDocument();
  });

  it("renders all checklist items", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText("Identify two state transitions")).toBeInTheDocument();
    expect(screen.getByText("Describe each clearly")).toBeInTheDocument();
  });

  it("renders the suggested branch", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("renders the suggested commit message", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(
      screen.getByText("Document state transition reasoning")
    ).toBeInTheDocument();
  });

  it("renders the learning outcome", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(
      screen.getByText(
        "Explain predictable state transitions using a focused example."
      )
    ).toBeInTheDocument();
  });

  it("renders the repository full name", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText("user/my-repo")).toBeInTheDocument();
  });

  it("renders estimated minutes", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText(/30 minutes/i)).toBeInTheDocument();
  });

  it("renders version number", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText(/Version 1/i)).toBeInTheDocument();
  });

  it("renders repository-unavailable warning when repo is removed", () => {
    render(
      <MissionReview
        data={makeReviewData({ repositoryAccessStatus: "removed" })}
      />
    );
    expect(
      screen.getByText(/repository associated with this mission is no longer available/i)
    ).toBeInTheDocument();
  });

  it("renders approved status badge when task is approved", () => {
    render(
      <MissionReview
        data={makeReviewData(
          { status: "approved", approvedAt: "2026-07-20T12:00:00.000Z" },
          { status: "approved", approvedAt: "2026-07-20T12:00:00.000Z" }
        )}
      />
    );
    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
  });

  it("renders rejected status badge when task is rejected", () => {
    render(
      <MissionReview
        data={makeReviewData(
          { status: "rejected", rejectedAt: "2026-07-20T11:00:00.000Z" },
          { status: "rejected", rejectedAt: "2026-07-20T11:00:00.000Z" }
        )}
      />
    );
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
  });

  it("does not render mission content as raw HTML", () => {
    const { container } = render(
      <MissionReview
        data={makeReviewData(
          {},
          {
            title: '<script>alert("xss")</script>Practice',
            description: "Regular description",
          }
        )}
      />
    );
    expect(container.innerHTML).not.toContain("<script>");
  });

  it("shows AI provider in generation details", () => {
    render(<MissionReview data={makeReviewData()} />);
    expect(screen.getByText("pollinations")).toBeInTheDocument();
  });
});

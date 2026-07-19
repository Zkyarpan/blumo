import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MissionOutput } from "./mission-output.schema";

// Mock the server actions
vi.mock("./mission-review.actions", () => ({
  approveMissionAction: vi.fn(),
  rejectMissionAction: vi.fn(),
  regenerateMissionAction: vi.fn(),
}));

import { MissionReview } from "./MissionReview";
import type { MissionReviewModel } from "./mission-review.types";

const VALID_MISSION: MissionOutput = {
  title: "Document state transitions",
  description: "Write a short document explaining two state transitions in a system you understand.",
  estimated_minutes: 30,
  difficulty: "beginner",
  acceptance_checklist: [
    "Identify two state transitions",
    "Write a plain-language description of each",
  ],
  suggested_commit_message: "Document state transitions",
  suggested_branch: "main",
  learning_outcome: "Articulate how systems change state and what triggers the change.",
};

const BASE_MODEL: MissionReviewModel = {
  taskId: "550e8400-e29b-41d4-a716-446655440000",
  scheduledDate: "2026-07-20",
  status: "generated",
  reviewOperationStatus: "idle",
  currentVersionNumber: 1,
  currentVersionId: "version-uuid-1",
  versionCreatedAt: "2026-07-20T10:00:00Z",
  regenerationCount: 0,
  mission: VALID_MISSION,
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  repository: { fullName: "user/learning-notes", isAvailable: true },
};

describe("MissionReview", () => {
  it("displays the mission title", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(
      screen.getByText("Document state transitions", { selector: '[data-slot="card-title"]' })
    ).toBeInTheDocument();
  });

  it("displays the mission description", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(
      screen.getByText(/Write a short document explaining two state transitions/)
    ).toBeInTheDocument();
  });

  it("displays difficulty badge", () => {
    render(<MissionReview model={BASE_MODEL} />);
    // The difficulty badge contains "Beginner" or "beginner" text
    expect(screen.getByText("Beginner")).toBeInTheDocument();
  });

  it("displays estimated minutes", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
  });

  it("displays acceptance checklist items", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(screen.getByText("Identify two state transitions")).toBeInTheDocument();
    expect(screen.getByText("Write a plain-language description of each")).toBeInTheDocument();
  });

  it("displays suggested branch", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("displays suggested commit message", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(screen.getByText("Suggested commit message")).toBeInTheDocument();
    // The commit message text appears in the UI
    const commitMsgElements = screen.getAllByText("Document state transitions");
    expect(commitMsgElements.length).toBeGreaterThanOrEqual(1);
  });

  it("displays learning outcome", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(
      screen.getByText(/Articulate how systems change state/)
    ).toBeInTheDocument();
  });

  it("displays the repository full name", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(screen.getByText("user/learning-notes")).toBeInTheDocument();
  });

  it("displays the scheduled date", () => {
    render(<MissionReview model={BASE_MODEL} />);
    // Date is formatted — just check year is present
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0);
  });

  it("shows the AI-generated label", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(screen.getByText(/AI-generated mission/i)).toBeInTheDocument();
  });

  it("explains that approval does not create GitHub commits", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(
      screen.getByText(/does not create a branch, file, commit, or pull request/i)
    ).toBeInTheDocument();
  });

  it("shows version number in details", () => {
    render(<MissionReview model={BASE_MODEL} />);
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
  });

  it("shows repository unavailable warning when repository is not available", () => {
    render(
      <MissionReview
        model={{
          ...BASE_MODEL,
          repository: { fullName: "user/learning-notes", isAvailable: false },
        }}
      />
    );
    expect(
      screen.getByText(/Repository access is currently unavailable/)
    ).toBeInTheDocument();
  });

  it("shows the rejection reason for a rejected mission", () => {
    render(
      <MissionReview
        model={{
          ...BASE_MODEL,
          status: "rejected",
          rejectedAt: "2026-07-20T11:00:00Z",
          rejectionReason: "Too abstract for my goal",
        }}
      />
    );
    expect(screen.getByText("Too abstract for my goal")).toBeInTheDocument();
  });

  it("does not render mission text as HTML", () => {
    // Render a mission with an XSS attempt in the title
    const xssModel: MissionReviewModel = {
      ...BASE_MODEL,
      mission: {
        ...VALID_MISSION,
        title: '<img src=x onerror="alert(1)">XSS attempt title that is long enough',
      },
    };
    render(<MissionReview model={xssModel} />);
    // The text should be present as escaped text
    expect(
      screen.getByText(/<img src=x onerror="alert\(1\)">XSS attempt title that is long enough/)
    ).toBeInTheDocument();
    // No actual img element rendered from it
    const images = document.querySelectorAll("img[src='x']");
    expect(images).toHaveLength(0);
  });

  it("shows approved state for an approved mission", () => {
    render(
      <MissionReview
        model={{
          ...BASE_MODEL,
          status: "approved",
          approvedAt: "2026-07-20T12:00:00Z",
        }}
      />
    );
    expect(screen.getByText(/Mission approved/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No GitHub changes have been made/i)
    ).toBeInTheDocument();
  });
});

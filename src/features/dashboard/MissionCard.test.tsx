import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/missions/MissionGenerator", () => ({
  MissionGenerator: ({ retry = false }: { retry?: boolean }) => (
    <button>{retry ? "Try again" : "Generate today's mission"}</button>
  ),
}));

import { MissionCard } from "./MissionCard";

const GOAL = {
  id: "goal-1",
  title: "Learn React",
  technology: "React",
  task_type: "learning_note",
  daily_minutes: 30,
  status: "active",
  created_at: "2026-07-01T00:00:00Z",
};
const REPOSITORY = {
  id: "repo-1",
  name: "learning-notes",
  full_name: "user/learning-notes",
  default_branch: "main",
};

describe("MissionCard", () => {
  it("shows Generate today's mission only when prerequisites are ready and no mission exists", () => {
    render(
      <MissionCard
        activeGoal={GOAL}
        installationStatus="active"
        selectedRepository={REPOSITORY}
        todayMission={{ kind: "none" }}
      />
    );
    expect(
      screen.getByRole("button", { name: "Generate today's mission" })
    ).toBeInTheDocument();
  });

  it("renders every required saved mission field as escaped React text", () => {
    render(
      <MissionCard
        activeGoal={GOAL}
        installationStatus="active"
        selectedRepository={REPOSITORY}
        todayMission={{
          kind: "ready",
          taskId: "task-1",
          repositoryName: "learning-notes",
          status: "generated",
          mission: {
            title: "Practice state transitions",
            description: "Explain how state changes through two observable interactions.",
            estimated_minutes: 30,
            difficulty: "beginner",
            acceptance_checklist: [
              "Describe two observable state transitions",
              "Explain each expected result clearly",
            ],
            suggested_commit_message: "Document state transitions",
            suggested_branch: "main",
            learning_outcome: "Explain predictable state changes in plain language.",
          },
        }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Today's mission is ready");
    expect(screen.getByRole("heading", { name: "Practice state transitions" })).toBeInTheDocument();
    expect(screen.getByText(/Explain how state changes/)).toBeInTheDocument();
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
    expect(screen.getByText("beginner")).toBeInTheDocument();
    expect(screen.getByText("Describe two observable state transitions")).toBeInTheDocument();
    expect(screen.getByText("Document state transitions")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText(/Explain predictable state changes/)).toBeInTheDocument();
    expect(screen.getByText("learning-notes")).toBeInTheDocument();
  });

  it.each([
    [null, null, "Connect GitHub first", "/github/connect"],
    ["suspended", null, "GitHub access is suspended", "https://github.com/settings/installations"],
    ["uninstalled", null, "Reconnect the GitHub App", "/github/connect"],
    ["active", null, "Select an active repository", "/github/repositories"],
  ] as const)(
    "renders the prerequisite state for installation %s",
    (installationStatus, selectedRepository, title, href) => {
      render(
        <MissionCard
          activeGoal={GOAL}
          installationStatus={installationStatus}
          selectedRepository={selectedRepository}
          todayMission={{ kind: "none" }}
        />
      );
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByRole("link")).toHaveAttribute("href", href);
    }
  );

  it("shows the loading state without a second action for a generating row", () => {
    render(
      <MissionCard
        activeGoal={GOAL}
        installationStatus="active"
        selectedRepository={REPOSITORY}
        todayMission={{ kind: "generating", taskId: "task-1", generationAttempts: 1 }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Creating your mission");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GitHubConnectionCard } from "@/features/dashboard/GitHubConnectionCard";

describe("GitHubConnectionCard lifecycle states", () => {
  it("shows only an active accessible selected repository", () => {
    render(
      <GitHubConnectionCard
        installationStatus="active"
        selectedRepository={{
          id: "repo-1",
          full_name: "owner/repository",
          default_branch: "main",
        }}
      />
    );
    expect(screen.getByText("owner/repository")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage repositories" })).toHaveAttribute(
      "href",
      "/github/repositories"
    );
  });

  it("shows a suspended warning and GitHub manage-access action", () => {
    render(
      <GitHubConnectionCard installationStatus="suspended" selectedRepository={null} />
    );
    expect(screen.getByText("GitHub access suspended")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage GitHub access" })).toHaveAttribute(
      "href",
      "https://github.com/settings/installations"
    );
  });

  it("shows reconnect instead of a repository after uninstall", () => {
    render(
      <GitHubConnectionCard installationStatus="uninstalled" selectedRepository={null} />
    );
    expect(screen.queryByText("owner/repository")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect GitHub →" })).toHaveAttribute(
      "href",
      "/github/connect"
    );
  });

  it("defensively hides a stale selected repository unless the installation is active", () => {
    render(
      <GitHubConnectionCard
        installationStatus="suspended"
        selectedRepository={{
          id: "repo-1",
          full_name: "owner/stale-repository",
          default_branch: "main",
        }}
      />
    );
    expect(screen.queryByText("owner/stale-repository")).not.toBeInTheDocument();
    expect(screen.getByText("GitHub access suspended")).toBeInTheDocument();
  });
});

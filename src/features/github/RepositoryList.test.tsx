import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/features/github/select-repository.actions", () => ({
  selectRepositoryAction: vi.fn(),
}));

import { RepositoryList } from "@/features/github/RepositoryList";

const repository = {
  id: "repo-1",
  github_repository_id: 101,
  owner: "owner",
  name: "repository",
  full_name: "owner/repository",
  default_branch: "main",
  is_private: false,
  is_selected: false,
  access_status: "unavailable",
};

describe("RepositoryList lifecycle access", () => {
  it("preserves and displays unavailable repositories while suspension disables selection", () => {
    render(
      <RepositoryList
        repositories={[repository]}
        currentSelectionId={null}
        installationStatus="suspended"
      />
    );
    expect(screen.getByText("owner/repository")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" })).toBeDisabled();
  });

  it("renders removed history as inaccessible and unselectable", () => {
    render(
      <RepositoryList
        repositories={[{ ...repository, access_status: "removed" }]}
        currentSelectionId={null}
      />
    );
    expect(screen.getByText("Access removed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select" })).toBeDisabled();
  });
});

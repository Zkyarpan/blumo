import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("./mission-generation.actions", () => ({
  generateMissionAction: (...args: unknown[]) => actionMock(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { MissionGenerator } from "./MissionGenerator";

describe("MissionGenerator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMock.mockResolvedValue({
      ok: false,
      code: "temporarily_unavailable",
      retryable: true,
    });
  });

  it("shows the ready generation action without editable domain fields", () => {
    const { container } = render(
      <MissionGenerator goalTitle="Learn React" dailyMinutes={30} />
    );
    expect(
      screen.getByRole("button", { name: "Generate today's mission" })
    ).toBeEnabled();
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });

  it("disables the action and exposes an accessible skeleton while pending", async () => {
    actionMock.mockImplementation(() => new Promise(() => undefined));
    const { container } = render(
      <MissionGenerator goalTitle="Learn React" dailyMinutes={30} />
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate today's mission" })
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Creating your mission…")
    );
    expect(
      screen.getByRole("button", { name: "Creating your mission…" })
    ).toBeDisabled();
    expect(container.querySelector("[aria-busy='true']")).toHaveAttribute(
      "aria-busy",
      "true"
    );
  });

  it("shows a fixed safe retry error only below the attempt limit", () => {
    const { rerender } = render(
      <MissionGenerator
        retry
        initialErrorCode="unsafe_response"
        attempts={2}
        canRetry
        goalTitle="Learn React"
        dailyMinutes={30}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Blumo could not create a safe mission"
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();

    rerender(
      <MissionGenerator
        retry
        initialErrorCode="unsafe_response"
        attempts={3}
        canRetry={false}
        goalTitle="Learn React"
        dailyMinutes={30}
      />
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByText(/No more generation attempts/)).toBeInTheDocument();
  });

  it("does not offer retry for configuration failures", () => {
    render(
      <MissionGenerator
        retry
        initialErrorCode="configuration_error"
        attempts={1}
        canRetry={false}
        goalTitle="Learn React"
        dailyMinutes={30}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Mission generation is currently unavailable"
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/No more generation attempts/)
    ).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlumoWordmark } from "@/components/shared/BlumoWordmark";

describe("BlumoWordmark", () => {
  it("renders the brand name 'Blumo'", () => {
    render(<BlumoWordmark />);
    expect(screen.getByText("Blumo")).toBeInTheDocument();
  });

  it("applies the sm size class", () => {
    const { container } = render(<BlumoWordmark size="sm" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-lg");
  });

  it("applies the lg size class", () => {
    const { container } = render(<BlumoWordmark size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("text-2xl");
  });
});

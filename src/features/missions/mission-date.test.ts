import { describe, expect, it } from "vitest";
import { getUserLocalDate } from "./mission-date";

describe("getUserLocalDate", () => {
  it("handles both sides of UTC midnight", () => {
    const instant = new Date("2026-07-19T00:30:00.000Z");
    expect(getUserLocalDate(instant, "America/Los_Angeles")).toBe("2026-07-18");
    expect(getUserLocalDate(instant, "Asia/Tokyo")).toBe("2026-07-19");
  });

  it("uses the correct local calendar date across a daylight-saving transition", () => {
    expect(
      getUserLocalDate(new Date("2026-03-29T00:30:00.000Z"), "Europe/London")
    ).toBe("2026-03-29");
    expect(
      getUserLocalDate(new Date("2026-03-29T23:30:00.000Z"), "Europe/London")
    ).toBe("2026-03-30");
  });

  it("fails closed for an invalid stored timezone", () => {
    expect(getUserLocalDate(new Date(), "Not/A_Timezone")).toBeNull();
  });
});

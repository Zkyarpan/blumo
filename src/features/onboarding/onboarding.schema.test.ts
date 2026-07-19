import { describe, it, expect } from "vitest";
import { onboardingSchema } from "./onboarding.schema";

/** 201-character string — one above the max */
const LONG_TITLE = "a".repeat(201);
/** 4-character string — one below the min */
const SHORT_TITLE = "abcd";
/** Valid baseline input */
const VALID = {
  title: "Get a junior React developer job",
  technology: "React",
  experience_level: "beginner",
  daily_minutes: "30",
  task_type: "learning_note",
  timezone: "UTC",
};

describe("onboardingSchema", () => {
  it("1. parses successfully with all valid values", () => {
    const result = onboardingSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        title: VALID.title,
        technology: VALID.technology,
        experience_level: "beginner",
        daily_minutes: 30,
        task_type: "learning_note",
        timezone: "UTC",
      });
    }
  });

  it("2. fails when title is 4 characters (below minimum of 5)", () => {
    const result = onboardingSchema.safeParse({ ...VALID, title: SHORT_TITLE });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.title).toBeDefined();
    }
  });

  it("3. fails when title is 201 characters (above maximum of 200)", () => {
    const result = onboardingSchema.safeParse({ ...VALID, title: LONG_TITLE });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.title).toBeDefined();
    }
  });

  it("4. fails when experience_level is 'expert' (not in enum)", () => {
    const result = onboardingSchema.safeParse({
      ...VALID,
      experience_level: "expert",
    });
    expect(result.success).toBe(false);
  });

  it("5. succeeds when experience_level is 'beginner'", () => {
    const result = onboardingSchema.safeParse({
      ...VALID,
      experience_level: "beginner",
    });
    expect(result.success).toBe(true);
  });

  it("6. fails when daily_minutes is 15 (not in allowed set)", () => {
    const result = onboardingSchema.safeParse({
      ...VALID,
      daily_minutes: "15",
    });
    expect(result.success).toBe(false);
  });

  it("7. succeeds when daily_minutes is the string '30' and coerces to number 30", () => {
    const result = onboardingSchema.safeParse({ ...VALID, daily_minutes: "30" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.daily_minutes).toBe(30);
      expect(typeof result.data.daily_minutes).toBe("number");
    }
  });

  it("8. fails when task_type is 'unknown_type'", () => {
    const result = onboardingSchema.safeParse({
      ...VALID,
      task_type: "unknown_type",
    });
    expect(result.success).toBe(false);
  });

  it("9. fails when technology is empty string", () => {
    const result = onboardingSchema.safeParse({ ...VALID, technology: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.technology).toBeDefined();
    }
  });

  it("10. fails when timezone is empty string", () => {
    const result = onboardingSchema.safeParse({ ...VALID, timezone: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.timezone).toBeDefined();
    }
  });
});

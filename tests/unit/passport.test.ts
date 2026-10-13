import { describe, expect, it } from "vitest";
import { passportSchema, savePassportSchema } from "@/features/learner-passport/schema";

const input = {
  display_name: " David ",
  entry_state: "returning",
  desired_skill: " JavaScript ",
  target_role: "",
  motivation: "",
  study_minutes_per_week: 90,
  device: "phone",
  bandwidth: "limited",
  locale: "en",
};

describe("learner-editable Passport input", () => {
  it("normalizes optional text without inventing context", () => {
    expect(passportSchema.parse(input)).toMatchObject({
      display_name: "David",
      desired_skill: "JavaScript",
      target_role: null,
      motivation: null,
    });
  });
  it.each(["starting", "active", "returning", "opportunity_seeking"])(
    "supports the %s entry state",
    (entry_state) => {
      expect(passportSchema.safeParse({ ...input, entry_state }).success).toBe(true);
    },
  );
  it("allows learners to leave constraints unspecified", () => {
    expect(
      passportSchema.safeParse({
        ...input,
        display_name: null,
        study_minutes_per_week: null,
        device: null,
        bandwidth: null,
      }).success,
    ).toBe(true);
  });
  it.each([
    { user_id: crypto.randomUUID() },
    { status: "demonstrated" },
    { evidence: [{ outcome: "passed" }] },
  ])("rejects authorization and assessment fields %j", (extra) => {
    expect(passportSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it.each([0, -1, 14, 2401, 30.5, "90"])("rejects invalid weekly minutes %s", (minutes) => {
    expect(passportSchema.safeParse({ ...input, study_minutes_per_week: minutes }).success).toBe(
      false,
    );
  });
  it("requires a bounded, meaningful goal", () => {
    expect(passportSchema.safeParse({ ...input, desired_skill: " " }).success).toBe(false);
    expect(passportSchema.safeParse({ ...input, motivation: "x".repeat(501) }).success).toBe(false);
  });
  it("requires a valid retry identifier and rejects unknown envelope fields", () => {
    expect(savePassportSchema.safeParse({ passport: input, requestId: "not-a-uuid" }).success).toBe(
      false,
    );
    expect(
      savePassportSchema.safeParse({
        passport: input,
        requestId: crypto.randomUUID(),
        userId: "other",
      }).success,
    ).toBe(false);
  });
});

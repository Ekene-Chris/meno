import { describe, expect, it } from "vitest";
import { compareRequirement, gapAction } from "@/features/opportunities/comparison";
import {
  opportunitySchema,
  opportunityRequirementSchema,
  opportunityObservationSchema,
} from "@/features/opportunities/schema";
import catalog from "@/features/opportunities/catalog.json";
const entry = catalog[0];
const guided = opportunityRequirementSchema.parse(
  entry.requirements.find((r) => r.id === "promise-preparation"),
);
const independent = opportunityRequirementSchema.parse(
  entry.requirements.find((r) => r.id === "promises-project"),
);
const obs = (extra: Record<string, unknown> = {}) =>
  opportunityObservationSchema.parse({
    skillId: "js.promises",
    status: "demonstrated",
    evidenceId: crypto.randomUUID(),
    kind: "practical_task",
    method: "guided_scaffold",
    outcome: "meets_criteria",
    scope: "Guided scaffold: fixed choices and trace",
    rubricVersion: "guided-api-rubric-v1",
    sourceId: crypto.randomUUID(),
    attemptId: crypto.randomUUID(),
    evaluatedAt: new Date().toISOString(),
    ...extra,
  });
describe("transparent example requirement comparisons", () => {
  it("changes guided preparation while independent project proof stays missing", () => {
    const observation = obs();
    expect(compareRequirement(guided, [observation])).toMatchObject({
      state: "guided_preparation",
      met: true,
    });
    expect(compareRequirement(independent, [observation])).toMatchObject({
      state: "independent_needed",
      met: false,
    });
  });
  it("keeps unknown, self-report and inference separate from observed gaps", () => {
    expect(compareRequirement(guided, []).state).toBe("unknown");
    for (const kind of ["self_report", "ai_inference"])
      expect(compareRequirement(guided, [obs({ kind })]).met).toBe(false);
    expect(
      compareRequirement(guided, [obs({ status: "needs_review", outcome: "needs_practice" })])
        .state,
    ).toBe("observed_gap");
  });
  it("does not treat quiz answers as independent or guided construction", () => {
    const quiz = obs({ kind: "quiz", method: null });
    expect(compareRequirement(independent, [quiz]).met).toBe(false);
    expect(compareRequirement(guided, [quiz]).met).toBe(false);
  });
  it("allows scoped independent evidence while retaining limits and missing scope", () => {
    const project = obs({ kind: "externally_verified_project", method: null });
    expect(compareRequirement(independent, [project])).toMatchObject({
      state: "scoped_evidence",
      met: true,
    });
    expect(
      compareRequirement(independent, [obs({ kind: "practical_task", method: null, scope: null })])
        .met,
    ).toBe(false);
  });
  it("leaves unrelated requirements unchanged after a promise observation", () => {
    const git = opportunityRequirementSchema.parse(
      entry.requirements.find((r) => r.skillId === "git.basics"),
    );
    expect(compareRequirement(git, [])).toEqual(compareRequirement(git, [obs()]));
  });
  it("rejects fabricated application/source metadata and verification claims", () => {
    const { requirements, ...record } = entry;
    expect(opportunitySchema.safeParse(record).success).toBe(true);
    for (const bad of [
      { ...record, isDemo: false },
      { ...record, verification: "verified" },
      { ...record, applicationUrl: "https://fake.example/apply" },
      { ...record, sourceUrl: "https://fake.example" },
      { ...record, deadline: "2026-10-14" },
    ])
      expect(opportunitySchema.safeParse(bad).success).toBe(false);
    expect(requirements.every((r) => r.priority === "required" || r.priority === "preferred")).toBe(
      true,
    );
  });
  it("connects a gap to an honest bounded activity instead of changing the plan", () => {
    expect(gapAction("web.fetch-api").href).toBe("/practice?session=fetch");
    expect(gapAction("js.functions").href).toBe("/assessment");
    expect(gapAction("git.basics").href).toBe("/mentor");
  });
});

import { describe, expect, it } from "vitest";
import {
  recordPracticalSchema,
  practicalProgressSchema,
} from "@/features/assessment/practical-progress-schema";
const finding = (skillId: string) => ({
  skillId,
  scope: "Guided fixed scaffold only",
  status: "demonstrated",
  observedCount: 4,
  metCount: 4,
  criterionCount: 4,
  evidenceId: crypto.randomUUID(),
  summaryUpdated: true,
  preservationReason: "updated",
});
const valid = () => ({
  assessmentId: crypto.randomUUID(),
  attemptId: crypto.randomUUID(),
  policyVersion: "guided-progress-v1",
  method: "guided_scaffold",
  recordedAt: new Date().toISOString(),
  exerciseStatus: "guided_complete",
  acceptedTaskCompleted: false,
  findings: [finding("js.promises"), finding("web.fetch-api"), finding("web.dom")],
  nextAction: {
    kind: "independent_practice",
    skillId: "js.promises",
    title: "Try without the scaffold",
    reason: "Fixed guided choices were observed; independent code remains unverified.",
    steps: ["Draft one example"],
    limitations: ["This is a suggestion, not an activated plan."],
  },
});
describe("bounded guided evidence contracts", () => {
  it("accepts a request containing only receipt identity and the saved source hash", () => {
    const request = { requestId: crypto.randomUUID(), contentHash: "a".repeat(64) };
    expect(recordPracticalSchema.parse(request)).toEqual(request);
    for (const extra of [
      { userId: crypto.randomUUID() },
      { status: "demonstrated" },
      { feedback: { outcome: "pass" } },
    ])
      expect(recordPracticalSchema.safeParse({ ...request, ...extra }).success).toBe(false);
  });
  it("prevents incomplete and unobserved findings from claiming demonstration", () => {
    const result = valid();
    expect(practicalProgressSchema.safeParse(result).success).toBe(true);
    expect(
      practicalProgressSchema.safeParse({
        ...result,
        findings: [
          { ...result.findings[0], observedCount: 3, metCount: 3 },
          ...result.findings.slice(1),
        ],
      }).success,
    ).toBe(false);
    expect(
      practicalProgressSchema.safeParse({
        ...result,
        exerciseStatus: "inconclusive",
        findings: [
          {
            ...result.findings[0],
            status: "not_assessed",
            observedCount: 0,
            metCount: 0,
            evidenceId: null,
            summaryUpdated: false,
          },
          ...result.findings.slice(1),
        ],
      }).success,
    ).toBe(true);
  });
  it("rejects invented or duplicated shared skills and evidence-less summary updates", () => {
    const result = valid();
    for (const first of [
      { ...result.findings[0], skillId: "git.basics" },
      { ...result.findings[1] },
      { ...result.findings[0], evidenceId: null },
    ])
      expect(
        practicalProgressSchema.safeParse({
          ...result,
          findings: [first, ...result.findings.slice(1)],
        }).success,
      ).toBe(false);
  });
  it("requires guided-method disclosure and keeps accepted-task completion separate", () => {
    const result = valid();
    expect(
      practicalProgressSchema.safeParse({ ...result, method: "independent_project" }).success,
    ).toBe(false);
    expect(
      practicalProgressSchema.safeParse({ ...result, acceptedTaskCompleted: true }).success,
    ).toBe(false);
  });
});

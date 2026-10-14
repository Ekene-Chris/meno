import { z } from "zod";
const practicalId = z.uuid().transform((id) => id.toLowerCase());
export const recordPracticalSchema = z.strictObject({
  requestId: practicalId,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const practicalProgressSchema = z
  .strictObject({
    assessmentId: practicalId,
    attemptId: practicalId,
    policyVersion: z.literal("guided-progress-v1"),
    method: z.literal("guided_scaffold"),
    recordedAt: z.string(),
    exerciseStatus: z.enum(["guided_complete", "needs_review", "inconclusive"]),
    acceptedTaskCompleted: z.literal(false),
    findings: z
      .array(
        z
          .strictObject({
            skillId: z.enum(["js.promises", "web.fetch-api", "web.dom"]),
            scope: z.string().min(1).max(400),
            status: z.enum(["not_assessed", "learning", "needs_review", "demonstrated"]),
            observedCount: z.number().int().min(0).max(4),
            metCount: z.number().int().min(0).max(4),
            criterionCount: z.literal(4),
            evidenceId: practicalId.nullable(),
            summaryUpdated: z.boolean(),
            preservationReason: z.enum([
              "updated",
              "unobserved",
              "complete_prior_observation",
              "stronger_or_different_scope",
              "newer_observation",
            ]),
          })
          .refine((f) => {
            const expected =
              f.observedCount === 0
                ? "not_assessed"
                : f.metCount < f.observedCount
                  ? "needs_review"
                  : f.observedCount === 4
                    ? "demonstrated"
                    : "learning";
            return (
              f.metCount <= f.observedCount &&
              f.status === expected &&
              (f.evidenceId === null) === (f.observedCount === 0) &&
              (!f.summaryUpdated || f.evidenceId !== null)
            );
          }, "Finding exceeds observed criteria"),
      )
      .length(3)
      .refine((rows) => new Set(rows.map((f) => f.skillId)).size === 3),
    nextAction: z.strictObject({
      kind: z.enum(["independent_practice", "review_gap", "finish_guided", "mentor_help"]),
      skillId: z.enum(["js.promises", "web.fetch-api", "web.dom"]).nullable(),
      title: z.string().min(1).max(160),
      reason: z.string().min(1).max(600),
      steps: z.array(z.string().min(1).max(600)).min(1).max(3),
      limitations: z.array(z.string().min(1).max(600)).min(1).max(4),
    }),
  })
  .refine((result) => {
    const missing = result.findings.some((f) => f.observedCount < 4);
    const gap = result.findings.some((f) => f.metCount < f.observedCount);
    return (
      result.exerciseStatus ===
      (missing ? "inconclusive" : gap ? "needs_review" : "guided_complete")
    );
  }, "Exercise result exceeds observed work");
export type PracticalProgress = z.infer<typeof practicalProgressSchema>;

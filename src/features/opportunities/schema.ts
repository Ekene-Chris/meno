import { z } from "zod";
export const opportunityIdSchema = z.string().regex(/^demo-[a-z0-9-]{1,75}$/);
export const opportunityRequirementSchema = z.strictObject({
  id: z.string().min(1).max(80),
  skillId: z.string().min(1).max(80),
  priority: z.enum(["required", "preferred"]),
  evidenceLevel: z.enum(["guided_foundation", "independent_project"]),
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(600),
});
export const opportunitySchema = z.strictObject({
  id: opportunityIdSchema,
  title: z.string().min(1).max(160),
  kind: z.enum(["portfolio", "apprenticeship", "community"]),
  description: z.string().min(1).max(1000),
  organization: z.literal("Meno fictional scenario"),
  verification: z.literal("demo"),
  isDemo: z.literal(true),
  sourceUrl: z.null(),
  applicationUrl: z.null(),
  deadline: z.null(),
  location: z.null(),
  eligibility: z.array(z.string().max(600)).min(1).max(6),
});
export const opportunityObservationSchema = z.strictObject({
  skillId: z.string(),
  status: z.enum(["not_assessed", "learning", "needs_review", "demonstrated"]),
  evidenceId: z.uuid().nullable(),
  kind: z
    .enum(["self_report", "quiz", "practical_task", "externally_verified_project", "ai_inference"])
    .nullable(),
  method: z.literal("guided_scaffold").nullable(),
  outcome: z.enum(["observed", "meets_criteria", "needs_practice", "inconclusive"]).nullable(),
  scope: z.string().max(400).nullable(),
  rubricVersion: z.string().nullable(),
  sourceId: z.string().nullable(),
  attemptId: z.uuid().nullable(),
  evaluatedAt: z.string().nullable(),
});
export const opportunityEntrySchema = z.strictObject({
  opportunity: opportunitySchema,
  requirements: z.array(opportunityRequirementSchema).min(1).max(12),
  observations: z.array(opportunityObservationSchema).max(12),
  saved: z
    .strictObject({ savedAt: z.string(), baseline: z.array(opportunityObservationSchema).max(12) })
    .nullable(),
});
export const opportunityRadarSchema = z.array(opportunityEntrySchema).max(20);
export const saveOpportunitySchema = z
  .strictObject({
    requestId: z.uuid().transform((v) => v.toLowerCase()),
    expectedSaved: z.boolean(),
    saved: z.boolean(),
  })
  .refine((v) => v.expectedSaved !== v.saved, "Choose a change");
export type OpportunityRequirement = z.infer<typeof opportunityRequirementSchema>;
export type OpportunityObservation = z.infer<typeof opportunityObservationSchema>;
export type OpportunityEntry = z.infer<typeof opportunityEntrySchema>;
export const savedReceiptSchema = z.strictObject({
  opportunityId: opportunityIdSchema,
  saved: z.boolean(),
});

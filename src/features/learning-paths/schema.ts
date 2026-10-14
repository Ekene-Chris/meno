import { z } from "zod";

export const pathIdSchema = z.uuid().transform((value) => value.toLowerCase());
export const proposePathSchema = z.strictObject({
  requestId: pathIdSchema,
  expectedRevision: z.number().int().min(0).max(2147483646),
  courseId: pathIdSchema.nullable(),
});
export const pathQuerySchema = z.strictObject({ courseId: pathIdSchema.optional() });
const text = (max: number) => z.string().trim().min(1).max(max);
const skillId = text(80);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const resourceSchema = z.strictObject({
  id: text(80),
  skillId,
  title: text(160),
  sourceUrl: z.url().startsWith("https://developer.mozilla.org/en-US/docs/"),
  provider: z.literal("MDN"),
  language: z.literal("en"),
  format: z.literal("text"),
  dataCost: z.literal("unknown"),
  durationMinutes: z.null(),
  checkedAt: date,
  reviewAfter: date,
});
export const pathContextSchema = z.strictObject({
  goal: z.strictObject({
    id: pathIdSchema,
    desiredSkill: text(120),
    targetRole: text(120).nullable(),
  }),
  learner: z.strictObject({
    entryState: z.enum(["starting", "active", "returning", "opportunity_seeking"]),
    studyMinutesPerWeek: z.number().int().min(15).max(2400).nullable(),
    device: z.enum(["phone", "computer", "shared"]).nullable(),
    bandwidth: z.enum(["limited", "reliable"]).nullable(),
    locale: z.enum(["en", "fr", "pt", "ar"]),
  }),
  skills: z
    .array(
      z.strictObject({
        id: skillId,
        name: text(160),
        position: z.number().int(),
        status: z.enum(["not_assessed", "learning", "needs_review", "demonstrated"]),
        evidence: z
          .strictObject({
            id: pathIdSchema,
            kind: z.enum([
              "self_report",
              "quiz",
              "practical_task",
              "externally_verified_project",
              "ai_inference",
            ]),
            outcome: z.enum(["observed", "meets_criteria", "needs_practice", "inconclusive"]),
            scope: text(400).nullable(),
            rubricVersion: text(120).nullable(),
            attemptId: pathIdSchema.nullable(),
            method: z.literal("guided_scaffold").optional(),
          })
          .nullable(),
      }),
    )
    .max(50),
  prerequisites: z.array(z.strictObject({ skillId, prerequisiteSkillId: skillId })).max(100),
  course: z
    .strictObject({
      id: pathIdSchema,
      revision: z.number().int().positive(),
      title: text(160),
      checkpointModuleId: pathIdSchema.nullable(),
      modules: z
        .array(
          z.strictObject({
            id: pathIdSchema,
            title: text(160),
            position: z.number().int().min(0).max(29),
            skillIds: z.array(skillId).max(10),
          }),
        )
        .max(30),
    })
    .nullable(),
  resources: z.array(resourceSchema).max(50),
});
export const pathContextEnvelopeSchema = z.strictObject({
  context: pathContextSchema,
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  pathId: pathIdSchema.nullable(),
  revision: z.number().int().min(0),
  activeRevision: z.number().int().positive().nullable(),
});
export const proposalSchema = z.strictObject({
  policyVersion: z.literal("recovery-v1"),
  skillId,
  mode: z.enum(["start", "review", "practice"]),
  title: text(160),
  estimatedMinutes: z.union([z.literal(5), z.literal(15), z.literal(25)]),
  steps: z.array(text(400)).min(2).max(4),
  reasons: z.array(text(600)).min(1).max(5),
  basis: z.strictObject({
    category: z.enum([
      "observed_gap",
      "prerequisite_review",
      "incomplete_observation",
      "unassessed_start",
      "course_continuation",
      "practical_extension",
    ]),
    evidenceIds: z.array(pathIdSchema).max(50),
    preservedSkills: z.array(skillId).max(50),
    unknownPrerequisites: z.array(skillId).max(50),
  }),
  resource: resourceSchema,
  courseAnchor: z
    .strictObject({
      courseId: pathIdSchema,
      revision: z.number().int().positive(),
      moduleId: pathIdSchema,
      moduleTitle: text(160),
      relationship: z.enum(["checkpoint", "earlier", "later", "mapped_topic"]),
    })
    .nullable(),
  demoConnection: z
    .strictObject({
      fixtureId: z.literal("demo-frontend-api-v1"),
      label: z.literal("DEMO — NOT A LIVE LISTING"),
      statement: text(400),
    })
    .nullable(),
  limitations: z.array(text(600)).min(2).max(6),
});
export const pathReceiptSchema = z.strictObject({
  pathId: pathIdSchema,
  proposalId: pathIdSchema,
  revision: z.number().int().positive(),
});
export type PathContext = z.infer<typeof pathContextSchema>;
export type PathProposal = z.infer<typeof proposalSchema>;
export type ProposePathInput = z.infer<typeof proposePathSchema>;

export const pathAdjustmentSchema = z.strictObject({
  title: text(160),
  estimatedMinutes: z.union([z.literal(5), z.literal(15), z.literal(25)]),
  steps: z.array(text(400)).min(2).max(4),
});
const reviewBase = {
  requestId: pathIdSchema,
  expectedRevision: z.number().int().min(1).max(2147483646),
};
export const reviewPathSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...reviewBase, operation: z.literal("edit"), adjustment: pathAdjustmentSchema }),
  z.strictObject({ ...reviewBase, operation: z.enum(["accept", "decline"]) }),
]);
export const pathDecisionReceiptSchema = pathReceiptSchema.extend({
  decision: z.enum(["accepted", "declined"]),
});
export const reviewReceiptSchema = z.union([pathDecisionReceiptSchema, pathReceiptSchema]);
export const reviewQuerySchema = z.strictObject({
  courseId: z.union([pathIdSchema, z.literal("none")]).optional(),
  before: z.coerce.number().int().positive().optional(),
});
export const reviewedProposalSchema = z.strictObject({
  checkIn: z
    .strictObject({
      id: pathIdSchema,
      source: z.enum(["user_report", "demo_pause"]),
      obstacle: z.enum(["time", "confused", "access", "returning"]),
      createdAt: z.string(),
    })
    .nullable()
    .optional(),
  id: pathIdSchema,
  pathId: pathIdSchema,
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  context: pathContextSchema,
  proposal: proposalSchema,
  editedFrom: pathIdSchema.nullable(),
  decision: z.enum(["accepted", "declined"]).nullable(),
});
export const pathReviewSchema = z.strictObject({
  pathId: pathIdSchema.nullable(),
  revision: z.number().int().min(0),
  activeRevision: z.number().int().positive().nullable(),
  latest: reviewedProposalSchema.nullable(),
  active: reviewedProposalSchema.nullable(),
  history: z.array(reviewedProposalSchema).max(20),
  courseId: pathIdSchema.nullable(),
  contextAvailable: z.boolean(),
  contextCurrent: z.boolean(),
});
export type PathAdjustment = z.infer<typeof pathAdjustmentSchema>;
export type ReviewPathInput = z.infer<typeof reviewPathSchema>;
export type PathReview = z.infer<typeof pathReviewSchema>;
export type ReviewedProposal = z.infer<typeof reviewedProposalSchema>;

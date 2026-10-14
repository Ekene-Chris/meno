import { z } from "zod";
import { practicalProgressSchema, type PracticalProgress } from "./practical-progress-schema";
export const practicalId = z.uuid().transform((id) => id.toLowerCase());
export const practicalInputSchema = z
  .strictObject({
    mode: z.enum(["guided", "open"]),
    choices: z
      .record(z.string().min(1).max(80), z.string().min(1).max(80))
      .refine((v) => Object.keys(v).length <= 12),
    code: z.string().max(12000),
    reflection: z.string().max(2000),
  })
  .refine(
    (v) => v.mode !== "open" || Object.keys(v.choices).length === 0,
    "Open work cannot include guided choices",
  );
export const emptyPracticalInput = {
  mode: "guided" as const,
  choices: {},
  code: "",
  reflection: "",
};
export const practicalStartSchema = z.strictObject({ requestId: practicalId });
export const practicalMutationSchema = z.strictObject({
  requestId: practicalId,
  expectedRevision: z.number().int().min(1).max(2147483646),
  operation: z.enum(["save", "submit"]),
  input: practicalInputSchema,
});
const slotSchema = z.strictObject({
  id: z.string(),
  label: z.string(),
  skillId: z.string(),
  scope: z.string(),
  options: z.array(z.strictObject({ id: z.string(), text: z.string() })).length(3),
});
export const practicalContentSchema = z.strictObject({
  id: z.string(),
  rubricVersion: z.string(),
  title: z.string(),
  description: z.string(),
  sessions: z
    .array(
      z.strictObject({
        id: z.string(),
        title: z.string(),
        intro: z.string(),
        template: z.string(),
        slots: z.array(slotSchema).length(4),
      }),
    )
    .length(3),
  limitations: z.array(z.string()),
});
export const practicalFeedbackSchema = z.strictObject({
  rubricVersion: z.string(),
  outcome: z.enum(["meets_guided_rubric", "needs_review", "inconclusive"]),
  criteria: z
    .array(
      z.strictObject({
        id: z.string(),
        skillId: z.string(),
        scope: z.string(),
        status: z.enum(["met", "needs_review", "inconclusive"]),
        observedChoiceId: z.string().nullable(),
        feedback: z.string().max(600),
      }),
    )
    .length(12),
  limitations: z.array(z.string()).min(1).max(6),
});
export const practicalReceiptSchema = z.strictObject({
  attemptId: practicalId,
  revision: z.number().int().positive(),
  status: z.enum(["draft", "submitted"]),
});
export const practicalPageSchema = z.strictObject({
  session: z.enum(["promises", "fetch", "display"]).optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PracticalInput = z.infer<typeof practicalInputSchema>;
export type PracticalFeedback = z.infer<typeof practicalFeedbackSchema>;
export type PracticalContent = z.infer<typeof practicalContentSchema>;
export type PracticalAttempt = {
  id: string;
  revision: number;
  status: "draft" | "submitted";
  input: PracticalInput;
  feedback: PracticalFeedback | null;
  content: PracticalContent;
  contentHash: string;
  goalId: string;
  acceptedProposalId: string | null;
  createdAt: string;
  submittedAt: string | null;
  progress: PracticalProgress | null;
};
export function validatePracticalChoices(input: PracticalInput, content: PracticalContent) {
  const slots = content.sessions.flatMap((s) => s.slots);
  for (const [id, choice] of Object.entries(input.choices)) {
    if (!slots.find((s) => s.id === id)?.options.some((o) => o.id === choice))
      throw new Error("Unknown practical choice");
  }
  return input;
}
export const practicalAttemptSchema = z.strictObject({
  id: practicalId,
  revision: z.number().int().positive(),
  status: z.enum(["draft", "submitted"]),
  input: practicalInputSchema,
  feedback: practicalFeedbackSchema.nullable(),
  content: practicalContentSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  goalId: practicalId,
  acceptedProposalId: practicalId.nullable(),
  createdAt: z.string(),
  submittedAt: z.string().nullable(),
  progress: practicalProgressSchema.nullable(),
});

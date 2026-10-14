import { z } from "zod";
import { diagnosticAnswerSchema } from "./diagnostic-schema";

export const attemptIdSchema = z.uuid().transform((value) => value.toLowerCase());
export const startAttemptSchema = z.strictObject({ requestId: attemptIdSchema });
export const listAttemptsSchema = z.strictObject({
  page: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .pipe(z.number().max(1000))
    .optional()
    .default(0),
});
export const attemptMutationSchema = startAttemptSchema.extend({
  expectedRevision: z.number().int().min(1).max(2147483646),
});
export const saveAnswersSchema = attemptMutationSchema.extend({
  answers: z.array(diagnosticAnswerSchema).max(8),
});
export const attemptReceiptSchema = z.strictObject({
  attemptId: attemptIdSchema,
  revision: z.number().int().positive(),
  status: z.enum(["in_progress", "evaluated"]),
});
export const publicDiagnosticSchema = z.strictObject({
  version: z.literal("javascript-foundations-v1"),
  title: z.string(),
  introduction: z.string(),
  limitations: z.string(),
  questions: z
    .array(
      z.strictObject({
        id: z.string(),
        skillId: z.string(),
        prompt: z.string(),
        code: z.string().nullable(),
        selection: z.enum(["single", "multiple"]),
        choices: z.array(z.strictObject({ id: z.string(), label: z.string() })),
      }),
    )
    .length(8),
});
export const diagnosticEvaluationSchema = z.strictObject({
  version: z.literal("javascript-foundations-v1"),
  rubricVersion: z.literal("objective-subset-v1"),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  observations: z
    .array(
      z.strictObject({
        questionId: z.string(),
        skillId: z.string(),
        outcome: z.enum(["correct", "incorrect", "partial", "skipped"]),
        earnedPoints: z.number().min(0).max(1).nullable(),
        explanation: z.string().nullable(),
      }),
    )
    .length(8),
  findings: z
    .array(
      z.strictObject({
        skillId: z.string(),
        scope: z.string(),
        status: z.enum(["not_assessed", "learning", "needs_review", "demonstrated"]),
        answeredCount: z.number().int().min(0).max(2),
        questionCount: z.literal(2),
        earnedPoints: z.number().min(0).max(2),
        possiblePoints: z.literal(2),
        rationale: z.string(),
        evidenceId: attemptIdSchema.nullable(),
        summaryUpdated: z.boolean(),
      }),
    )
    .length(4),
  limitations: z.array(z.string()).min(1).max(5),
});
export type AttemptAnswer = z.infer<typeof diagnosticAnswerSchema>;
export type PublicDiagnostic = z.infer<typeof publicDiagnosticSchema>;
export type DiagnosticEvaluation = z.infer<typeof diagnosticEvaluationSchema>;
export type DiagnosticAttempt = {
  id: string;
  revision: number;
  status: "in_progress" | "evaluated";
  createdAt: string;
  updatedAt: string;
  evaluatedAt: string | null;
  diagnostic: PublicDiagnostic;
  answers: AttemptAnswer[];
  evaluation: DiagnosticEvaluation | null;
};

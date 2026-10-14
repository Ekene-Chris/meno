import { z } from "zod";

export const diagnosticAnswerSchema = z.strictObject({
  questionId: z.string().min(1).max(80),
  choiceIds: z.array(z.string().min(1).max(40)).min(1).max(4).nullable(),
});
export const diagnosticSubmissionSchema = z.strictObject({
  version: z.literal("javascript-foundations-v1"),
  answers: z.array(diagnosticAnswerSchema).length(8),
});
export type DiagnosticSubmission = z.infer<typeof diagnosticSubmissionSchema>;
export type DiagnosticQuestion = {
  id: string;
  skillId: string;
  prompt: string;
  code: string | null;
  selection: "single" | "multiple";
  choices: { id: string; label: string }[];
};

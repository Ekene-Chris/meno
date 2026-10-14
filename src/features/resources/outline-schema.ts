import { z } from "zod";
import { courseIdSchema } from "./course-schema";
import { extractionResultSchema } from "@/lib/ai/extraction-schema";

export const outlineRequestSchema = z
  .strictObject({
    requestId: courseIdSchema,
    courseId: courseIdSchema.nullable(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    expectedConfirmedRevision: z.number().int().positive().nullable(),
    title: z.string().trim().min(2).max(160),
    outline: z.string().trim().min(20).max(12000),
  })
  .superRefine((value, ctx) => {
    if (
      (value.courseId === null) !== (value.expectedRevision === 0) ||
      (!value.courseId && value.expectedConfirmedRevision !== null) ||
      new TextEncoder().encode(value.outline).byteLength > 24 * 1024
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Check the saved course version and shorten the outline.",
      });
    }
  });
export const outlineResponseSchema = z.strictObject({
  requestId: courseIdSchema,
  result: extractionResultSchema,
});
export type OutlineRequest = z.infer<typeof outlineRequestSchema>;

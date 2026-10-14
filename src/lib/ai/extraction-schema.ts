import { z } from "zod";

// One shape is shared by the provider schema, runtime validation, and review UI.
function proposalSchema(skill: z.ZodType<string | null>) {
  return z.strictObject({
    modules: z
      .array(
        z.strictObject({
          title: z.string().min(1).max(160),
          topics: z
            .array(
              z.strictObject({
                label: z.string().min(1).max(120),
                skill_id: skill,
                mapping: z.enum(["suggested", "uncertain", "unmapped"]),
              }),
            )
            .min(1)
            .max(10),
        }),
      )
      .max(20),
  });
}
export const extractionResultSchema = proposalSchema(z.string().min(1).max(100).nullable());
export function extractionSchema(skillIds: string[]) {
  if (!skillIds.length) throw new Error("A known catalog is required");
  return proposalSchema(z.enum(skillIds as [string, ...string[]]).nullable());
}
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export function validateExtraction(value: unknown, skillIds: string[]) {
  const result = extractionSchema(skillIds).parse(value);
  for (const module of result.modules) {
    if (!module.title.trim()) throw new Error("Empty module");
    for (const topic of module.topics) {
      if (!topic.label.trim() || (topic.skill_id === null) !== (topic.mapping === "unmapped")) {
        throw new Error("Invalid mapping");
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 24 * 1024)
    throw new Error("Large proposal");
  return result;
}

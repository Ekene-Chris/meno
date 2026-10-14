import { z } from "zod";
import { pathContextSchema, pathIdSchema, proposalSchema } from "@/features/learning-paths/schema";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const mentorInputSchema = z.strictObject({
  requestId: pathIdSchema,
  question: z.string().trim().min(1).max(2000),
  courseId: pathIdSchema.nullable(),
  expectedContextHash: hash,
});
export const mentorContextSchema = z.strictObject({
  learning: pathContextSchema,
  learningContextHash: hash,
  acceptedStep: z
    .strictObject({
      id: pathIdSchema,
      revision: z.number().int().positive(),
      contextHash: hash,
      courseId: pathIdSchema.nullable(),
      proposal: proposalSchema,
    })
    .nullable(),
  recentConversation: z
    .array(z.strictObject({ question: z.string().max(2000), reply: z.string().max(1600) }))
    .max(3),
  recentEvents: z.array(z.strictObject({ type: z.string().max(80), at: z.string() })).max(5),
});
export const mentorEnvelopeSchema = z.strictObject({
  context: mentorContextSchema,
  contextHash: hash,
  courseId: pathIdSchema.nullable(),
});
export const mentorReplySchema = z.strictObject({
  action: z.enum(["explain", "clarify", "recommend_resource"]),
  reply: z.string().min(1).max(3000),
  rationale: z.string().min(1).max(600),
  resourceIds: z.array(z.string().min(1).max(80)).max(3),
  skillIds: z.array(z.string().min(1).max(80)).max(3),
  evidenceIds: z.array(z.uuid()).max(5),
  limitations: z.array(z.string().min(1).max(400)).min(1).max(4),
});
export type MentorContext = z.infer<typeof mentorContextSchema>;
export type MentorInput = z.infer<typeof mentorInputSchema>;
export type MentorReply = z.infer<typeof mentorReplySchema>;
export function validateMentorReply(value: unknown, context: MentorContext) {
  const reply = mentorReplySchema.parse(value);
  if ([reply.reply, reply.rationale, ...reply.limitations].some((text) => !text.trim()))
    throw new Error("Empty mentor explanation");
  const resources = context.learning.resources.map((r) => r.id);
  const skills = context.learning.skills.map((s) => s.id);
  const evidence = context.learning.skills.flatMap((s) =>
    s.evidence &&
    ["quiz", "practical_task", "externally_verified_project"].includes(s.evidence.kind)
      ? [s.evidence.id]
      : [],
  );
  for (const [ids, available] of [
    [reply.resourceIds, resources],
    [reply.skillIds, skills],
    [reply.evidenceIds, evidence],
  ]) {
    if (new Set(ids).size !== ids.length || ids.some((id) => !available.includes(id)))
      throw new Error("Unknown or duplicate mentor reference");
  }
  if (
    /(?:https?:\/\/|www\.)/i.test([reply.reply, reply.rationale, ...reply.limitations].join("\n"))
  )
    throw new Error("Model-supplied URLs are not allowed");
  return reply;
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";
import { createTrustedDb } from "@/lib/db/trusted";
import { AppError } from "@/lib/http";
import { explainToLearner, getMentorConfig, mentorError } from "./mentor-provider";
import {
  mentorContextSchema,
  mentorEnvelopeSchema,
  validateMentorReply,
  type MentorContext,
  type MentorInput,
} from "@/features/momentum/mentor-schema";

type Db = SupabaseClient<Database>;
export const mentorResponseOptions = { headers: { "Cache-Control": "private, no-store" } };
function requestError(code: string): never {
  if (code === "PT404")
    throw new AppError(404, "MENTOR_NOT_FOUND", "That conversation or course wasn't found.");
  if (code === "PT409")
    throw new AppError(
      409,
      "MENTOR_CONTEXT_CHANGED",
      "Your course, step or learning context changed. Your question is kept; reload context before sending it.",
    );
  if (code === "PT425")
    throw new AppError(
      425,
      "MENTOR_PENDING",
      "Another question is still being checked. Retry its original request or wait before sending a new one.",
    );
  if (code === "PT429")
    throw new AppError(
      429,
      "AI_REQUEST_LIMIT",
      "The shared AI request limit has been reached. Your saved step and references remain available.",
    );
  if (["22023", "22P02", "23514"].includes(code))
    throw new AppError(
      400,
      "INVALID_MENTOR_REQUEST",
      "Shorten the question and use your current course and context.",
    );
  throw mentorError("AI_RESULT_UNVERIFIED");
}
export async function getMentorContext(db: Db, courseId?: string | "none") {
  const result = await db.rpc("get_mentor_context", {
    p_use_accepted_course: courseId === undefined,
    ...(courseId && courseId !== "none" ? { p_course_id: courseId } : {}),
  });
  if (result.error) requestError(result.error.code);
  return mentorEnvelopeSchema.parse(result.data);
}
const receiptSchema = z.object({
  fresh: z.boolean().optional(),
  status: z.enum(["pending", "ready", "failed"]),
  result: z.unknown().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  context: mentorContextSchema.optional(),
});
export function mentorPromptContext(snapshot: MentorContext): MentorContext {
  const target = snapshot.acceptedStep?.proposal.skillId;
  const mapped =
    snapshot.learning.course?.modules.find(
      (module) => module.id === snapshot.learning.course?.checkpointModuleId,
    )?.skillIds ?? [];
  const priority = [
    target,
    ...mapped,
    "js.variables",
    "js.functions",
    "js.arrays",
    "js.promises",
  ].filter((id): id is string => Boolean(id));
  const skills = [...new Set([...priority, ...snapshot.learning.skills.map((skill) => skill.id)])]
    .slice(0, 6)
    .flatMap((id) => snapshot.learning.skills.filter((skill) => skill.id === id));
  const ids = skills.map((skill) => skill.id);
  return mentorContextSchema.parse({
    ...snapshot,
    learning: {
      ...snapshot.learning,
      skills,
      prerequisites: snapshot.learning.prerequisites.filter(
        (edge) => ids.includes(edge.skillId) && ids.includes(edge.prerequisiteSkillId),
      ),
      resources: snapshot.learning.resources
        .filter((resource) => ids.includes(resource.skillId))
        .sort((a, b) => ids.indexOf(a.skillId) - ids.indexOf(b.skillId))
        .slice(0, 3),
    },
    recentConversation: snapshot.recentConversation.map((turn) => ({
      question: turn.question.slice(0, 600),
      reply: turn.reply.slice(0, 800),
    })),
    recentEvents: snapshot.recentEvents.slice(-3),
  });
}
export async function mentorTurn(
  db: Db,
  userId: string,
  input: MentorInput,
  dependencies = {
    config: getMentorConfig,
    createAdmin: createTrustedDb,
    explain: explainToLearner,
  },
) {
  const prior = await db
    .from("mentor_turns")
    .select("question,course_id,context_hash,status,result,error_code,context,model")
    .eq("request_id", input.requestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (prior.error) requestError(prior.error.code);
  if (prior.data) {
    if (
      prior.data.question !== input.question ||
      prior.data.course_id !== input.courseId ||
      prior.data.context_hash !== input.expectedContextHash
    )
      requestError("PT409");
    const context = mentorContextSchema.parse(prior.data.context);
    if (prior.data.status === "ready")
      return {
        requestId: input.requestId,
        status: "ready" as const,
        result: validateMentorReply(prior.data.result, context),
      };
    if (prior.data.status === "failed")
      return {
        requestId: input.requestId,
        status: "failed" as const,
        errorCode: prior.data.error_code,
      };
    // A pending replay must remain checkable even if its course or provider settings changed.
    const checked = await dependencies.createAdmin().rpc("reserve_mentor_turn", {
      p_user_id: userId,
      p_request_id: input.requestId,
      p_question: input.question,
      ...(input.courseId ? { p_course_id: input.courseId } : {}),
      p_context_hash: input.expectedContextHash,
      p_model: prior.data.model,
      p_daily_limit: 50,
    });
    if (checked.error) requestError(checked.error.code);
    const original = receiptSchema.parse(checked.data);
    if (original.status === "ready")
      return {
        requestId: input.requestId,
        status: "ready" as const,
        result: validateMentorReply(original.result, context),
      };
    return {
      requestId: input.requestId,
      status: original.status,
      errorCode: original.errorCode ?? null,
    };
  }
  // Check the session owner before the privileged writer. The reservation transaction
  // checks exact receipts before context; a competing completion must not break replay.
  const profile = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (profile.error) requestError(profile.error.code);
  if (!profile.data) requestError("PT409");
  const config = dependencies.config();
  if (!config) throw mentorError("AI_NOT_CONFIGURED");
  const admin = dependencies.createAdmin();
  const reservation = await admin.rpc("reserve_mentor_turn", {
    p_user_id: userId,
    p_request_id: input.requestId,
    p_question: input.question,
    ...(input.courseId ? { p_course_id: input.courseId } : {}),
    p_context_hash: input.expectedContextHash,
    p_model: config.model,
    p_daily_limit: config.dailyLimit,
  });
  if (reservation.error) requestError(reservation.error.code);
  const receipt = receiptSchema.parse(reservation.data);
  if (!receipt.fresh) {
    if (receipt.status === "ready")
      return {
        requestId: input.requestId,
        status: "ready" as const,
        result: validateMentorReply(receipt.result, mentorContextSchema.parse(receipt.context)),
      };
    return {
      requestId: input.requestId,
      status: receipt.status,
      errorCode: receipt.errorCode ?? null,
    };
  }
  const context = mentorContextSchema.parse(receipt.context);
  const prompt = mentorPromptContext(context);
  let result: ReturnType<typeof validateMentorReply> | null = null;
  let errorCode: string | undefined;
  try {
    result = validateMentorReply(
      await dependencies.explain(input.question, prompt, config),
      prompt,
    );
  } catch (error) {
    errorCode = error instanceof AppError ? error.code : "AI_INVALID_OUTPUT";
  }
  const finish = await admin.rpc("finish_mentor_turn", {
    p_user_id: userId,
    p_request_id: input.requestId,
    p_result: result,
    ...(errorCode ? { p_error_code: errorCode } : {}),
  });
  if (finish.error) requestError(finish.error.code);
  const final = receiptSchema.parse(finish.data);
  if (final.status === "ready")
    return {
      requestId: input.requestId,
      status: "ready" as const,
      result: validateMentorReply(final.result, prompt),
    };
  return { requestId: input.requestId, status: final.status, errorCode: final.errorCode ?? null };
}

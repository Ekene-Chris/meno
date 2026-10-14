import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { mentorContextSchema, validateMentorReply } from "./mentor-schema";
import { getMentorContext } from "@/lib/ai/orchestrator";
type Db = SupabaseClient<Database>;
export async function getMentorWorkspace(db: Db, courseId?: string | "none", page = 0) {
  const current = await getMentorContext(db, courseId);
  const turns = await db
    .from("mentor_turns")
    .select("*")
    .eq("goal_id", current.context.learning.goal.id)
    .order("created_at", { ascending: false })
    .order("request_id", { ascending: false })
    .range(page * 20, page * 20 + 20);
  if (turns.error)
    throw new AppError(
      503,
      "MENTOR_HISTORY_UNAVAILABLE",
      "We couldn’t load your saved conversation. Please retry.",
    );
  return {
    current,
    turns: (turns.data ?? []).slice(0, 20).map((turn) => {
      const context = mentorContextSchema.parse(turn.context);
      return {
        id: turn.request_id,
        model: turn.model,
        policyVersion: turn.policy_version,
        requestContextHash: turn.context_hash,
        question: turn.question,
        status: turn.status,
        errorCode: turn.error_code,
        createdAt: turn.created_at,
        courseId: turn.course_id,
        contextCurrent:
          context.learningContextHash === current.context.learningContextHash &&
          context.acceptedStep?.id === current.context.acceptedStep?.id,
        result: turn.result ? validateMentorReply(turn.result, context) : null,
        context,
      };
    }),
    nextPage: (turns.data?.length ?? 0) > 20 ? page + 1 : null,
  };
}
export type MentorWorkspace = Awaited<ReturnType<typeof getMentorWorkspace>>;

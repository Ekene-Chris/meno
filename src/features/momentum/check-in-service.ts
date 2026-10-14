import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { createTrustedDb } from "@/lib/db/trusted";
import { getPathReview } from "@/features/learning-paths/review-service";
import { getPathContext } from "@/features/learning-paths/service";
import { pathReceiptSchema } from "@/features/learning-paths/schema";
import { selectRecoveryProposal } from "@/features/learning-paths/selector";
import { checkInProvenanceSchema, smallerActivity, type CheckInInput } from "./check-in-schema";
type Db = SupabaseClient<Database>;
function checkInError(code: string): never {
  if (code === "PT404")
    throw new AppError(404, "STEP_NOT_FOUND", "That accepted step wasn't found.");
  if (["PT409", "23505"].includes(code))
    throw new AppError(
      409,
      "CHECK_IN_CONFLICT",
      "Your step or learning context changed. Review My next step before checking in again. Your accepted step and evidence are kept.",
    );
  if (["22023", "23514", "23503", "22P02"].includes(code))
    throw new AppError(
      400,
      "INVALID_CHECK_IN",
      "Choose a learning obstacle and a clearly labeled source.",
    );
  throw new AppError(
    503,
    "CHECK_IN_UNVERIFIED",
    "We couldn't verify the check-in. Retry the same request to find its saved result.",
  );
}
export async function getCheckInWorkspace(db: Db) {
  const state = await getPathReview(db);
  const rows = await db
    .from("recovery_checkins")
    .select("id,source,obstacle,created_at,proposal_id")
    .order("created_at", { ascending: false })
    .limit(10);
  if (rows.error) checkInError(rows.error.code);
  return {
    state,
    history: (rows.data ?? []).map((row) => ({
      ...checkInProvenanceSchema.parse({
        id: row.id,
        source: row.source,
        obstacle: row.obstacle,
        createdAt: row.created_at,
      }),
      proposalId: row.proposal_id,
    })),
  };
}
export type CheckInWorkspace = Awaited<ReturnType<typeof getCheckInWorkspace>>;
export async function proposeCheckIn(db: Db, userId: string, input: CheckInInput) {
  const { requestId, ...payload } = input;
  const prior = await db
    .from("recovery_checkins")
    .select("input,result")
    .eq("request_id", requestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (prior.error) checkInError(prior.error.code);
  if (prior.data) {
    const stored = prior.data.input as Record<string, unknown>;
    if (
      Object.keys(stored).length !== Object.keys(payload).length ||
      Object.entries(payload).some(([key, value]) => stored[key] !== value)
    )
      checkInError("PT409");
    return pathReceiptSchema.parse(prior.data.result);
  }
  const state = await getPathReview(db);
  if (
    !state.active ||
    state.active.id !== input.acceptedProposalId ||
    state.revision !== input.expectedRevision ||
    state.latest?.decision === null
  )
    checkInError("PT409");
  const envelope = await getPathContext(db, state.active.context.course?.id ?? null);
  const proposal = selectRecoveryProposal(envelope.context);
  const result = await createTrustedDb().rpc("propose_checkin_recovery", {
    p_user_id: userId,
    p_request_id: requestId,
    p_expected_revision: input.expectedRevision,
    p_accepted_proposal_id: input.acceptedProposalId,
    p_source: input.source,
    p_obstacle: input.obstacle,
    p_context_hash: envelope.contextHash,
    p_proposal: proposal,
    p_adjustment: smallerActivity(proposal, input.obstacle),
  });
  if (result.error) checkInError(result.error.code);
  return pathReceiptSchema.parse(result.data);
}

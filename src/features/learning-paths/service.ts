import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { createTrustedDb } from "@/lib/db/trusted";
import {
  pathContextEnvelopeSchema,
  pathContextSchema,
  pathReceiptSchema,
  proposalSchema,
  type ProposePathInput,
} from "./schema";
import { recoveryPolicyVersion, selectRecoveryProposal } from "./selector";

type Db = SupabaseClient<Database>;
export const pathResponseOptions = { headers: { "Cache-Control": "private, no-store" } };
function pathError(code: string): never {
  if (code === "PT404") throw new AppError(404, "COURSE_NOT_FOUND", "That course wasn't found.");
  if (code === "PT409" || code === "23505")
    throw new AppError(
      409,
      "PATH_CONFLICT",
      "Your goal, evidence, confirmed course or proposal changed. Reload before requesting a new step; your saved work is kept.",
    );
  if (["22023", "22P02", "23514", "23503"].includes(code))
    throw new AppError(
      400,
      "INVALID_PROPOSAL",
      "We could not validate that proposal. Your saved plan is kept.",
    );
  throw new AppError(
    503,
    "PATH_SAVE_UNVERIFIED",
    "We couldn’t verify this proposal. Retry the same request to find its saved result.",
  );
}
export async function getPathContext(db: Db, courseId: string | null = null) {
  const result = await db.rpc("get_learning_path_context", {
    ...(courseId ? { p_course_id: courseId } : {}),
  });
  if (result.error) pathError(result.error.code);
  return pathContextEnvelopeSchema.parse(result.data);
}
export async function proposePath(db: Db, userId: string, input: ProposePathInput) {
  // A receipt is checked with the learner's RLS session before reading new context.
  // Recomputing after a lost response could otherwise return a different proposal.
  const prior = await db
    .from("learning_path_mutations")
    .select("expected_revision,course_id,result")
    .eq("user_id", userId)
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (prior.error) pathError(prior.error.code);
  if (prior.data) {
    if (
      prior.data.expected_revision !== input.expectedRevision ||
      prior.data.course_id !== input.courseId
    )
      pathError("PT409");
    return pathReceiptSchema.parse(prior.data.result);
  }
  const envelope = await getPathContext(db, input.courseId);
  if (envelope.revision !== input.expectedRevision) pathError("PT409");
  const proposal = selectRecoveryProposal(envelope.context);
  const saved = await createTrustedDb().rpc("propose_learning_path", {
    p_user_id: userId,
    ...(input.courseId ? { p_course_id: input.courseId } : {}),
    p_expected_revision: input.expectedRevision,
    p_context_hash: envelope.contextHash,
    p_selector_version: recoveryPolicyVersion,
    p_proposal: proposal,
    p_request_id: input.requestId,
  });
  if (saved.error) pathError(saved.error.code);
  return pathReceiptSchema.parse(saved.data);
}
function revisionRecord(row: Database["public"]["Tables"]["learning_path_revisions"]["Row"]) {
  return {
    id: row.id,
    pathId: row.path_id,
    revision: row.revision,
    createdAt: row.created_at,
    contextHash: row.context_hash,
    context: pathContextSchema.parse(row.context),
    proposal: proposalSchema.parse(row.proposal),
  };
}
export async function getPathProposal(db: Db, id: string) {
  const result = await db.from("learning_path_revisions").select("*").eq("id", id).maybeSingle();
  if (result.error) pathError(result.error.code);
  if (!result.data) throw new AppError(404, "PROPOSAL_NOT_FOUND", "That proposal wasn't found.");
  const record = revisionRecord(result.data);
  // Deleted/unconfirmed course context still permits reading immutable history.
  let contextCurrent = false;
  try {
    const current = await getPathContext(db, record.context.course?.id ?? null);
    contextCurrent = current.contextHash === record.contextHash;
  } catch (error) {
    if (!(error instanceof AppError && [404, 409].includes(error.status))) throw error;
  }
  return { ...record, contextCurrent };
}
export async function getLearningPath(db: Db, courseId: string | null = null) {
  const current = await getPathContext(db, courseId);
  if (!current.pathId) return { pathId: null, revision: 0, activeRevision: null, latest: null };
  const rows = await db
    .from("learning_path_revisions")
    .select("*")
    .eq("path_id", current.pathId)
    .eq("revision", current.revision)
    .single();
  if (rows.error) pathError(rows.error.code);
  return {
    pathId: current.pathId,
    revision: current.revision,
    activeRevision: current.activeRevision,
    latest: {
      ...revisionRecord(rows.data),
      contextCurrent: rows.data.context_hash === current.contextHash,
    },
  };
}

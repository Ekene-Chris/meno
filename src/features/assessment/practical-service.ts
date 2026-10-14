import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { createTrustedDb } from "@/lib/db/trusted";
import { getPracticalContent, practicalContentHash, scorePractical } from "./practical-scoring";
import {
  practicalInputSchema,
  practicalContentSchema,
  practicalFeedbackSchema,
  practicalReceiptSchema,
  validatePracticalChoices,
  type PracticalAttempt,
  type practicalMutationSchema,
} from "./practical-schema";
import type { z } from "zod";
import { practicalProgressSchema, type recordPracticalSchema } from "./practical-progress-schema";
type Db = SupabaseClient<Database>;
export const practicalResponseOptions = { headers: { "Cache-Control": "private, no-store" } };
function failed(code: string): never {
  if (code === "PT404")
    throw new AppError(404, "PRACTICAL_NOT_FOUND", "That practice wasn't found.");
  if (code === "PT409" || code === "23505")
    throw new AppError(
      409,
      "PRACTICAL_CONFLICT",
      "Your saved work changed. Compare the latest version before saving again.",
    );
  if (["22023", "22P02", "22003"].includes(code))
    throw new AppError(
      400,
      "INVALID_PRACTICAL",
      "Choose the available code lines or leave a choice unanswered.",
    );
  throw new AppError(
    503,
    "PRACTICAL_SAVE_UNVERIFIED",
    "We couldn’t verify this save. Retry the same request to check its result.",
  );
}
export async function startPractical(db: Db, userId: string, requestId: string) {
  const profile = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (profile.error) failed(profile.error.code);
  if (!profile.data) failed("PT409");
  const result = await createTrustedDb().rpc("start_practical_attempt", {
    p_user_id: userId,
    p_request_id: requestId,
  });
  if (result.error) failed(result.error.code);
  return practicalReceiptSchema.parse(result.data);
}
export async function listPracticals(db: Db, page = 0) {
  const [rows, draft] = await Promise.all([
    db
      .from("practical_attempts")
      .select("id,status,revision,created_at,submitted_at")
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 20, page * 20 + 20),
    db
      .from("practical_attempts")
      .select("id")
      .eq("status", "draft")
      .eq("catalog_id", "api-mini-app-v1")
      .maybeSingle(),
  ]);
  if (rows.error || draft.error)
    throw new AppError(
      503,
      "PRACTICAL_UNAVAILABLE",
      "We couldn’t load your practice. Please retry.",
    );
  return {
    content: getPracticalContent(),
    attempts: (rows.data ?? []).slice(0, 20),
    draftId: draft.data?.id ?? null,
    nextPage: (rows.data?.length ?? 0) > 20 ? page + 1 : null,
  };
}
export async function getPractical(db: Db, id: string): Promise<PracticalAttempt> {
  const result = await db.from("practical_attempts").select("*").eq("id", id).maybeSingle();
  if (result.error) failed(result.error.code);
  if (!result.data) failed("PT404");
  const recorded = await db
    .from("practical_progress")
    .select("result")
    .eq("attempt_id", id)
    .maybeSingle();
  if (recorded.error) failed(recorded.error.code);
  const row = result.data;
  if (row.status !== "draft" && row.status !== "submitted")
    throw new Error("Invalid practice status");
  const content = practicalContentSchema.parse(row.public_content);
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    input: validatePracticalChoices(practicalInputSchema.parse(row.input), content),
    feedback: row.feedback === null ? null : practicalFeedbackSchema.parse(row.feedback),
    content,
    contentHash: row.content_hash,
    goalId: row.goal_id,
    acceptedProposalId: row.accepted_proposal_id,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    progress: recorded.data ? practicalProgressSchema.parse(recorded.data.result) : null,
  };
}
export async function mutatePractical(
  db: Db,
  userId: string,
  id: string,
  input: z.infer<typeof practicalMutationSchema>,
) {
  // RLS read precedes constructing the writer; original snapshots remain readable after goal/plan changes.
  const attempt = await getPractical(db, id);
  try {
    validatePracticalChoices(input.input, attempt.content);
  } catch {
    failed("22023");
  }
  if (
    attempt.contentHash !== practicalContentHash ||
    attempt.content.rubricVersion !== getPracticalContent().rubricVersion
  )
    throw new AppError(
      503,
      "PRACTICAL_VERSION_UNAVAILABLE",
      "This rubric version is unavailable. Your saved work is kept.",
    );
  const result = await createTrustedDb().rpc("mutate_practical_attempt", {
    p_user_id: userId,
    p_attempt_id: id,
    p_request_id: input.requestId,
    p_expected_revision: input.expectedRevision,
    p_operation: input.operation,
    p_input: input.input,
    ...(input.operation === "submit" ? { p_feedback: scorePractical(input.input) } : {}),
  });
  if (result.error) failed(result.error.code);
  return practicalReceiptSchema.parse(result.data);
}

export async function recordPracticalProgress(
  db: Db,
  userId: string,
  id: string,
  input: z.infer<typeof recordPracticalSchema>,
) {
  const attempt = await getPractical(db, id);
  const prior = await db
    .from("practical_progress_receipts")
    .select("attempt_id,content_hash,progress_id")
    .eq("user_id", userId)
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (prior.error) failed(prior.error.code);
  if (prior.data) {
    if (
      prior.data.attempt_id !== id ||
      prior.data.content_hash !== input.contentHash ||
      !attempt.progress ||
      attempt.progress.assessmentId !== prior.data.progress_id
    )
      failed("PT409");
    return attempt.progress;
  }
  if (attempt.contentHash !== input.contentHash || attempt.status !== "submitted") failed("PT409");
  if (
    !attempt.progress &&
    (attempt.contentHash !== practicalContentHash ||
      attempt.content.rubricVersion !== getPracticalContent().rubricVersion)
  )
    throw new AppError(
      503,
      "PRACTICAL_VERSION_UNAVAILABLE",
      "This rubric is unavailable. Your work and prior evidence are kept.",
    );
  const result = await createTrustedDb().rpc("record_practical_progress", {
    p_user_id: userId,
    p_attempt_id: id,
    p_request_id: input.requestId,
    p_content_hash: input.contentHash,
    p_feedback: attempt.progress ? null : scorePractical(attempt.input),
  });
  if (result.error) failed(result.error.code);
  return practicalProgressSchema.parse(result.data);
}

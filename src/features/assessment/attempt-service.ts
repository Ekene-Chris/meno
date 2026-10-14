import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createTrustedDb } from "@/lib/db/trusted";
import { AppError } from "@/lib/http";
import { getDiagnosticDefinition, getPublicDiagnostic } from "./diagnostic-content";
import { DiagnosticInputError, scoreDiagnostic } from "./diagnostic-scoring";
import { diagnosticAnswerSchema } from "./diagnostic-schema";
import { normalizeAnswers } from "./attempt-input";
import {
  attemptReceiptSchema,
  diagnosticEvaluationSchema,
  publicDiagnosticSchema,
  type AttemptAnswer,
  type DiagnosticAttempt,
} from "./attempt-schema";

type Db = SupabaseClient<Database>;
export const assessmentResponseOptions = { headers: { "Cache-Control": "private, no-store" } };
function mutationError(code: string): never {
  if (code === "PT404") throw new AppError(404, "ATTEMPT_NOT_FOUND", "That check wasn't found.");
  if (code === "PT409" || code === "23505")
    throw new AppError(
      409,
      "ATTEMPT_CONFLICT",
      "This check changed in another session. Load the latest saved version before trying again.",
    );
  if (["22023", "22P02", "22003"].includes(code))
    throw new AppError(
      400,
      "INVALID_ANSWERS",
      "Choose available answers or explicitly skip; your saved answers are unchanged.",
    );
  throw new AppError(
    503,
    "ATTEMPT_SAVE_UNVERIFIED",
    "We couldn’t verify this save. Retry the same request to check its result; your previous progress is safe.",
  );
}
async function profileRequired(db: Db, userId: string) {
  const profile = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (profile.error) mutationError(profile.error.code);
  if (!profile.data)
    throw new AppError(409, "PASSPORT_REQUIRED", "Complete your Passport before starting a check.");
}
export async function startDiagnostic(db: Db, userId: string, requestId: string) {
  await profileRequired(db, userId);
  const definition = getDiagnosticDefinition();
  const result = await createTrustedDb().rpc("start_diagnostic_attempt", {
    p_user_id: userId,
    p_request_id: requestId,
    p_public_content: getPublicDiagnostic(),
    p_rubric_version: definition.rubricVersion,
    p_content_hash: definition.contentHash,
  });
  if (result.error) mutationError(result.error.code);
  return attemptReceiptSchema.parse(result.data);
}
export async function listDiagnostics(db: Db, page = 0) {
  const [rows, active] = await Promise.all([
    db
      .from("diagnostic_attempts")
      .select("id,status,revision,created_at,evaluated_at,answers")
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 20, page * 20 + 20),
    db.from("diagnostic_attempts").select("id").eq("status", "in_progress").maybeSingle(),
  ]);
  if (rows.error || active.error)
    throw new AppError(
      503,
      "DIAGNOSTICS_UNAVAILABLE",
      "We couldn’t load your checks. Please retry.",
    );
  return {
    activeAttemptId: active.data?.id ?? null,
    attempts: (rows.data ?? []).slice(0, 20).map((row) => ({
      id: row.id,
      status: row.status,
      revision: row.revision,
      createdAt: row.created_at,
      evaluatedAt: row.evaluated_at,
      answeredCount: z.array(diagnosticAnswerSchema).parse(row.answers).length,
    })),
    nextPage: (rows.data?.length ?? 0) > 20 ? page + 1 : null,
  };
}
export async function getDiagnostic(db: Db, id: string): Promise<DiagnosticAttempt> {
  const result = await db.from("diagnostic_attempts").select("*").eq("id", id).maybeSingle();
  if (result.error)
    throw new AppError(
      503,
      "DIAGNOSTIC_UNAVAILABLE",
      "We couldn’t load your saved check. Please retry.",
    );
  if (!result.data) throw new AppError(404, "ATTEMPT_NOT_FOUND", "That check wasn't found.");
  const row = result.data;
  if (!["in_progress", "evaluated"].includes(row.status)) throw new Error("Invalid attempt status");
  return {
    id: row.id,
    revision: row.revision,
    status: row.status as DiagnosticAttempt["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    evaluatedAt: row.evaluated_at,
    diagnostic: publicDiagnosticSchema.parse(row.public_content),
    answers: z.array(diagnosticAnswerSchema).max(8).parse(row.answers),
    evaluation: row.evaluation === null ? null : diagnosticEvaluationSchema.parse(row.evaluation),
  };
}
async function supportedAttempt(db: Db, id: string) {
  const attempt = await getDiagnostic(db, id);
  const row = await db
    .from("diagnostic_attempts")
    .select("content_hash,rubric_version")
    .eq("id", id)
    .single();
  const current = getDiagnosticDefinition();
  if (
    row.error ||
    row.data.content_hash !== current.contentHash ||
    row.data.rubric_version !== current.rubricVersion ||
    attempt.diagnostic.version !== current.version
  ) {
    throw new AppError(
      503,
      "DIAGNOSTIC_VERSION_UNAVAILABLE",
      "This question version is unavailable. Your saved check and prior evidence are kept.",
    );
  }
  return attempt;
}
export async function saveDiagnosticAnswers(
  db: Db,
  userId: string,
  id: string,
  revision: number,
  answers: AttemptAnswer[],
  requestId: string,
) {
  await supportedAttempt(db, id);
  let normalized: AttemptAnswer[];
  try {
    normalized = normalizeAnswers(answers);
  } catch (error) {
    if (error instanceof DiagnosticInputError)
      throw new AppError(400, "INVALID_ANSWERS", error.message);
    throw error;
  }
  const result = await createTrustedDb().rpc("save_diagnostic_answers", {
    p_user_id: userId,
    p_attempt_id: id,
    p_expected_revision: revision,
    p_answers: normalized,
    p_request_id: requestId,
  });
  if (result.error) mutationError(result.error.code);
  return attemptReceiptSchema.parse(result.data);
}
export async function evaluateDiagnostic(
  db: Db,
  userId: string,
  id: string,
  revision: number,
  requestId: string,
) {
  const attempt = await supportedAttempt(db, id);
  let evaluation: ReturnType<typeof scoreDiagnostic>;
  try {
    evaluation = scoreDiagnostic({ version: attempt.diagnostic.version, answers: attempt.answers });
  } catch (error) {
    if (error instanceof DiagnosticInputError || error instanceof z.ZodError)
      throw new AppError(
        400,
        "INCOMPLETE_DIAGNOSTIC",
        "Choose an answer or explicitly skip every question, then save before reviewing results.",
      );
    throw error;
  }
  const result = await createTrustedDb().rpc("evaluate_diagnostic_attempt", {
    p_user_id: userId,
    p_attempt_id: id,
    p_expected_revision: revision,
    p_answers: attempt.answers,
    p_evaluation: evaluation,
    p_request_id: requestId,
  });
  if (result.error) mutationError(result.error.code);
  return attemptReceiptSchema.parse(result.data);
}

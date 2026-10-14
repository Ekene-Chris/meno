import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { createTrustedDb } from "@/lib/db/trusted";
import {
  pathContextSchema,
  proposalSchema,
  pathReviewSchema,
  reviewReceiptSchema,
  type ReviewPathInput,
} from "./schema";

type Db = SupabaseClient<Database>;
function reviewError(code: string): never {
  if (code === "PT404")
    throw new AppError(404, "PROPOSAL_NOT_FOUND", "That proposal or course wasn't found.");
  if (["PT409", "23505"].includes(code))
    throw new AppError(
      409,
      "PATH_CONFLICT",
      "This proposal, decision or learning context changed. Your existing step and evidence are kept. Load the latest version to compare.",
    );
  if (["22023", "22P02", "22003", "23514", "23503"].includes(code))
    throw new AppError(
      400,
      "INVALID_REVIEW",
      "Use a title, two to four steps, and an available time estimate within your saved weekly time.",
    );
  throw new AppError(
    503,
    "PATH_REVIEW_UNVERIFIED",
    "We couldn’t verify this request. Retry the same request before making changes.",
  );
}
const stored = z.object({
  id: z.uuid(),
  path_id: z.uuid(),
  revision: z.number().int().positive(),
  created_at: z.string(),
  context_hash: z.string(),
  context: pathContextSchema,
  proposal: proposalSchema,
  edited_from: z.uuid().nullable(),
  decision: z.enum(["accepted", "declined"]).nullable(),
});
const rawState = z.object({
  pathId: z.uuid().nullable(),
  revision: z.number().int().min(0),
  activeRevision: z.number().int().positive().nullable(),
  latest: stored.nullable(),
  active: stored.nullable(),
  history: z.array(stored).max(20),
  courseId: z.uuid().nullable(),
  contextAvailable: z.boolean(),
  contextHash: z.string().nullable(),
});
function record(row: z.infer<typeof stored>) {
  return {
    id: row.id,
    pathId: row.path_id,
    revision: row.revision,
    createdAt: row.created_at,
    contextHash: row.context_hash,
    context: row.context,
    proposal: row.proposal,
    editedFrom: row.edited_from,
    decision: row.decision,
  };
}
export async function getPathReview(db: Db, courseId?: string | "none", before?: number) {
  const result = await db.rpc("get_learning_path_review", {
    p_use_saved_course: courseId === undefined,
    ...(courseId && courseId !== "none" ? { p_course_id: courseId } : {}),
    ...(before ? { p_before_revision: before } : {}),
  });
  if (result.error) reviewError(result.error.code);
  const state = rawState.parse(result.data);
  const ids = [
    ...new Set([state.latest, state.active, ...state.history].flatMap((r) => (r ? [r.id] : []))),
  ];
  const provenance = await db.rpc("get_checkin_provenance", { p_proposal_ids: ids });
  if (provenance.error) reviewError(provenance.error.code);
  const checkIns = z.record(z.uuid(), z.unknown()).parse(provenance.data);
  const withCheckIn = (row: z.infer<typeof stored>) => ({
    ...record(row),
    checkIn: checkIns[row.id] ?? null,
  });
  return pathReviewSchema.parse({
    pathId: state.pathId,
    revision: state.revision,
    activeRevision: state.activeRevision,
    latest: state.latest ? withCheckIn(state.latest) : null,
    active: state.active ? withCheckIn(state.active) : null,
    history: state.history.map(withCheckIn),
    courseId: state.courseId,
    contextAvailable: state.contextAvailable,
    contextCurrent: state.latest !== null && state.latest.context_hash === state.contextHash,
  });
}
export async function reviewPath(
  db: Db,
  userId: string,
  proposalId: string,
  input: ReviewPathInput,
) {
  // Resolve ownership with the learner's own RLS session before using the trusted writer.
  // The database checks exact retries before freshness and pending-state checks.
  const owned = await db
    .from("learning_path_revisions")
    .select("id")
    .eq("id", proposalId)
    .maybeSingle();
  if (owned.error) reviewError(owned.error.code);
  if (!owned.data) reviewError("PT404");
  const result = await createTrustedDb().rpc("review_learning_path", {
    p_user_id: userId,
    p_proposal_id: proposalId,
    p_expected_revision: input.expectedRevision,
    p_operation: input.operation,
    p_adjustment: input.operation === "edit" ? input.adjustment : null,
    p_request_id: input.requestId,
  });
  if (result.error) reviewError(result.error.code);
  return reviewReceiptSchema.parse(result.data);
}
const courseChoiceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  revision: z.number().int().positive(),
});
export async function listConfirmedCourses(db: Db, page: number) {
  const roots = await db
    .from("courses")
    .select("id,confirmed_revision")
    .not("confirmed_revision", "is", null)
    .order("updated_at", { ascending: false })
    .order("id")
    .range(page * 20, page * 20 + 20);
  if (roots.error) reviewError(roots.error.code);
  const courses = (roots.data ?? []).slice(0, 20);
  if (!courses.length) return { courses: [], nextPage: null };
  const titles = await db
    .from("course_revisions")
    .select("course_id,revision,title")
    .or(
      courses.map((c) => `and(course_id.eq.${c.id},revision.eq.${c.confirmed_revision})`).join(","),
    );
  if (titles.error) reviewError(titles.error.code);
  return {
    courses: courses.map((course) => {
      const version = titles.data?.find(
        (row) => row.course_id === course.id && row.revision === course.confirmed_revision,
      );
      if (!version)
        throw new AppError(
          503,
          "COURSES_UNAVAILABLE",
          "We couldn’t load the confirmed course titles. Please retry.",
        );
      return courseChoiceSchema.parse({
        id: course.id,
        title: version.title,
        revision: version.revision,
      });
    }),
    nextPage: (roots.data?.length ?? 0) > 20 ? page + 1 : null,
  };
}

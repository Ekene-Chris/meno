import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { courseMutationResultSchema, type CourseInput } from "./course-schema";

type Db = SupabaseClient<Database>;
const headers = { "Cache-Control": "private, no-store" };
export const courseResponseOptions = { headers };

function mutationError(code: string): never {
  if (code === "PT404") throw new AppError(404, "COURSE_NOT_FOUND", "That course wasn't found.");
  if (code === "PT409" || code === "23505") {
    throw new AppError(
      409,
      "COURSE_CONFLICT",
      "Your saved context has changed or this request was already used. Reload your Passport and course before trying again.",
    );
  }
  if (["22023", "22P02", "22003", "23514", "23503", "23502"].includes(code)) {
    throw new AppError(
      400,
      "INVALID_COURSE",
      "Check your course details, topics, and selected checkpoint.",
    );
  }
  throw new AppError(
    503,
    "COURSE_SAVE_FAILED",
    "Your course changes weren't saved. Please retry; your previous context is safe.",
  );
}

export async function saveCourseDraft(
  db: Db,
  input: CourseInput,
  requestId: string,
  courseId?: string,
  expectedRevision = 0,
) {
  const { data, error } = await db.rpc("save_course_draft", {
    p_input: input,
    p_request_id: requestId,
    p_expected_revision: expectedRevision,
    ...(courseId ? { p_course_id: courseId } : {}),
  });
  if (error) mutationError(error.code);
  return courseMutationResultSchema.parse(data);
}

export async function confirmCourse(
  db: Db,
  courseId: string,
  expectedRevision: number,
  requestId: string,
) {
  const { data, error } = await db.rpc("confirm_course", {
    p_course_id: courseId,
    p_expected_revision: expectedRevision,
    p_request_id: requestId,
  });
  if (error) mutationError(error.code);
  return courseMutationResultSchema.parse(data);
}

function courseStatus(revision: number, confirmedRevision: number | null) {
  return confirmedRevision === null
    ? "draft"
    : revision === confirmedRevision
      ? "confirmed"
      : "draft_changes";
}

export async function listCourses(db: Db, page: number) {
  const pageSize = 20;
  const { data, error } = await db
    .from("course_summaries")
    .select("id, title, source_type, revision, confirmed_revision, updated_at")
    .order("updated_at", { ascending: false })
    .order("id")
    .range(page * pageSize, page * pageSize + pageSize);
  if (error)
    throw new AppError(
      503,
      "COURSES_UNAVAILABLE",
      "We couldn't load your courses. Please try again.",
    );
  return {
    courses: (data ?? []).slice(0, pageSize),
    nextPage: (data?.length ?? 0) > pageSize ? page + 1 : null,
  };
}

// The database validates topic shape and references on writes. Reads also check JSON
// shape without applying the app's smaller request-size limit to historical records.
const storedTopics = z.array(
  z.strictObject({ label: z.string(), skill_id: z.string().nullable() }),
);

export async function getCourse(db: Db, courseId: string) {
  const { data: course, error } = await db
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();
  if (error)
    throw new AppError(
      503,
      "COURSE_UNAVAILABLE",
      "We couldn't load your course. Please try again.",
    );
  if (!course) throw new AppError(404, "COURSE_NOT_FOUND", "That course wasn't found.");
  const versions = [
    ...new Set(
      [course.revision, course.confirmed_revision].filter(
        (value): value is number => value !== null,
      ),
    ),
  ];
  const [revisions, modules] = await Promise.all([
    db.from("course_revisions").select("*").eq("course_id", courseId).in("revision", versions),
    db
      .from("course_modules")
      .select("*")
      .eq("course_id", courseId)
      .in("revision", versions)
      .order("position"),
  ]);
  if (revisions.error || modules.error)
    throw new AppError(
      503,
      "COURSE_UNAVAILABLE",
      "We couldn't load your course. Please try again.",
    );
  // Version content is immutable, so a concurrent save cannot mix modules from
  // a different version into the root snapshot we read above.
  const snapshot = (version: number) => {
    const row = revisions.data?.find((item) => item.revision === version);
    if (!row)
      throw new AppError(
        503,
        "COURSE_UNAVAILABLE",
        "We couldn't load your course. Please try again.",
      );
    const content: CourseInput = {
      title: row.title,
      source_type: row.source_type as CourseInput["source_type"],
      source_url: row.source_url,
      outline: row.outline,
      checkpoint_module_id: row.checkpoint_module_id,
      checkpoint_note: row.checkpoint_note,
      modules: (modules.data ?? [])
        .filter((item) => item.revision === version)
        .map((item) => ({
          id: item.id,
          title: item.title,
          topics: storedTopics.parse(item.topics),
        })),
    };
    return { revision: row.revision, savedAt: row.created_at, content };
  };
  return {
    id: course.id,
    revision: course.revision,
    confirmedRevision: course.confirmed_revision,
    status: courseStatus(course.revision, course.confirmed_revision),
    updatedAt: course.updated_at,
    draft: snapshot(course.revision),
    confirmed: course.confirmed_revision === null ? null : snapshot(course.confirmed_revision),
  };
}

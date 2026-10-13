import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import {
  COURSE_REQUEST_BYTES,
  courseIdSchema,
  saveCourseSchema,
} from "@/features/resources/course-schema";
import {
  courseResponseOptions,
  getCourse,
  saveCourseDraft,
} from "@/features/resources/course-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { db } = await authenticatedContext();
    const id = courseIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new AppError(404, "COURSE_NOT_FOUND", "That course wasn't found.");
    return NextResponse.json(await getCourse(db, id.data), courseResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { db } = await authenticatedContext();
    const id = courseIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new AppError(404, "COURSE_NOT_FOUND", "That course wasn't found.");
    const parsed = saveCourseSchema.safeParse(await readMutation(request, COURSE_REQUEST_BYTES));
    if (!parsed.success)
      throw new AppError(
        400,
        "INVALID_COURSE",
        "Check your course details and the revision you are editing.",
      );
    return NextResponse.json(
      await saveCourseDraft(
        db,
        parsed.data.course,
        parsed.data.requestId,
        id.data,
        parsed.data.expectedRevision,
      ),
      courseResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

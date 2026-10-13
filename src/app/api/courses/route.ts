import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import {
  COURSE_REQUEST_BYTES,
  createCourseSchema,
  listCoursesSchema,
} from "@/features/resources/course-schema";
import {
  courseResponseOptions,
  listCourses,
  saveCourseDraft,
} from "@/features/resources/course-service";

export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const parsed = listCoursesSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) throw new AppError(400, "INVALID_INPUT", "Choose a valid course page.");
    return NextResponse.json(await listCourses(db, parsed.data.page), courseResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const parsed = createCourseSchema.safeParse(await readMutation(request, COURSE_REQUEST_BYTES));
    if (!parsed.success)
      throw new AppError(
        400,
        "INVALID_COURSE",
        "Check your course details, topics, and selected checkpoint.",
      );
    const result = await saveCourseDraft(db, parsed.data.course, parsed.data.requestId);
    return NextResponse.json(result, { ...courseResponseOptions, status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { confirmCourseSchema, courseIdSchema } from "@/features/resources/course-schema";
import { confirmCourse, courseResponseOptions } from "@/features/resources/course-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await authenticatedContext();
    const id = courseIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new AppError(404, "COURSE_NOT_FOUND", "That course wasn't found.");
    const parsed = confirmCourseSchema.safeParse(await readMutation(request));
    if (!parsed.success)
      throw new AppError(400, "INVALID_COURSE", "Confirm the course revision you have reviewed.");
    return NextResponse.json(
      await confirmCourse(db, id.data, parsed.data.expectedRevision, parsed.data.requestId),
      courseResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

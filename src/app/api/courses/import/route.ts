import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { outlineRequestSchema } from "@/features/resources/outline-schema";
import { suggestCourseOutline } from "@/features/resources/outline-service";
import { courseResponseOptions } from "@/features/resources/course-service";

export const maxDuration = 45;
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticatedContext();
    const parsed = outlineRequestSchema.safeParse(await readMutation(request, 32 * 1024));
    if (!parsed.success)
      throw new AppError(
        400,
        "INVALID_OUTLINE",
        "Add a course title and 20–12,000 characters of permitted outline text. Keep it under 24 KB.",
      );
    return NextResponse.json(
      await suggestCourseOutline(db, user.id, parsed.data),
      courseResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

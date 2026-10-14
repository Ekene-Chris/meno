import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError } from "@/lib/http";
import { reviewQuerySchema } from "@/features/learning-paths/schema";
import { getPathReview } from "@/features/learning-paths/review-service";
import { pathResponseOptions } from "@/features/learning-paths/service";
export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const query = reviewQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success)
      throw new AppError(400, "INVALID_INPUT", "Choose a saved course or no course.");
    return NextResponse.json(
      await getPathReview(db, query.data.courseId, query.data.before),
      pathResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

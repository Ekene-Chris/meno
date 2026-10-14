import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError } from "@/lib/http";
import { pathQuerySchema } from "@/features/learning-paths/schema";
import { getLearningPath, pathResponseOptions } from "@/features/learning-paths/service";

export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const query = pathQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new AppError(400, "INVALID_INPUT", "Choose a valid saved course.");
    return NextResponse.json(
      await getLearningPath(db, query.data.courseId ?? null),
      pathResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

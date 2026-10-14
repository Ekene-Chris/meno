import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError } from "@/lib/http";
import { listConfirmedCourses } from "@/features/learning-paths/review-service";
import { pathResponseOptions } from "@/features/learning-paths/service";
const querySchema = z.strictObject({ page: z.coerce.number().int().min(0).max(10000).default(0) });
export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      throw new AppError(400, "INVALID_INPUT", "Choose an available course page.");
    return NextResponse.json(await listConfirmedCourses(db, query.data.page), pathResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

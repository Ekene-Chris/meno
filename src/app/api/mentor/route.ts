import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { pathIdSchema } from "@/features/learning-paths/schema";
import { mentorInputSchema } from "@/features/momentum/mentor-schema";
import { getMentorWorkspace } from "@/features/momentum/mentor-service";
import { mentorTurn, mentorResponseOptions } from "@/lib/ai/orchestrator";
export const maxDuration = 40;
const querySchema = z.strictObject({
  courseId: z.union([pathIdSchema, z.literal("none")]).optional(),
  page: z.coerce.number().int().min(0).max(10000).default(0),
});
export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      throw new AppError(400, "INVALID_INPUT", "Choose a saved course or no course.");
    return NextResponse.json(
      await getMentorWorkspace(db, query.data.courseId, query.data.page),
      mentorResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticatedContext();
    const input = mentorInputSchema.safeParse(await readMutation(request, 12 * 1024));
    if (!input.success)
      throw new AppError(
        400,
        "INVALID_INPUT",
        "Use a question of up to 2000 characters and your current course context.",
      );
    return NextResponse.json(await mentorTurn(db, user.id, input.data), mentorResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

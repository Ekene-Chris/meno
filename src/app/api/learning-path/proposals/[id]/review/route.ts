import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { pathIdSchema, reviewPathSchema } from "@/features/learning-paths/schema";
import { reviewPath } from "@/features/learning-paths/review-service";
import { pathResponseOptions } from "@/features/learning-paths/service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await authenticatedContext();
    const id = pathIdSchema.safeParse((await params).id);
    if (!id.success) throw new AppError(404, "PROPOSAL_NOT_FOUND", "That proposal wasn't found.");
    const input = reviewPathSchema.safeParse(await readMutation(request));
    if (!input.success)
      throw new AppError(
        400,
        "INVALID_INPUT",
        "Choose an available review action and bounded task details.",
      );
    return NextResponse.json(
      await reviewPath(db, user.id, id.data, input.data),
      pathResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

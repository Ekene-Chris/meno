import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { proposePathSchema } from "@/features/learning-paths/schema";
import { pathResponseOptions, proposePath } from "@/features/learning-paths/service";

export async function POST(request: Request) {
  try {
    const { db, user } = await authenticatedContext();
    const input = proposePathSchema.safeParse(await readMutation(request));
    if (!input.success)
      throw new AppError(
        400,
        "INVALID_INPUT",
        "Choose a saved course or no course and the current proposal revision.",
      );
    return NextResponse.json(await proposePath(db, user.id, input.data), pathResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

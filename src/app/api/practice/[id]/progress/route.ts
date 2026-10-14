import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { practicalId } from "@/features/assessment/practical-schema";
import { recordPracticalSchema } from "@/features/assessment/practical-progress-schema";
import {
  recordPracticalProgress,
  practicalResponseOptions,
} from "@/features/assessment/practical-service";
export async function POST(request: Request, context: RouteContext<"/api/practice/[id]/progress">) {
  try {
    const { db, user } = await authenticatedContext();
    const id = practicalId.safeParse((await context.params).id);
    if (!id.success) throw new AppError(404, "PRACTICAL_NOT_FOUND", "That practice wasn't found.");
    const input = recordPracticalSchema.safeParse(await readMutation(request));
    if (!input.success)
      throw new AppError(400, "INVALID_INPUT", "Record progress from your saved submission.");
    return NextResponse.json(
      await recordPracticalProgress(db, user.id, id.data, input.data),
      practicalResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

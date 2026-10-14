import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { attemptIdSchema, attemptMutationSchema } from "@/features/assessment/attempt-schema";
import {
  assessmentResponseOptions,
  evaluateDiagnostic,
} from "@/features/assessment/attempt-service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, user } = await authenticatedContext();
    const id = attemptIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new AppError(404, "ATTEMPT_NOT_FOUND", "That check wasn't found.");
    const input = attemptMutationSchema.safeParse(await readMutation(request));
    if (!input.success)
      throw new AppError(400, "INVALID_INPUT", "Review your saved check before submitting it.");
    return NextResponse.json(
      await evaluateDiagnostic(
        db,
        user.id,
        id.data,
        input.data.expectedRevision,
        input.data.requestId,
      ),
      assessmentResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

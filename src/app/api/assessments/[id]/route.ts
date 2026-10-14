import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { attemptIdSchema, saveAnswersSchema } from "@/features/assessment/attempt-schema";
import {
  assessmentResponseOptions,
  getDiagnostic,
  saveDiagnosticAnswers,
} from "@/features/assessment/attempt-service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { db } = await authenticatedContext();
    const id = attemptIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new AppError(404, "ATTEMPT_NOT_FOUND", "That check wasn't found.");
    return NextResponse.json(await getDiagnostic(db, id.data), assessmentResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const { db, user } = await authenticatedContext();
    const id = attemptIdSchema.safeParse((await context.params).id);
    if (!id.success) throw new AppError(404, "ATTEMPT_NOT_FOUND", "That check wasn't found.");
    const input = saveAnswersSchema.safeParse(await readMutation(request));
    if (!input.success)
      throw new AppError(400, "INVALID_ANSWERS", "Check your answer selections and saved version.");
    return NextResponse.json(
      await saveDiagnosticAnswers(
        db,
        user.id,
        id.data,
        input.data.expectedRevision,
        input.data.answers,
        input.data.requestId,
      ),
      assessmentResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

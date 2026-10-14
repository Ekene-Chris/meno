import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { listAttemptsSchema, startAttemptSchema } from "@/features/assessment/attempt-schema";
import {
  assessmentResponseOptions,
  listDiagnostics,
  startDiagnostic,
} from "@/features/assessment/attempt-service";

export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const page = listAttemptsSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!page.success) throw new AppError(400, "INVALID_INPUT", "Choose a valid check page.");
    return NextResponse.json(await listDiagnostics(db, page.data.page), assessmentResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticatedContext();
    const input = startAttemptSchema.safeParse(await readMutation(request));
    if (!input.success) throw new AppError(400, "INVALID_INPUT", "Start the check from Meno.");
    return NextResponse.json(
      await startDiagnostic(db, user.id, input.data.requestId),
      assessmentResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

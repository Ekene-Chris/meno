import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { practicalPageSchema, practicalStartSchema } from "@/features/assessment/practical-schema";
import {
  listPracticals,
  startPractical,
  practicalResponseOptions,
} from "@/features/assessment/practical-service";
export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const input = practicalPageSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!input.success) throw new AppError(400, "INVALID_INPUT", "Choose a valid practice page.");
    return NextResponse.json(await listPracticals(db, input.data.page), practicalResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticatedContext();
    const input = practicalStartSchema.safeParse(await readMutation(request));
    if (!input.success) throw new AppError(400, "INVALID_INPUT", "Start practice from Meno.");
    return NextResponse.json(
      await startPractical(db, user.id, input.data.requestId),
      practicalResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

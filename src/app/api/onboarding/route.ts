import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { savePassportSchema } from "@/features/learner-passport/schema";
import { savePassport } from "@/features/learner-passport/service";

export async function POST(request: Request) {
  try {
    const { db } = await authenticatedContext();
    const result = savePassportSchema.safeParse(await readMutation(request));
    if (!result.success)
      throw new AppError(400, "INVALID_INPUT", "Please check your goal and learning preferences.");
    await savePassport(db, result.data.passport, result.data.requestId);
    return NextResponse.json(
      { saved: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

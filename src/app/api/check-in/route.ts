import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { checkInSchema } from "@/features/momentum/check-in-schema";
import { getCheckInWorkspace, proposeCheckIn } from "@/features/momentum/check-in-service";
import { pathResponseOptions } from "@/features/learning-paths/service";
export async function GET() {
  try {
    const { db } = await authenticatedContext();
    return NextResponse.json(await getCheckInWorkspace(db), pathResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, user } = await authenticatedContext();
    const input = checkInSchema.safeParse(await readMutation(request, 2048));
    if (!input.success)
      throw new AppError(
        400,
        "INVALID_CHECK_IN",
        "Choose a learning obstacle and a clearly labeled source.",
      );
    return NextResponse.json(await proposeCheckIn(db, user.id, input.data), pathResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

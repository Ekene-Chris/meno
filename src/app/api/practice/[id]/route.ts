import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError, readMutation } from "@/lib/http";
import { practicalId, practicalMutationSchema } from "@/features/assessment/practical-schema";
import {
  getPractical,
  mutatePractical,
  practicalResponseOptions,
} from "@/features/assessment/practical-service";
async function attemptId(context: RouteContext<"/api/practice/[id]">) {
  const parsed = practicalId.safeParse((await context.params).id);
  if (!parsed.success)
    throw new AppError(404, "PRACTICAL_NOT_FOUND", "That practice wasn't found.");
  return parsed.data;
}
export async function GET(_request: Request, context: RouteContext<"/api/practice/[id]">) {
  try {
    const { db } = await authenticatedContext();
    return NextResponse.json(
      await getPractical(db, await attemptId(context)),
      practicalResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}
export async function PUT(request: Request, context: RouteContext<"/api/practice/[id]">) {
  try {
    const { db, user } = await authenticatedContext();
    const id = await attemptId(context);
    const input = practicalMutationSchema.safeParse(await readMutation(request, 65536));
    if (!input.success)
      throw new AppError(400, "INVALID_INPUT", "Check your code choices and text limits.");
    return NextResponse.json(
      await mutatePractical(db, user.id, id, input.data),
      practicalResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}

import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { AppError, jsonError } from "@/lib/http";
import { pathIdSchema } from "@/features/learning-paths/schema";
import { getPathProposal, pathResponseOptions } from "@/features/learning-paths/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db } = await authenticatedContext();
    const id = pathIdSchema.safeParse((await params).id);
    if (!id.success) throw new AppError(400, "INVALID_INPUT", "Choose a valid proposal.");
    return NextResponse.json(await getPathProposal(db, id.data), pathResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

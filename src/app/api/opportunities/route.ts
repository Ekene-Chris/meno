import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { getOpportunities, opportunityResponseOptions } from "@/features/opportunities/service";
import { AppError, jsonError } from "@/lib/http";
export async function GET(request: Request) {
  try {
    const { db } = await authenticatedContext();
    if (new URL(request.url).search)
      throw new AppError(400, "INVALID_INPUT", "Use the opportunity catalog.");
    return NextResponse.json(await getOpportunities(db), opportunityResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

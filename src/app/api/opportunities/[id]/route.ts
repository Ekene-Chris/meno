import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import {
  getOpportunities,
  saveOpportunity,
  opportunityResponseOptions,
} from "@/features/opportunities/service";
import { opportunityIdSchema, saveOpportunitySchema } from "@/features/opportunities/schema";
import { AppError, jsonError, readMutation } from "@/lib/http";
async function idFor(context: RouteContext<"/api/opportunities/[id]">) {
  const id = opportunityIdSchema.safeParse((await context.params).id);
  if (!id.success) throw new AppError(404, "OPPORTUNITY_NOT_FOUND", "That example wasn't found.");
  return id.data;
}
export async function GET(_req: Request, context: RouteContext<"/api/opportunities/[id]">) {
  try {
    const { db } = await authenticatedContext();
    return NextResponse.json(
      (await getOpportunities(db, await idFor(context)))[0],
      opportunityResponseOptions,
    );
  } catch (error) {
    return jsonError(error);
  }
}
export async function PUT(req: Request, context: RouteContext<"/api/opportunities/[id]">) {
  try {
    const { db } = await authenticatedContext();
    const id = await idFor(context);
    const input = saveOpportunitySchema.safeParse(await readMutation(req));
    if (!input.success)
      throw new AppError(400, "INVALID_INPUT", "Save or remove this example from Meno.");
    return NextResponse.json(await saveOpportunity(db, id, input.data), opportunityResponseOptions);
  } catch (error) {
    return jsonError(error);
  }
}

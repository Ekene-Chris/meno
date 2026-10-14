import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
import { opportunityRadarSchema, savedReceiptSchema, type saveOpportunitySchema } from "./schema";
import type { z } from "zod";
type Db = SupabaseClient<Database>;
export const opportunityResponseOptions = { headers: { "Cache-Control": "private, no-store" } };
function failure(code: string): never {
  if (code === "PT404")
    throw new AppError(404, "OPPORTUNITY_NOT_FOUND", "That example wasn't found.");
  if (code === "PT409")
    throw new AppError(
      409,
      "OPPORTUNITY_CONFLICT",
      "Your saved state changed. Reload to compare before trying again.",
    );
  throw new AppError(
    503,
    "OPPORTUNITY_UNVERIFIED",
    "We couldn’t verify this request. Retry the same request to check the saved result.",
  );
}
export async function getOpportunities(db: Db, id?: string) {
  const result = await db.rpc("get_opportunity_radar", id ? { p_opportunity: id } : {});
  if (result.error) failure(result.error.code);
  return opportunityRadarSchema.parse(result.data);
}
export async function saveOpportunity(
  db: Db,
  id: string,
  input: z.infer<typeof saveOpportunitySchema>,
) {
  const result = await db.rpc("save_opportunity", {
    p_opportunity: id,
    p_request: input.requestId,
    p_expected_saved: input.expectedSaved,
    p_saved: input.saved,
  });
  if (result.error) failure(result.error.code);
  return savedReceiptSchema.parse(result.data);
}

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicConfig } from "@/lib/env";
import { AppError } from "@/lib/http";
import type { Database } from "@/types/database";

// Trusted accounting, assessment and proposal writes after identity/ownership checks.
// Ordinary reads and learner-editable course/Passport writes retain RLS sessions.
export function createTrustedDb() {
  const config = getPublicConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!config || !key)
    throw new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      "We couldn’t save this activity. Your previous progress is safe; please try again.",
    );
  return createClient<Database>(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

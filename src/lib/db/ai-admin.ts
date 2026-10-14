import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicConfig } from "@/lib/env";
import { providerError } from "@/lib/ai/outline-provider";
import type { Database } from "@/types/database";

// Only AI request accounting uses this client. Course/Passport operations keep RLS sessions.
export function createAiAdmin() {
  const config = getPublicConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!config || !key) throw providerError();
  return createClient<Database>(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

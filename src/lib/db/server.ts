import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicConfig } from "@/lib/env";
import { AppError } from "@/lib/http";
import type { Database } from "@/types/database";

export async function createDbClient() {
  const config = getPublicConfig();
  if (!config)
    throw new AppError(503, "SETUP_REQUIRED", "Meno's connection is not configured yet.");
  const store = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          /* Server Components are read-only; proxy.ts refreshes their cookies. */
        }
      },
    },
  });
}

import "server-only";
import { providerError } from "@/lib/ai/outline-provider";
import { createTrustedDb } from "./trusted";

// Only AI request accounting uses this client. Course/Passport operations keep RLS sessions.
export function createAiAdmin() {
  try {
    return createTrustedDb();
  } catch {
    throw providerError();
  }
}

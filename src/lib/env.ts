import { z } from "zod";

function isPublishableKey(value: string) {
  if (/^sb_publishable_[a-zA-Z0-9_-]+$/.test(value)) return true;
  // Legacy local stacks use JWT-formatted anon keys. Never accept service-role JWTs.
  try {
    const payload = value.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
  } catch {
    return false;
  }
}

const publicConfigSchema = z.object({
  url: z.url().refine((value) => /^https?:\/\//.test(value)),
  key: z.string().min(20).refine(isPublishableKey, "Use a publishable key."),
});

export function getPublicConfig() {
  const result = publicConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return result.success ? result.data : null;
}

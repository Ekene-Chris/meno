import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicConfig } from "@/lib/env";

afterEach(() => vi.unstubAllEnvs());
const legacyKey = (role: string) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;

describe("browser-safe Supabase configuration", () => {
  it.each(["sb_secret_test_should_never_be_public", legacyKey("service_role")])(
    "rejects privileged keys",
    (key) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
      expect(getPublicConfig()).toBeNull();
    },
  );
  it.each(["sb_publishable_test_public_key", legacyKey("anon")])(
    "accepts public key formats",
    (key) => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
      expect(getPublicConfig()?.key).toBe(key);
    },
  );
  it("handles missing configuration without pretending the backend is available", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(getPublicConfig()).toBeNull();
  });
});

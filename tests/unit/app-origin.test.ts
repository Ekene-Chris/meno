import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppOrigin, getAppOrigins } from "@/lib/app-origin";

afterEach(() => vi.unstubAllEnvs());

describe("trusted hosted application origins", () => {
  it("allows exact configured Vercel deployment and branch origins", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://meno.example.test");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "meno-deployment-raven-energy.vercel.app");
    vi.stubEnv("VERCEL_BRANCH_URL", "meno-git-feature-raven-energy.vercel.app");
    expect(getAppOrigins("https://forged-host.example.test/api")).toEqual([
      "https://meno.example.test",
      "https://meno-git-feature-raven-energy.vercel.app",
      "https://meno-deployment-raven-energy.vercel.app",
    ]);
    expect(getAppOrigin("https://meno-git-feature-raven-energy.vercel.app")).toBe(
      "https://meno-git-feature-raven-energy.vercel.app",
    );
    expect(getAppOrigin("https://forged-host.example.test")).toBe("https://meno.example.test");
  });
  it("does not trust deployment metadata outside Vercel", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_URL", "unexpected.vercel.app");
    expect(getAppOrigins()).toEqual(["http://localhost:3000"]);
  });
  it("fails closed on hosted requests with missing or malformed deployment metadata", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_URL", "attacker.example.test");
    vi.stubEnv("VERCEL_BRANCH_URL", "user@meno.vercel.app");
    expect(getAppOrigins("https://forged-host.example.test")).toEqual([]);
    expect(() => getAppOrigin()).toThrow();
  });
  it("retains local request fallback when no canonical origin is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL", "");
    expect(getAppOrigins("http://127.0.0.1:3100/api/courses")).toEqual(["http://127.0.0.1:3100"]);
  });
});

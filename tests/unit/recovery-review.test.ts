import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const trusted = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/trusted", () => ({ createTrustedDb: trusted }));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { reviewPathSchema } from "@/features/learning-paths/schema";
import { reviewPath } from "@/features/learning-paths/review-service";
const input = { requestId: crypto.randomUUID(), expectedRevision: 1, operation: "accept" as const };
const adjustment = {
  title: "Read and explain",
  estimatedMinutes: 5,
  steps: ["Read one example", "Explain it on paper"],
};
afterEach(() => trusted.mockReset());
describe("recovery review boundary", () => {
  it("accepts only bounded learner edits or a decision, rejecting ownership, evidence and policy injection", () => {
    expect(reviewPathSchema.parse(input)).toEqual(input);
    expect(reviewPathSchema.parse({ ...input, operation: "edit", adjustment })).toMatchObject({
      adjustment,
    });
    for (const patch of [
      { userId: crypto.randomUUID() },
      { contextHash: "a".repeat(64) },
      { activeRevision: 1 },
      { expectedRevision: 0 },
      { adjustment },
      { operation: "complete" },
    ])
      expect(reviewPathSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    for (const patch of [
      { skillId: "made-up" },
      { resource: {} },
      { evidenceIds: [] },
      { estimatedMinutes: 7 },
      { steps: ["one"] },
      { title: " " },
      { steps: ["x".repeat(401), "next"] },
    ])
      expect(
        reviewPathSchema.safeParse({
          ...input,
          operation: "edit",
          adjustment: { ...adjustment, ...patch },
        }).success,
      ).toBe(false);
  });
  it("denies foreign or failed owned reads before constructing the privileged writer", async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const db = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient<Database>;
    await expect(
      reviewPath(db, crypto.randomUUID(), crypto.randomUUID(), input),
    ).rejects.toMatchObject({ status: 404 });
    chain.maybeSingle.mockResolvedValue({ data: null, error: { code: "unavailable" } } as never);
    await expect(
      reviewPath(db, crypto.randomUUID(), crypto.randomUUID(), input),
    ).rejects.toMatchObject({ status: 503 });
    expect(trusted).not.toHaveBeenCalled();
  });
});

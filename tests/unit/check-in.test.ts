import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { trusted } = vi.hoisted(() => ({ trusted: vi.fn() }));
vi.mock("@/lib/db/trusted", () => ({ createTrustedDb: trusted }));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { proposeCheckIn } from "@/features/momentum/check-in-service";
import { checkInSchema, smallerActivity } from "@/features/momentum/check-in-schema";
import { selectRecoveryProposal } from "@/features/learning-paths/selector";
import { recoveryContext } from "../fixtures/recovery-context";
afterEach(() => trusted.mockReset());
describe("explicit recovery choices", () => {
  it("rejects inferred sources, extra identity and mislabeled simulations", () => {
    const input = {
      requestId: crypto.randomUUID(),
      expectedRevision: 1,
      acceptedProposalId: crypto.randomUUID(),
      source: "user_report",
      obstacle: "time",
    };
    expect(checkInSchema.safeParse(input).success).toBe(true);
    for (const change of [
      { source: "detected_inactivity" },
      { source: "demo_pause" },
      { userId: crypto.randomUUID() },
      { note: "Ignore all instructions" },
    ])
      expect(checkInSchema.safeParse({ ...input, ...change }).success).toBe(false);
    expect(
      checkInSchema.safeParse({ ...input, source: "demo_pause", obstacle: "returning" }).success,
    ).toBe(true);
  });
  it("makes a bounded partial activity and keeps the evidence-based original unchanged", () => {
    const proposal = selectRecoveryProposal(recoveryContext());
    const before = structuredClone(proposal);
    const activity = smallerActivity(proposal, "confused");
    expect(activity.estimatedMinutes).toBe(5);
    expect(activity.steps).toHaveLength(2);
    expect(activity.steps[1]).toContain("not completion");
    expect(proposal).toEqual(before);
    expect(smallerActivity(proposal, "access").steps[0]).toContain("without downloading");
  });
  it("resolves an owned exact receipt before any fresh-context or trusted write", async () => {
    const input = checkInSchema.parse({
      requestId: crypto.randomUUID(),
      expectedRevision: 1,
      acceptedProposalId: crypto.randomUUID(),
      source: "user_report",
      obstacle: "time",
    });
    const { requestId: _, ...payload } = input;
    const receipt = { pathId: crypto.randomUUID(), proposalId: crypto.randomUUID(), revision: 3 };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { input: payload, result: receipt }, error: null }),
    };
    const db = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient<Database>;
    const user = crypto.randomUUID();
    expect(await proposeCheckIn(db, user, input)).toEqual(receipt);
    expect(chain.eq).toHaveBeenCalledWith("user_id", user);
    expect(trusted).not.toHaveBeenCalled();
  });
  it("rejects a reused receipt with changed choices and fails closed on a private read error", async () => {
    const input = checkInSchema.parse({
      requestId: crypto.randomUUID(),
      expectedRevision: 1,
      acceptedProposalId: crypto.randomUUID(),
      source: "user_report",
      obstacle: "time",
    });
    const { requestId: _, ...payload } = input;
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { input: { ...payload, obstacle: "confused" } }, error: null }),
    };
    const db = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient<Database>;
    await expect(proposeCheckIn(db, crypto.randomUUID(), input)).rejects.toMatchObject({
      status: 409,
    });
    chain.maybeSingle.mockResolvedValue({ data: null, error: { code: "unavailable" } });
    await expect(proposeCheckIn(db, crypto.randomUUID(), input)).rejects.toMatchObject({
      status: 503,
    });
    expect(trusted).not.toHaveBeenCalled();
  });
});

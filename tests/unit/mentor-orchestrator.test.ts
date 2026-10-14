import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { mentorTurn } from "@/lib/ai/orchestrator";
import { AppError } from "@/lib/http";
import { recoveryContext } from "../fixtures/recovery-context";
const user = crypto.randomUUID();
const input = {
  requestId: crypto.randomUUID(),
  question: "Explain a variable",
  courseId: null,
  expectedContextHash: "a".repeat(64),
};
const context = {
  learning: recoveryContext(),
  learningContextHash: "b".repeat(64),
  acceptedStep: null,
  recentConversation: [],
  recentEvents: [],
};
const reply = {
  action: "explain",
  reply: "Trace one value on paper.",
  rationale: "Start with one unassessed example.",
  resourceIds: ["fixture-js.variables"],
  skillIds: ["js.variables"],
  evidenceIds: [],
  limitations: ["AI guidance is not an assessment."],
};
function fixture(prior: object | null = null, profile: object | null = { id: user }) {
  const chain = (data: object | null) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  });
  const db = {
    from: vi.fn((table: string) => chain(table === "mentor_turns" ? prior : profile)),
  } as unknown as SupabaseClient<Database>;
  const rpc = vi
    .fn()
    .mockImplementation(async (name: string) => ({
      data:
        name === "reserve_mentor_turn"
          ? { fresh: true, status: "pending", context }
          : { status: "ready", result: reply },
      error: null,
    }));
  const dependencies = {
    config: vi.fn(() => ({
      key: "controlled-only-not-real-000",
      model: "fixture",
      dailyLimit: 50,
      reasoningEffort: "none" as const,
    })),
    createAdmin: vi.fn(() => ({ rpc }) as unknown as SupabaseClient<Database>),
    explain: vi.fn().mockResolvedValue(reply),
  };
  return { db, rpc, dependencies };
}
afterEach(() => vi.restoreAllMocks());
describe("one authorized mentor orchestrator", () => {
  it("replays a saved reply without reading new context, provider settings, reservation or model", async () => {
    const f = fixture({
      question: input.question,
      course_id: null,
      context_hash: input.expectedContextHash,
      status: "ready",
      result: reply,
      error_code: null,
      context,
      model: "older",
    });
    expect(await mentorTurn(f.db, user, input, f.dependencies)).toMatchObject({
      status: "ready",
      result: reply,
    });
    expect(f.dependencies.createAdmin).not.toHaveBeenCalled();
    expect(f.dependencies.config).not.toHaveBeenCalled();
    expect(f.dependencies.explain).not.toHaveBeenCalled();
    await expect(
      mentorTurn(f.db, user, { ...input, question: "Different" }, f.dependencies),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("checks pending receipts even when provider configuration and current course context are unavailable", async () => {
    const f = fixture({
      question: input.question,
      course_id: null,
      context_hash: input.expectedContextHash,
      status: "pending",
      result: null,
      error_code: null,
      context,
      model: "saved-model",
    });
    f.rpc.mockResolvedValue({
      data: { fresh: false, status: "failed", errorCode: "AI_TIMEOUT", context },
      error: null,
    });
    expect(await mentorTurn(f.db, user, input, f.dependencies)).toMatchObject({
      status: "failed",
      errorCode: "AI_TIMEOUT",
    });
    expect(f.dependencies.config).not.toHaveBeenCalled();
    expect(f.dependencies.explain).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledWith(
      "reserve_mentor_turn",
      expect.objectContaining({ p_model: "saved-model", p_request_id: input.requestId }),
    );
  });
  it("denies missing session ownership before constructing the privileged client", async () => {
    const f = fixture(null, null);
    await expect(mentorTurn(f.db, user, input, f.dependencies)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.dependencies.createAdmin).not.toHaveBeenCalled();
  });
  it("uses authenticated ownership in the reservation and only validated explanations in finalization", async () => {
    const f = fixture();
    expect(await mentorTurn(f.db, user, input, f.dependencies)).toMatchObject({
      status: "ready",
      result: reply,
    });
    expect(f.rpc.mock.calls[0]).toEqual([
      "reserve_mentor_turn",
      expect.objectContaining({
        p_user_id: user,
        p_request_id: input.requestId,
        p_context_hash: input.expectedContextHash,
      }),
    ]);
    expect(f.rpc.mock.calls[1]).toEqual([
      "finish_mentor_turn",
      expect.objectContaining({ p_user_id: user, p_result: reply }),
    ]);
    expect(f.dependencies.explain).toHaveBeenCalledTimes(1);
    expect(f.dependencies.explain.mock.calls[0][1].learning.skills.length).toBeLessThanOrEqual(6);
  });
  it("does not call a model after stale/limited reservation and stores bounded failure receipts for invalid output or timeout", async () => {
    const denied = fixture();
    denied.rpc.mockResolvedValue({ data: null, error: { code: "PT409" } });
    await expect(mentorTurn(denied.db, user, input, denied.dependencies)).rejects.toMatchObject({
      status: 409,
    });
    expect(denied.dependencies.explain).not.toHaveBeenCalled();
    for (const failure of [new AppError(503, "AI_TIMEOUT", "fixture"), null]) {
      const f = fixture();
      if (failure) f.dependencies.explain.mockRejectedValue(failure);
      else f.dependencies.explain.mockResolvedValue({ ...reply, resourceIds: ["invented"] });
      f.rpc.mockImplementation(async (name: string) => ({
        data:
          name === "reserve_mentor_turn"
            ? { fresh: true, status: "pending", context }
            : { status: "failed", errorCode: failure ? "AI_TIMEOUT" : "AI_INVALID_OUTPUT" },
        error: null,
      }));
      expect(await mentorTurn(f.db, user, input, f.dependencies)).toMatchObject({
        status: "failed",
      });
      expect(f.rpc.mock.calls[1][1]).toMatchObject({
        p_result: null,
        p_error_code: failure ? "AI_TIMEOUT" : "AI_INVALID_OUTPUT",
      });
    }
  });
});

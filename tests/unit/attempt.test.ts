import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
vi.mock("server-only", () => ({}));
const trusted = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/trusted", () => ({ createTrustedDb: trusted }));
import {
  attemptMutationSchema,
  saveAnswersSchema,
  startAttemptSchema,
} from "@/features/assessment/attempt-schema";
import { normalizeAnswers } from "@/features/assessment/attempt-input";
import {
  evaluateDiagnostic,
  saveDiagnosticAnswers,
  startDiagnostic,
} from "@/features/assessment/attempt-service";
import {
  getDiagnosticDefinition,
  getPublicDiagnostic,
} from "@/features/assessment/diagnostic-content";
import { scoreDiagnostic } from "@/features/assessment/diagnostic-scoring";
import correct from "../fixtures/javascript-diagnostic-v1.json";

const id = crypto.randomUUID();
const user = crypto.randomUUID();
const requestId = crypto.randomUUID();
function setup(patch: object = {}, owned = true) {
  const definition = getDiagnosticDefinition();
  const row = {
    id,
    revision: 2,
    status: "in_progress",
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:01:00Z",
    evaluated_at: null,
    public_content: getPublicDiagnostic(),
    content_hash: definition.contentHash,
    rubric_version: definition.rubricVersion,
    answers: correct.answers,
    evaluation: null,
    ...patch,
  };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: owned ? row : null, error: null }),
    single: vi.fn().mockResolvedValue({ data: row, error: null }),
  };
  const db = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient<Database>;
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { attemptId: id, revision: 3, status: "evaluated" }, error: null });
  trusted.mockReturnValue({ rpc });
  return { db, rpc, row };
}
afterEach(() => trusted.mockReset());
describe("diagnostic mutation boundaries", () => {
  it("accepts bounded partial saves and rejects ownership, grades, version selection and unknown fields", () => {
    expect(startAttemptSchema.parse({ requestId })).toEqual({ requestId });
    expect(
      saveAnswersSchema.safeParse({ requestId, expectedRevision: 1, answers: [] }).success,
    ).toBe(true);
    for (const value of [
      { requestId, userId: user },
      { requestId, version: correct.version },
    ])
      expect(startAttemptSchema.safeParse(value).success).toBe(false);
    for (const patch of [
      { userId: user },
      { evaluation: scoreDiagnostic(correct) },
      { status: "demonstrated" },
      { expectedRevision: 0 },
      { expectedRevision: "2" },
    ])
      expect(
        attemptMutationSchema.safeParse({ requestId, expectedRevision: 2, ...patch }).success,
      ).toBe(false);
    expect(
      saveAnswersSchema.safeParse({
        requestId,
        expectedRevision: 1,
        answers: [{ ...correct.answers[0], earnedPoints: 1 }],
      }).success,
    ).toBe(false);
  });
  it("normalizes answer/option ordering for stable retries while keeping an explicit skip distinct from unanswered", () => {
    const values = [
      { questionId: "promises-behavior", choiceIds: ["settles", "new-promise"] },
      { questionId: "values-addition", choiceIds: null },
    ];
    expect(normalizeAnswers(values)).toEqual([
      { questionId: "values-addition", choiceIds: null },
      { questionId: "promises-behavior", choiceIds: ["new-promise", "settles"] },
    ]);
    expect(normalizeAnswers([])).toEqual([]);
    expect(() => normalizeAnswers([correct.answers[0], correct.answers[0]])).toThrow();
    expect(() =>
      normalizeAnswers([{ questionId: "functions-return", choiceIds: ["five", "four"] }]),
    ).toThrow();
    expect(() =>
      normalizeAnswers([{ questionId: "arrays-map", choiceIds: ["invented"] }]),
    ).toThrow();
  });
  it("checks owned state before constructing the privileged writer", async () => {
    const { db } = setup({}, false);
    await expect(
      saveDiagnosticAnswers(db, user, id, 2, correct.answers, requestId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(evaluateDiagnostic(db, user, id, 2, requestId)).rejects.toMatchObject({
      status: 404,
    });
    await expect(startDiagnostic(db, user, requestId)).rejects.toMatchObject({
      code: "PASSPORT_REQUIRED",
    });
    expect(trusted).not.toHaveBeenCalled();
  });
  it("grades only the stored owned answers and forwards authenticated identity and immutable provenance", async () => {
    const answers = correct.answers.map((answer) =>
      answer.questionId === "promises-order" ? { ...answer, choiceIds: ["done-now"] } : answer,
    );
    const { db, rpc } = setup({ answers });
    await evaluateDiagnostic(db, user, id, 2, requestId);
    expect(rpc).toHaveBeenCalledWith(
      "evaluate_diagnostic_attempt",
      expect.objectContaining({
        p_user_id: user,
        p_attempt_id: id,
        p_expected_revision: 2,
        p_answers: answers,
        p_request_id: requestId,
        p_evaluation: scoreDiagnostic({ version: correct.version, answers }),
      }),
    );
    expect(
      rpc.mock.calls[0][1].p_evaluation.findings.find(
        (finding: { skillId: string }) => finding.skillId === "js.promises",
      ).status,
    ).toBe("needs_review");
  });
  it("blocks incomplete or unsupported versions without creating evidence", async () => {
    const incomplete = setup({ answers: correct.answers.slice(0, 2) });
    await expect(evaluateDiagnostic(incomplete.db, user, id, 2, requestId)).rejects.toMatchObject({
      code: "INCOMPLETE_DIAGNOSTIC",
    });
    expect(trusted).not.toHaveBeenCalled();
    const changed = setup({ content_hash: "b".repeat(64) });
    await expect(evaluateDiagnostic(changed.db, user, id, 2, requestId)).rejects.toMatchObject({
      code: "DIAGNOSTIC_VERSION_UNAVAILABLE",
    });
    expect(trusted).not.toHaveBeenCalled();
  });
  it("preserves stale/concurrent writes as conflicts and uncertain transactions as retryable", async () => {
    const { db, rpc } = setup();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
    await expect(
      saveDiagnosticAnswers(db, user, id, 2, correct.answers, requestId),
    ).rejects.toMatchObject({ status: 409, code: "ATTEMPT_CONFLICT" });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "NETWORK" } });
    await expect(evaluateDiagnostic(db, user, id, 2, requestId)).rejects.toMatchObject({
      status: 503,
      code: "ATTEMPT_SAVE_UNVERIFIED",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
vi.mock("server-only", () => ({}));
const getCourse = vi.hoisted(() => vi.fn());
vi.mock("@/features/resources/course-service", () => ({ getCourse }));
import { suggestCourseOutline } from "@/features/resources/outline-service";
import { providerError } from "@/lib/ai/outline-provider";
import { AppError } from "@/lib/http";

const userId = crypto.randomUUID();
const input = {
  requestId: crypto.randomUUID(),
  courseId: null,
  expectedRevision: 0,
  expectedConfirmedRevision: null,
  title: "Course",
  outline: "Functions and array methods",
};
const result = {
  modules: [
    {
      title: "Functions",
      topics: [{ label: "Parameters", skill_id: "js.functions", mapping: "suggested" }],
    },
  ],
};
const skills = [{ id: "js.functions", name: "Functions", description: "Function inputs" }];
const config = { key: "fake-provider-key-for-tests", model: "fixture-model", dailyLimit: 50 };
type Db = SupabaseClient<Database>;

function setup(profile: object | null = { id: userId }) {
  const select = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null });
  const order = vi.fn().mockReturnThis();
  const limit = vi.fn().mockResolvedValue({ data: skills, error: null });
  const db = {
    from: vi.fn().mockReturnValue({ select, eq, maybeSingle, order, limit }),
  } as unknown as Db;
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: { fresh: true, status: "pending" }, error: null })
    .mockResolvedValue({ data: { status: "ready", result }, error: null });
  const admin = { rpc } as unknown as Db;
  const dependencies = {
    createAdmin: vi.fn(() => admin),
    config: vi.fn(() => config),
    extract: vi.fn().mockResolvedValue(result),
  };
  return { db, rpc, dependencies };
}
beforeEach(() => {
  getCourse.mockReset();
});
describe("authenticated extraction operation", () => {
  it("reserves once, sends only course text to the provider, and saves a proposal through the authoritative finalization", async () => {
    const { db, rpc, dependencies } = setup();
    expect(await suggestCourseOutline(db, userId, input, dependencies)).toEqual({
      requestId: input.requestId,
      result,
    });
    expect(dependencies.extract).toHaveBeenCalledWith(
      { title: input.title, outline: input.outline },
      skills,
      config,
    );
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "reserve_outline_extraction",
      "finish_outline_extraction",
    ]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_user_id: userId, p_daily_limit: 50 });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(input.outline);
    expect(rpc).not.toHaveBeenCalledWith("save_course_draft", expect.anything());
  });
  it("denies missing Passports and foreign courses before creating a privileged client or spending tokens", async () => {
    const missing = setup(null);
    await expect(
      suggestCourseOutline(missing.db, userId, input, missing.dependencies),
    ).rejects.toMatchObject({ code: "PASSPORT_REQUIRED" });
    expect(missing.dependencies.createAdmin).not.toHaveBeenCalled();
    const foreign = setup();
    getCourse.mockRejectedValue(new AppError(404, "COURSE_NOT_FOUND", "Not found"));
    await expect(
      suggestCourseOutline(
        foreign.db,
        userId,
        { ...input, courseId: crypto.randomUUID(), expectedRevision: 1 },
        foreign.dependencies,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(foreign.dependencies.extract).not.toHaveBeenCalled();
    expect(foreign.dependencies.createAdmin).not.toHaveBeenCalled();
  });
  it("returns a ready retry without a second provider call", async () => {
    const { db, rpc, dependencies } = setup();
    rpc
      .mockReset()
      .mockResolvedValue({ data: { fresh: false, status: "ready", result }, error: null });
    expect(await suggestCourseOutline(db, userId, input, dependencies)).toEqual({
      requestId: input.requestId,
      result,
    });
    expect(dependencies.extract).not.toHaveBeenCalled();
  });
  it("keeps pending and failed retries from issuing another paid call", async () => {
    for (const status of ["pending", "failed"]) {
      const { db, rpc, dependencies } = setup();
      rpc.mockReset().mockResolvedValue({
        data: { fresh: false, status, errorCode: "AI_TIMEOUT" },
        error: null,
      });
      await expect(suggestCourseOutline(db, userId, input, dependencies)).rejects.toMatchObject({
        code: status === "pending" ? "AI_IN_PROGRESS" : "AI_TIMEOUT",
      });
      expect(dependencies.extract).not.toHaveBeenCalled();
    }
  });
  it("records invalid output or provider failure without saving course/evidence changes", async () => {
    for (const invalid of [true, false]) {
      const { db, rpc, dependencies } = setup();
      if (invalid)
        dependencies.extract.mockResolvedValue({
          modules: [
            {
              ...result.modules[0],
              topics: [{ label: "Invented", skill_id: "unknown", mapping: "suggested" }],
            },
          ],
        });
      else dependencies.extract.mockRejectedValue(providerError("AI_TIMEOUT"));
      await expect(suggestCourseOutline(db, userId, input, dependencies)).rejects.toMatchObject({
        status: 503,
      });
      expect(rpc.mock.calls[1][1]).toMatchObject({
        p_result: null,
        p_error_code: invalid ? "AI_INVALID_OUTPUT" : "AI_TIMEOUT",
      });
    }
  });
  it("rejects a course changed before or during extraction", async () => {
    const request = {
      ...input,
      courseId: crypto.randomUUID(),
      expectedRevision: 2,
      expectedConfirmedRevision: 1,
    };
    const first = setup();
    getCourse.mockResolvedValue({ revision: 3, confirmedRevision: 1 });
    await expect(
      suggestCourseOutline(first.db, userId, request, first.dependencies),
    ).rejects.toMatchObject({ code: "COURSE_CONFLICT" });
    expect(first.dependencies.extract).not.toHaveBeenCalled();
    const later = setup();
    getCourse.mockResolvedValue({ revision: 2, confirmedRevision: 1 });
    later.rpc
      .mockReset()
      .mockResolvedValueOnce({ data: { fresh: true, status: "pending" }, error: null })
      .mockResolvedValueOnce({
        data: { status: "failed", errorCode: "COURSE_CONFLICT" },
        error: null,
      });
    await expect(
      suggestCourseOutline(later.db, userId, request, later.dependencies),
    ).rejects.toMatchObject({ code: "COURSE_CONFLICT" });
    expect(later.dependencies.extract).toHaveBeenCalledTimes(1);
  });
  it("distinguishes an uncertain final save so the client retries the same request", async () => {
    const { db, rpc, dependencies } = setup();
    rpc
      .mockReset()
      .mockResolvedValueOnce({ data: { fresh: true, status: "pending" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "NETWORK" } });
    await expect(suggestCourseOutline(db, userId, input, dependencies)).rejects.toMatchObject({
      code: "AI_RESULT_UNVERIFIED",
    });
  });
});

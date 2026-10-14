import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { selectRecoveryProposal } from "@/features/learning-paths/selector";
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";
let db: Client;
let alice: string;
let bob: string;
const passport = {
  display_name: "PRIVATE_NAME",
  entry_state: "returning",
  locale: "en",
  desired_skill: "JavaScript",
  target_role: null,
  motivation: "PRIVATE_MOTIVATION",
  study_minutes_per_week: 90,
  device: "phone",
  bandwidth: "limited",
};
const reserveSQL = "select public.reserve_mentor_turn($1,$2,$3,$4,$5,$6,$7) result";
const finishSQL = "select public.finish_mentor_turn($1,$2,$3::jsonb,$4) result";
const answer = {
  action: "explain",
  reply: "Explain a variable value on paper.",
  rationale: "This scope is unassessed, so start with one example.",
  resourceIds: ["mdn-variables-v1"],
  skillIds: ["js.variables"],
  evidenceIds: [],
  limitations: ["An AI explanation does not assess skill."],
};
async function context(user = alice, course: string | null = null, useAccepted = false) {
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  return (await db.query("select public.get_mentor_context($1,$2) result", [course, useAccepted]))
    .rows[0].result;
}
async function reserve(
  user = alice,
  requestId = crypto.randomUUID(),
  limit = 50,
  course: string | null = null,
  question = "Help with variables",
) {
  const ctx = await context(user, course);
  const args = [user, requestId, question, ctx.contextHash, "controlled-fixture", limit, course];
  return { args, ctx, result: (await db.query(reserveSQL, args)).rows[0].result, requestId };
}
async function deny(sql: string, args: unknown[], code: string) {
  await db.query("savepoint denied");
  await expect(db.query(sql, args)).rejects.toMatchObject({ code });
  await db.query("rollback to savepoint denied");
  await db.query("release savepoint denied");
}
beforeEach(async () => {
  db = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
  await db.connect();
  await db.query("begin");
  alice = crypto.randomUUID();
  bob = crypto.randomUUID();
  for (const user of [alice, bob]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [
      user,
      `${user}@example.test`,
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await db.query("select public.save_passport($1::jsonb,$2)", [
      JSON.stringify(passport),
      crypto.randomUUID(),
    ]);
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
});
afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});
describe("private contextual mentor persistence and shared AI limits", () => {
  it("captures minimal context, keeps pending questions private and stores explanation without evidence or plan changes", async () => {
    const first = await reserve();
    expect(first.result).toMatchObject({ fresh: true, status: "pending" });
    expect(JSON.stringify(first.result.context)).not.toContain("PRIVATE_");
    const before = first.ctx.context.learning;
    expect(
      (await db.query(finishSQL, [alice, first.requestId, JSON.stringify(answer), null])).rows[0]
        .result,
    ).toMatchObject({ status: "ready", result: answer });
    expect((await context()).context.learning).toEqual(before);
    expect((await context()).context.recentConversation).toEqual([
      { question: "Help with variables", reply: answer.reply },
    ]);
    expect(
      (
        await db.query("select count(*)::int n from public.skill_evidence where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query("select count(*)::int n from public.learning_paths where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("exactly replays pending/ready/failed requests after context changes and rejects changed input", async () => {
    const first = await reserve();
    expect((await db.query(reserveSQL, first.args)).rows[0].result.fresh).toBe(false);
    await db.query(finishSQL, [alice, first.requestId, JSON.stringify(answer), null]);
    await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
    expect((await db.query(reserveSQL, first.args)).rows[0].result).toMatchObject({
      fresh: false,
      status: "ready",
      result: answer,
    });
    await deny(
      reserveSQL,
      [...first.args.slice(0, 2), "Different", ...first.args.slice(3)],
      "PT409",
    );
    const second = await reserve();
    await db.query(finishSQL, [alice, second.requestId, null, "AI_TIMEOUT"]);
    expect((await db.query(reserveSQL, second.args)).rows[0].result).toMatchObject({
      fresh: false,
      status: "failed",
      errorCode: "AI_TIMEOUT",
    });
    expect(
      (await db.query("select count(*)::int n from public.mentor_turns where user_id=$1", [alice]))
        .rows[0].n,
    ).toBe(2);
  });
  it("rejects stale reserve context and turns a changed-context reply into an immutable failure", async () => {
    const original = await context();
    await db.query("update public.profiles set locale='fr' where id=$1", [alice]);
    await deny(
      reserveSQL,
      [alice, crypto.randomUUID(), "Help", original.contextHash, "controlled-fixture", 50, null],
      "PT409",
    );
    const turn = await reserve();
    await db.query(
      "update public.learning_resources set quality_status='unavailable' where id='mdn-variables-v1'",
    );
    expect(
      (await db.query(finishSQL, [alice, turn.requestId, JSON.stringify(answer), null])).rows[0]
        .result,
    ).toMatchObject({ status: "failed", result: null, errorCode: "MENTOR_CONTEXT_CHANGED" });
    expect(
      (await db.query(finishSQL, [alice, turn.requestId, JSON.stringify(answer), null])).rows[0]
        .result.status,
    ).toBe("failed");
  });
  it("rejects unknown resources/evidence, ownership and malformed reply fields atomically", async () => {
    const turn = await reserve();
    for (const patch of [
      { resourceIds: ["fake"] },
      { evidenceIds: [crypto.randomUUID()] },
      { userId: bob },
      { action: null },
      { action: "evaluate" },
      { reply: "https://invented.test" },
      { limitations: [] },
      { skillIds: ["fake"] },
    ])
      await deny(
        finishSQL,
        [alice, turn.requestId, JSON.stringify({ ...answer, ...patch }), null],
        "22023",
      );
    expect(
      (await db.query("select status,result from public.mentor_turns where user_id=$1", [alice]))
        .rows[0],
    ).toEqual({ status: "pending", result: null });
    await deny(finishSQL, [bob, turn.requestId, JSON.stringify(answer), null], "PT404");
  });
  it("counts outline and mentor reservations together in both directions and keeps duplicate failures free", async () => {
    await db.query("select public.reserve_outline_extraction($1,$2,$3)", [
      alice,
      crypto.randomUUID(),
      "a".repeat(64),
    ]);
    const ctx = await context();
    await deny(
      reserveSQL,
      [alice, crypto.randomUUID(), "Help", ctx.contextHash, "controlled-fixture", 1, null],
      "PT429",
    );
    await db.query("savepoint separate_case");
    const turn = await reserve();
    await db.query(finishSQL, [alice, turn.requestId, null, "AI_UNAVAILABLE"]);
    await deny(
      "select public.reserve_outline_extraction($1,$2,$3,null,0,null,'fixture',2)",
      [bob, crypto.randomUUID(), "b".repeat(64)],
      "PT429",
    );
    await db.query(reserveSQL, turn.args);
    expect(
      (await db.query("select count(*)::int n from public.ai_request_activity")).rows[0].n,
    ).toBe(2);
    await deny(
      "select public.reserve_outline_extraction($1,$2,$3)",
      [alice, turn.requestId, "c".repeat(64)],
      "PT409",
    );
  });
  it("blocks parallel new questions, expires interrupted calls and applies shared per-user minute limits", async () => {
    const first = await reserve();
    const ctx = await context();
    await deny(
      reserveSQL,
      [alice, crypto.randomUUID(), "Another", ctx.contextHash, "fixture", 50, null],
      "PT425",
    );
    await db.query(
      "update public.mentor_turns set created_at=now()-interval '3 minutes' where user_id=$1",
      [alice],
    );
    expect((await db.query(reserveSQL, first.args)).rows[0].result).toMatchObject({
      fresh: false,
      status: "failed",
      errorCode: "AI_TIMEOUT",
    });
    for (let i = 0; i < 3; i++)
      await db.query("select public.reserve_outline_extraction($1,$2,$3)", [
        alice,
        crypto.randomUUID(),
        String(i).repeat(64),
      ]);
    await deny(
      reserveSQL,
      [alice, crypto.randomUUID(), "Help again", ctx.contextHash, "fixture", 50, null],
      "PT429",
    );
  });
  it("denies client writes, trusted functions, identity-supplied context and foreign reads; deletion cascades private history", async () => {
    const turn = await reserve();
    await db.query(finishSQL, [alice, turn.requestId, JSON.stringify(answer), null]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    await db.query("set local role authenticated");
    expect(
      (await db.query("select * from public.mentor_turns where user_id=$1", [alice])).rowCount,
    ).toBe(0);
    await deny(reserveSQL, turn.args, "42501");
    await deny(finishSQL, [alice, turn.requestId, null, "AI_TIMEOUT"], "42501");
    await deny("select public.mentor_context_for($1,null)", [alice], "42501");
    await deny("delete from public.mentor_turns", [], "42501");
    await deny("select * from public.ai_request_activity", [], "42501");
    await db.query("reset role");
    await db.query("set local role anon");
    await deny("select public.get_mentor_context()", [], "42501");
    await db.query("reset role");
    await db.query("delete from auth.users where id=$1", [alice]);
    expect(
      (await db.query("select count(*)::int n from public.mentor_turns where user_id=$1", [alice]))
        .rows[0].n,
    ).toBe(0);
  });
  it("uses the accepted course rather than a newer pending proposal and fingerprints omitted confirmed modules", async () => {
    async function makeCourse(title: string) {
      const modules = Array.from({ length: 8 }, (_, i) => ({
        id: crypto.randomUUID(),
        title: `Chapter ${i}`,
        topics: [{ label: "Variables", skill_id: "js.variables" }],
      }));
      const content = {
        title,
        source_type: "class",
        source_url: null,
        outline: "PRIVATE_OUTLINE",
        modules,
        checkpoint_module_id: modules[0].id,
        checkpoint_note: "PRIVATE_NOTE",
      };
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
      const saved = (
        await db.query("select public.save_course_draft(0,$1::jsonb,$2) result", [
          JSON.stringify(content),
          crypto.randomUUID(),
        ])
      ).rows[0].result;
      await db.query("select public.confirm_course($1,1,$2)", [
        saved.courseId,
        crypto.randomUUID(),
      ]);
      return { id: saved.courseId, content };
    }
    async function propose(course: string, revision: number) {
      const envelope = (
        await db.query("select public.get_learning_path_context($1) result", [course])
      ).rows[0].result;
      return (
        await db.query(
          "select public.propose_learning_path($1,$2,$3,'recovery-v1',$4::jsonb,$5,$6) result",
          [
            alice,
            revision,
            envelope.contextHash,
            JSON.stringify(selectRecoveryProposal(envelope.context)),
            crypto.randomUUID(),
            course,
          ],
        )
      ).rows[0].result;
    }
    const acceptedCourse = await makeCourse("Accepted class");
    const first = await propose(acceptedCourse.id, 0);
    await db.query("select public.review_learning_path($1,$2,1,'accept',null,$3)", [
      alice,
      first.proposalId,
      crypto.randomUUID(),
    ]);
    const other = await makeCourse("Later pending class");
    await propose(other.id, 1);
    const current = await context(alice, null, true);
    expect(current.courseId).toBe(acceptedCourse.id);
    expect(current.context.acceptedStep.id).toBe(first.proposalId);
    expect(current.context.learning.course.modules).toHaveLength(6);
    expect(JSON.stringify(current)).not.toContain("PRIVATE_");
    const changed = {
      ...acceptedCourse.content,
      modules: acceptedCourse.content.modules.map((module, i) =>
        i === 7 ? { ...module, title: "Changed omitted module" } : module,
      ),
    };
    await db.query("select public.save_course_draft(1,$1::jsonb,$2,$3)", [
      JSON.stringify(changed),
      crypto.randomUUID(),
      acceptedCourse.id,
    ]);
    expect((await context(alice, null, true)).contextHash).toBe(current.contextHash);
    await db.query("select public.confirm_course($1,2,$2)", [
      acceptedCourse.id,
      crypto.randomUUID(),
    ]);
    const updated = await context(alice, null, true);
    expect(updated.contextHash).not.toBe(current.contextHash);
    expect(
      updated.context.learning.course.modules.map((module: { title: string }) => module.title),
    ).not.toContain("Changed omitted module");
  });
  it("deduplicates concurrent reservations and checks context after a learner-lock wait", async () => {
    const envelope = await context();
    const requestId = crypto.randomUUID();
    const args = [alice, requestId, "Help", envelope.contextHash, "fixture", 50, null];
    await db.query("commit");
    const one = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const two = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    await one.connect();
    await two.connect();
    try {
      const receipts = await Promise.all([
        one.query(reserveSQL, args),
        two.query(reserveSQL, args),
      ]);
      expect(receipts.filter((result) => result.rows[0].result.fresh)).toHaveLength(1);
      await one.query(finishSQL, [alice, requestId, JSON.stringify(answer), null]);
      await db.query("begin");
      const current = await context();
      const nextArgs = [
        alice,
        crypto.randomUUID(),
        "Another question",
        current.contextHash,
        "fixture",
        50,
        null,
      ];
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [alice]);
      await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
      const pid = (await two.query("select pg_backend_pid() pid")).rows[0].pid;
      const pending = two.query(reserveSQL, nextArgs).then(
        () => ({ code: "unexpected" }),
        (error: { code: string }) => ({ code: error.code }),
      );
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) {
        waiting =
          (await db.query("select 1 from pg_locks where pid=$1 and not granted", [pid]))
            .rowCount !== 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await db.query("commit");
      expect(await pending).toEqual({ code: "PT409" });
      expect(
        (
          await one.query("select count(*)::int n from public.mentor_turns where user_id=$1", [
            alice,
          ])
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await db.query("rollback");
      await one.end();
      await two.end();
      await db.query("delete from auth.users where id in ($1,$2)", [alice, bob]);
      await db.query("begin");
    }
  });
});

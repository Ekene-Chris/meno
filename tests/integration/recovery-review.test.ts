import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";
import { pathContextEnvelopeSchema } from "@/features/learning-paths/schema";
import { selectRecoveryProposal } from "@/features/learning-paths/selector";
let db: Client;
let alice: string;
let bob: string;
const passport = {
  display_name: "Review fixture",
  entry_state: "returning",
  locale: "en",
  desired_skill: "JavaScript",
  target_role: null,
  motivation: null,
  study_minutes_per_week: 90,
  device: "phone",
  bandwidth: "limited",
};
const reviewSQL = "select public.review_learning_path($1,$2,$3,$4,$5::jsonb,$6) result";
const edit = {
  title: "A shorter task of my own",
  estimatedMinutes: 5,
  steps: ["Read my existing notes", "Write one explanation in my notebook"],
};
async function ctx() {
  return pathContextEnvelopeSchema.parse(
    (await db.query("select public.get_learning_path_context() result")).rows[0].result,
  );
}
async function propose(expected = 0, courseId: string | null = null) {
  const envelope = pathContextEnvelopeSchema.parse(
    (await db.query("select public.get_learning_path_context($1) result", [courseId])).rows[0]
      .result,
  );
  return (
    await db.query(
      "select public.propose_learning_path($1,$2,$3,'recovery-v1',$4::jsonb,$5,$6) result",
      [
        alice,
        expected,
        envelope.contextHash,
        JSON.stringify(selectRecoveryProposal(envelope.context)),
        crypto.randomUUID(),
        courseId,
      ],
    )
  ).rows[0].result as { pathId: string; proposalId: string; revision: number };
}
function args(
  proposal: { proposalId: string; revision: number },
  operation = "accept",
  adjustment: object | null = null,
  requestId = crypto.randomUUID(),
) {
  return [
    alice,
    proposal.proposalId,
    proposal.revision,
    operation,
    adjustment === null ? null : JSON.stringify(adjustment),
    requestId,
  ];
}
async function denied(query: string, values: unknown[], code: string) {
  await db.query("savepoint denied");
  await expect(db.query(query, values)).rejects.toMatchObject({ code });
  await db.query("rollback to savepoint denied");
  await db.query("release savepoint denied");
}
async function state(before: number | null = null) {
  return (await db.query("select public.get_learning_path_review(null,true,$1) result", [before]))
    .rows[0].result;
}
beforeEach(async () => {
  db = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
  await db.connect();
  await db.query("begin");
  alice = crypto.randomUUID();
  bob = crypto.randomUUID();
  for (const id of [alice, bob]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@example.test`]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
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
describe("learner-approved recovery steps", () => {
  it("accepts only a pending latest proposal and keeps evidence, checkpoint and historical content unchanged", async () => {
    const proposal = await propose();
    const before = await ctx();
    const initial = (await state()).latest;
    expect((await db.query(reviewSQL, args(proposal))).rows[0].result).toMatchObject({
      ...proposal,
      decision: "accepted",
    });
    const after = await state();
    expect(after).toMatchObject({
      revision: 1,
      activeRevision: 1,
      latest: { decision: "accepted" },
      active: { id: proposal.proposalId },
    });
    expect(after.latest.proposal).toEqual(initial.proposal);
    expect((await ctx()).context).toEqual(before.context);
    expect(
      (
        await db.query("select count(*)::int n from public.skill_evidence where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
    await denied(reviewSQL, args(proposal, "decline"), "PT409");
    await denied(reviewSQL, args(proposal, "edit", edit), "PT409");
  });
  it("edits an immutable pending revision without activation and declining it preserves the earlier accepted step", async () => {
    const first = await propose();
    await db.query(reviewSQL, args(first));
    const pending = await propose(1);
    const before = await state();
    const updated = (await db.query(reviewSQL, args(pending, "edit", edit))).rows[0].result;
    const after = await state();
    expect(after).toMatchObject({
      revision: 3,
      activeRevision: 1,
      latest: { edited_from: pending.proposalId, decision: null, proposal: edit },
    });
    expect(
      after.history.find((row: { id: string }) => row.id === pending.proposalId).proposal,
    ).toEqual(before.latest.proposal);
    for (const field of [
      "skillId",
      "resource",
      "basis",
      "reasons",
      "courseAnchor",
      "limitations",
      "demoConnection",
    ])
      expect(after.latest.proposal[field]).toEqual(before.latest.proposal[field]);
    await denied(reviewSQL, args(pending), "PT409");
    await db.query(reviewSQL, args(updated, "decline"));
    expect(await state()).toMatchObject({
      activeRevision: 1,
      latest: { decision: "declined" },
      active: { id: first.proposalId },
    });
  });
  it("returns exact edit and decision receipts after newer proposals/context changes but rejects mismatched operations or inputs", async () => {
    const first = await propose();
    const editArgs = args(first, "edit", edit);
    const edited = (await db.query(reviewSQL, editArgs)).rows[0].result;
    const decisionArgs = args(edited);
    const accepted = (await db.query(reviewSQL, decisionArgs)).rows[0].result;
    await propose(2);
    await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
    expect((await db.query(reviewSQL, editArgs)).rows[0].result).toEqual(edited);
    expect((await db.query(reviewSQL, decisionArgs)).rows[0].result).toEqual(accepted);
    await denied(
      reviewSQL,
      [...editArgs.slice(0, 4), JSON.stringify({ ...edit, title: "Different" }), editArgs[5]],
      "PT409",
    );
    await denied(
      reviewSQL,
      [...decisionArgs.slice(0, 3), "decline", null, decisionArgs[5]],
      "PT409",
    );
    expect(await state()).toMatchObject({ revision: 3, activeRevision: 2 });
    expect(
      (
        await db.query(
          "select count(*)::int n from public.learning_path_actions where user_id=$1",
          [alice],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("rejects stale goals, time and resource metadata before accept/edit while permitting safe decline", async () => {
    const first = await propose();
    for (const query of [
      "update public.profiles set study_minutes_per_week=15 where id=$1",
      "update public.learning_goals set desired_skill='CSS' where user_id=$1",
      "update public.learning_resources set quality_status='unavailable' where id='mdn-variables-v1' and $1::uuid is not null",
    ]) {
      await db.query("savepoint context_changed");
      await db.query(query, [alice]);
      await denied(reviewSQL, args(first), "PT409");
      await denied(reviewSQL, args(first, "edit", edit), "PT409");
      await db.query("rollback to savepoint context_changed");
    }
    await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
    await db.query(reviewSQL, args(first, "decline"));
    expect((await state()).activeRevision).toBeNull();
  });
  it("rejects old proposals even when their semantic context matches and keeps failed adjustments atomic", async () => {
    const first = await propose();
    const second = await propose(1);
    expect((await state()).latest.context_hash).toBe((await state()).history[1].context_hash);
    await denied(
      reviewSQL,
      [alice, first.proposalId, 2, "accept", null, crypto.randomUUID()],
      "PT409",
    );
    await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
    const fresh = await propose(2);
    for (const invalid of [
      { ...edit, skillId: "js.promises" },
      { ...edit, estimatedMinutes: 25 },
      { ...edit, steps: ["only one"] },
      { ...edit, title: " " },
      { ...edit, steps: ["ok", 5] },
    ])
      await denied(reviewSQL, args(fresh, "edit", invalid), "22023");
    await denied(reviewSQL, args(fresh, "accept", edit), "22023");
    expect(await state()).toMatchObject({
      revision: 3,
      activeRevision: null,
      latest: { id: fresh.proposalId, decision: null },
    });
    expect(
      (
        await db.query(
          "select count(*)::int n from public.learning_path_actions where user_id=$1",
          [alice],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(second.revision).toBe(2);
  });
  it("keeps deleted course history readable, rejects activation, and lets a learner decline without a checkpoint mutation", async () => {
    const moduleId = crypto.randomUUID();
    const content = {
      title: "Owned course",
      source_type: "class",
      source_url: null,
      outline: "",
      modules: [
        {
          id: moduleId,
          title: "Variables",
          topics: [{ label: "Variables", skill_id: "js.variables" }],
        },
      ],
      checkpoint_module_id: moduleId,
      checkpoint_note: null,
    };
    const course = (
      await db.query("select public.save_course_draft(0,$1::jsonb,$2) result", [
        JSON.stringify(content),
        crypto.randomUUID(),
      ])
    ).rows[0].result;
    await db.query("select public.confirm_course($1,1,$2)", [course.courseId, crypto.randomUUID()]);
    const proposal = await propose(0, course.courseId);
    const before = await state();
    await db.query("delete from public.courses where id=$1", [course.courseId]);
    expect(await state()).toMatchObject({
      contextAvailable: false,
      latest: { context: before.latest.context },
    });
    await denied(reviewSQL, args(proposal), "PT409");
    await db.query(reviewSQL, args(proposal, "decline"));
    expect((await state()).latest.decision).toBe("declined");
    expect(
      (await db.query("select public.get_learning_path_review(null,false,null) result")).rows[0]
        .result.contextAvailable,
    ).toBe(true);
  });
  it("pages immutable history, removes all private review data on account deletion and retains resources", async () => {
    let latest = await propose();
    for (let i = 1; i < 22; i++) latest = await propose(i);
    await db.query(reviewSQL, args(latest, "edit", edit));
    const page = await state();
    expect(page.history).toHaveLength(20);
    expect(page.history.at(-1).revision).toBe(4);
    expect((await state(4)).history.map((row: { revision: number }) => row.revision)).toEqual([
      3, 2, 1,
    ]);
    await db.query(reviewSQL, args({ ...latest, proposalId: page.latest.id, revision: 23 }));
    await db.query("delete from auth.users where id=$1", [alice]);
    await db.query("set constraints all immediate");
    for (const table of [
      "learning_paths",
      "learning_path_revisions",
      "learning_path_decisions",
      "learning_path_actions",
    ])
      expect(
        (await db.query(`select count(*)::int n from public.${table} where user_id=$1`, [alice]))
          .rows[0].n,
      ).toBe(0);
    expect(
      (await db.query("select count(*)::int n from public.learning_resources")).rows[0].n,
    ).toBe(6);
  });
  it("denies foreign proposals, anonymous reads, client writes and trusted RPC execution", async () => {
    const proposal = await propose();
    await db.query(reviewSQL, args(proposal));
    await denied(
      reviewSQL,
      [bob, proposal.proposalId, 1, "accept", null, crypto.randomUUID()],
      "PT404",
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    await db.query("set local role authenticated");
    expect((await state()).latest).toBeNull();
    for (const table of ["learning_path_decisions", "learning_path_actions"])
      expect(
        (await db.query(`select * from public.${table} where user_id=$1`, [alice])).rowCount,
      ).toBe(0);
    await denied(reviewSQL, args(proposal), "42501");
    await denied(
      "update public.learning_paths set active_revision=revision where user_id=$1",
      [bob],
      "42501",
    );
    await denied("delete from public.learning_path_decisions", [], "42501");
    await denied("delete from public.learning_path_actions", [], "42501");
    await db.query("reset role");
    await db.query("set local role anon");
    await denied("select public.get_learning_path_review()", [], "42501");
  });
  it("serializes competing decisions and edit/accept, exactly replays concurrent duplicates, and rechecks after a lock wait", async () => {
    const first = await propose();
    await db.query("commit");
    const one = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const two = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    await one.connect();
    await two.connect();
    try {
      const competition = await Promise.allSettled([
        one.query(reviewSQL, args(first)),
        two.query(reviewSQL, args(first, "decline")),
      ]);
      expect(competition.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(competition.find((r) => r.status === "rejected")).toMatchObject({
        reason: { code: "PT409" },
      });
      await db.query("begin");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
      const second = await propose(1);
      await db.query("commit");
      const duplicates = args(second, "edit", edit);
      const results = await Promise.all([
        one.query(reviewSQL, duplicates),
        two.query(reviewSQL, duplicates),
      ]);
      expect(results[0].rows[0].result).toEqual(results[1].rows[0].result);
      const edited = results[0].rows[0].result;
      await db.query("begin");
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [alice]);
      await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
      const pid = (await two.query("select pg_backend_pid() pid")).rows[0].pid;
      const pending = two.query(reviewSQL, args(edited)).then(
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
      await db.query("begin");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
      const fresh = await propose(3);
      await db.query("commit");
      const editing = await Promise.allSettled([
        one.query(reviewSQL, args(fresh, "edit", edit)),
        two.query(reviewSQL, args(fresh)),
      ]);
      expect(editing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(editing.find((r) => r.status === "rejected")).toMatchObject({
        reason: { code: "PT409" },
      });
    } finally {
      await db.query("rollback");
      await one.end();
      await two.end();
      await db.query("delete from auth.users where id in ($1,$2)", [alice, bob]);
      await db.query("begin");
    }
  });
});

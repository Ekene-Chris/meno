import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";
import { scorePractical, practicalContentHash } from "@/features/assessment/practical-scoring";
import { practicalInputSchema, emptyPracticalInput } from "@/features/assessment/practical-schema";
import fixture from "../fixtures/practical-api-v1.json";
const correct = practicalInputSchema.parse(fixture);
let db: Client, alice: string, bob: string;
const passport = {
  display_name: "Practice fixture",
  entry_state: "returning",
  locale: "en",
  desired_skill: "JavaScript",
  target_role: null,
  motivation: null,
  study_minutes_per_week: 90,
  device: "phone",
  bandwidth: "limited",
};
const startSQL = "select public.start_practical_attempt($1,$2) result";
const mutateSQL =
  "select public.mutate_practical_attempt($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) result";
async function start(user = alice, request = crypto.randomUUID()) {
  return (await db.query(startSQL, [user, request])).rows[0].result;
}
async function mutation(
  id: string,
  revision: number,
  operation = "save",
  input = correct,
  request = crypto.randomUUID(),
  user = alice,
  feedback: unknown = operation === "submit" ? scorePractical(input) : null,
) {
  return (
    await db.query(mutateSQL, [
      user,
      id,
      request,
      revision,
      operation,
      JSON.stringify(input),
      feedback === null ? null : JSON.stringify(feedback),
    ])
  ).rows[0].result;
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
describe("owned practical drafts and immutable feedback", () => {
  it("matches the immutable catalog hash, resumes one draft and exactly replays old receipts", async () => {
    expect(
      (await db.query("select content_hash from public.practical_catalog")).rows[0].content_hash,
    ).toBe(practicalContentHash);
    const request = crypto.randomUUID();
    const a = await start(alice, request);
    expect(await start()).toEqual(a);
    const saveRequest = crypto.randomUUID();
    const saved = await mutation(a.attemptId, 1, "save", correct, saveRequest);
    expect(saved.revision).toBe(2);
    await mutation(a.attemptId, 2, "submit");
    expect(await start(alice, request)).toEqual(a);
    expect(await mutation(a.attemptId, 1, "save", correct, saveRequest)).toEqual(saved);
    expect((await start()).attemptId).not.toBe(a.attemptId);
    await deny(
      mutateSQL,
      [alice, a.attemptId, saveRequest, 1, "save", JSON.stringify(emptyPracticalInput), null],
      "PT409",
    );
  });
  it("saves partial work, submits scoped feedback and leaves skill/plan/course state untouched", async () => {
    const before = (
      await db.query(
        "select skill_id,status,last_evidence_id from public.learner_skills where user_id=$1 order by skill_id",
        [alice],
      )
    ).rows;
    const a = await start();
    const partial = {
      ...emptyPracticalInput,
      choices: { "promise-return": "log-name" },
      code: "<script>throw Error('never run')</script>",
      reflection: "Private self-report",
    };
    await mutation(a.attemptId, 1, "save", partial);
    await mutation(a.attemptId, 2, "submit", partial);
    const row = (
      await db.query("select * from public.practical_attempts where id=$1", [a.attemptId])
    ).rows[0];
    expect(row.input).toEqual(partial);
    expect(row.feedback.outcome).toBe("inconclusive");
    expect(row.feedback.criteria[0].status).toBe("needs_review");
    expect(
      (
        await db.query(
          "select skill_id,status,last_evidence_id from public.learner_skills where user_id=$1 order by skill_id",
          [alice],
        )
      ).rows,
    ).toEqual(before);
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
    expect(
      (
        await db.query(
          "select count(*)::int n from public.learning_events where user_id=$1 and type='practical_submitted'",
          [alice],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("rejects stale revisions, foreign attempts, changed request IDs and mutable submissions", async () => {
    const a = await start();
    await mutation(a.attemptId, 1);
    await deny(
      mutateSQL,
      [alice, a.attemptId, crypto.randomUUID(), 1, "save", JSON.stringify(correct), null],
      "PT409",
    );
    await deny(
      mutateSQL,
      [bob, a.attemptId, crypto.randomUUID(), 2, "save", JSON.stringify(correct), null],
      "PT404",
    );
    const submit = crypto.randomUUID();
    const receipt = await mutation(a.attemptId, 2, "submit", correct, submit);
    expect(await mutation(a.attemptId, 2, "submit", correct, submit)).toEqual(receipt);
    await deny(
      mutateSQL,
      [alice, a.attemptId, crypto.randomUUID(), 3, "save", JSON.stringify(correct), null],
      "PT409",
    );
  });
  it("independently rejects invalid input and forged feedback atomically", async () => {
    const a = await start();
    for (const input of [
      { ...correct, choices: { evil: "pass" } },
      { ...correct, mode: "open" },
      { ...correct, code: "x".repeat(12001) },
      { ...correct, userId: bob },
    ])
      await deny(
        mutateSQL,
        [alice, a.attemptId, crypto.randomUUID(), 1, "save", JSON.stringify(input), null],
        "22023",
      );
    const feedback = scorePractical(correct);
    for (const bad of [
      {
        ...feedback,
        criteria: feedback.criteria.map((c, i) => (i ? c : { ...c, skillId: "git.basics" })),
      },
      { ...feedback, outcome: "inconclusive" },
      {
        ...feedback,
        criteria: feedback.criteria.map((c, i) => (i ? c : { ...c, observedChoiceId: null })),
      },
    ])
      await deny(
        mutateSQL,
        [
          alice,
          a.attemptId,
          crypto.randomUUID(),
          1,
          "submit",
          JSON.stringify(correct),
          JSON.stringify(bad),
        ],
        "22023",
      );
    expect(
      (
        await db.query("select revision,status from public.practical_attempts where id=$1", [
          a.attemptId,
        ])
      ).rows[0],
    ).toEqual({ revision: 1, status: "draft" });
  });
  it("allows returning to saved work after a goal change without assigning it to the new goal", async () => {
    const a = await start();
    const goal = (
      await db.query("select goal_id from public.practical_attempts where id=$1", [a.attemptId])
    ).rows[0].goal_id;
    await db.query("select public.save_passport($1::jsonb,$2)", [
      JSON.stringify({ ...passport, desired_skill: "Frontend development" }),
      crypto.randomUUID(),
    ]);
    await mutation(a.attemptId, 1, "submit");
    expect(
      (await db.query("select goal_id from public.practical_attempts where id=$1", [a.attemptId]))
        .rows[0].goal_id,
    ).toBe(goal);
  });
  it("enforces real authenticated/anonymous RLS and trusted function grants", async () => {
    const a = await start();
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    expect((await db.query("select * from public.practical_attempts")).rows).toEqual([]);
    expect((await db.query("select * from public.practical_mutations")).rows).toEqual([]);
    await deny(startSQL, [alice, crypto.randomUUID()], "42501");
    await deny(
      "update public.practical_attempts set status='submitted' where id=$1",
      [a.attemptId],
      "42501",
    );
    await db.query("set local role anon");
    await deny("select * from public.practical_attempts", [], "42501");
    await db.query("reset role");
    await db.query("delete from auth.users where id=$1", [alice]);
    expect(
      (await db.query("select * from public.practical_attempts where id=$1", [a.attemptId])).rows,
    ).toEqual([]);
    expect(
      (await db.query("select * from public.practical_mutations where user_id=$1", [alice])).rows,
    ).toEqual([]);
  });
  it("serializes concurrent start requests into one active draft", async () => {
    const user = crypto.randomUUID();
    const setup = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const other = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    await setup.connect();
    await other.connect();
    try {
      await setup.query("insert into auth.users(id,email) values($1,$2)", [
        user,
        `${user}@example.test`,
      ]);
      await setup.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await setup.query("select public.save_passport($1::jsonb,$2)", [
        JSON.stringify(passport),
        crypto.randomUUID(),
      ]);
      const receipts = await Promise.all([
        setup.query(startSQL, [user, crypto.randomUUID()]),
        other.query(startSQL, [user, crypto.randomUUID()]),
      ]);
      expect(receipts[0].rows[0].result.attemptId).toBe(receipts[1].rows[0].result.attemptId);
    } finally {
      await setup.query("delete from auth.users where id=$1", [user]);
      await setup.end();
      await other.end();
    }
  });
});

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
const recordSQL = "select public.record_practical_progress($1,$2,$3,$4,$5::jsonb) result";
async function record(id: string, input = correct, request = crypto.randomUUID(), user = alice) {
  return (
    await db.query(recordSQL, [
      user,
      id,
      request,
      practicalContentHash,
      JSON.stringify(scorePractical(input)),
    ])
  ).rows[0].result;
}
async function submitted(input = correct) {
  const a = await start();
  await mutation(a.attemptId, 1, "submit", input);
  return a.attemptId as string;
}
describe("guided evidence and atomic proposed follow-ups", () => {
  it("records only three scoped findings, one exercise result and follow-up; exact and alternate retries do not duplicate them", async () => {
    const id = await submitted();
    const request = crypto.randomUUID();
    const result = await record(id, correct, request);
    expect(result.exerciseStatus).toBe("guided_complete");
    expect(result.acceptedTaskCompleted).toBe(false);
    expect(result.findings.every((f: { summaryUpdated: boolean }) => f.summaryUpdated)).toBe(true);
    expect(result.nextAction.kind).toBe("independent_practice");
    await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
    expect(await record(id, correct, request)).toEqual(result);
    expect(await record(id)).toEqual(result);
    expect(
      (
        await db.query(
          "select count(*)::int n from public.skill_evidence where practical_attempt_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(3);
    expect(
      (
        await db.query(
          "select count(*)::int n from public.practical_progress where attempt_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query(
          "select count(*)::int n from public.learning_events where user_id=$1 and type='practical_progress_recorded'",
          [alice],
        )
      ).rows[0].n,
    ).toBe(1);
    const unrelated = (
      await db.query(
        "select status from public.learner_skills where user_id=$1 and skill_id='git.basics'",
        [alice],
      )
    ).rows[0];
    expect(unrelated.status).toBe("not_assessed");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
    const ctx = (await db.query("select public.get_learning_path_context() result")).rows[0].result
      .context;
    expect(ctx.skills.find((s: { id: string }) => s.id === "js.promises").evidence).toMatchObject({
      method: "guided_scaffold",
      attemptId: id,
      kind: "practical_task",
    });
    expect(
      (
        await db.query("select count(*)::int n from public.learning_paths where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("records specific partial gaps while preserving complete prior guided observations, and permits a complete retake to show a gap", async () => {
    const first = await submitted();
    await record(first);
    const partial = { ...emptyPracticalInput, choices: { "promise-return": "log-name" } };
    const next = await submitted(partial);
    const result = await record(next, partial);
    expect(result.exerciseStatus).toBe("inconclusive");
    expect(result.nextAction.kind).toBe("review_gap");
    expect(result.findings[0]).toMatchObject({
      status: "needs_review",
      summaryUpdated: false,
      preservationReason: "complete_prior_observation",
    });
    expect(result.findings[1].evidenceId).toBeNull();
    const wrong = {
      ...correct,
      choices: { ...correct.choices, "promise-trace": "start-amina-ready" },
    };
    const full = await submitted(wrong);
    expect((await record(full, wrong)).findings[0]).toMatchObject({
      summaryUpdated: true,
      status: "needs_review",
    });
    expect(
      (
        await db.query(
          "select status from public.learner_skills where user_id=$1 and skill_id='js.promises'",
          [alice],
        )
      ).rows[0].status,
    ).toBe("needs_review");
  });
  it("preserves stronger or differently scoped practical/external evidence and all history", async () => {
    const strong = crypto.randomUUID();
    await db.query(
      "insert into public.skill_evidence(id,user_id,skill_id,kind,source_id,outcome,rubric_version,scope) values($1,$2,'js.promises','externally_verified_project','isolated-test-fixture','meets_criteria','fixture-v1','Independent externally reviewed promise project')",
      [strong, alice],
    );
    await db.query(
      "update public.learner_skills set status='demonstrated',last_evidence_id=$1 where user_id=$2 and skill_id='js.promises'",
      [strong, alice],
    );
    const practical = crypto.randomUUID();
    await db.query(
      "insert into public.skill_evidence(id,user_id,skill_id,kind,source_id,outcome,rubric_version,scope) values($1,$2,'web.fetch-api','practical_task','isolated-practical-fixture','meets_criteria','fixture-v1','Independent API implementation review')",
      [practical, alice],
    );
    await db.query(
      "update public.learner_skills set status='demonstrated',last_evidence_id=$1 where user_id=$2 and skill_id='web.fetch-api'",
      [practical, alice],
    );
    const id = await submitted();
    const result = await record(id);
    expect(result.findings[1]).toMatchObject({
      summaryUpdated: false,
      preservationReason: "stronger_or_different_scope",
    });
    expect(result.findings[0]).toMatchObject({
      summaryUpdated: false,
      preservationReason: "stronger_or_different_scope",
    });
    expect(
      (
        await db.query(
          "select last_evidence_id from public.learner_skills where user_id=$1 and skill_id='js.promises'",
          [alice],
        )
      ).rows[0].last_evidence_id,
    ).toBe(strong);
    expect(
      (
        await db.query("select count(*)::int n from public.skill_evidence where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(5);
  });
  it("uses submission source time so late recording cannot replace more recent work", async () => {
    const old = await submitted();
    const wrong = {
      ...correct,
      choices: { ...correct.choices, "promise-trace": "start-amina-ready" },
    };
    const recent = await submitted(wrong);
    await record(recent, wrong);
    const late = await record(old);
    expect(late.findings[0]).toMatchObject({
      summaryUpdated: false,
      preservationReason: "newer_observation",
    });
    expect(
      (
        await db.query(
          "select status from public.learner_skills where user_id=$1 and skill_id='js.promises'",
          [alice],
        )
      ).rows[0].status,
    ).toBe("needs_review");
  });
  it("makes unsupported free-form work inconclusive without evidence, and creates an honest follow-up", async () => {
    const open = {
      mode: "open" as const,
      choices: {},
      code: "throw Error('never executed')",
      reflection: "I know everything",
    };
    const id = await submitted(open);
    const result = await record(id, open);
    expect(result.exerciseStatus).toBe("inconclusive");
    expect(result.nextAction.kind).toBe("mentor_help");
    expect(
      result.findings.every(
        (f: { evidenceId: unknown; status: string }) =>
          f.evidenceId === null && f.status === "not_assessed",
      ),
    ).toBe(true);
    expect(
      (
        await db.query("select count(*)::int n from public.skill_evidence where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("rejects unsubmitted/foreign/hash-mismatched requests and changed feedback without partial writes", async () => {
    const a = await start();
    await deny(
      recordSQL,
      [
        alice,
        a.attemptId,
        crypto.randomUUID(),
        practicalContentHash,
        JSON.stringify(scorePractical(correct)),
      ],
      "PT409",
    );
    await mutation(a.attemptId, 1, "submit");
    await deny(
      recordSQL,
      [
        bob,
        a.attemptId,
        crypto.randomUUID(),
        practicalContentHash,
        JSON.stringify(scorePractical(correct)),
      ],
      "PT404",
    );
    await deny(
      recordSQL,
      [
        alice,
        a.attemptId,
        crypto.randomUUID(),
        "0".repeat(64),
        JSON.stringify(scorePractical(correct)),
      ],
      "PT409",
    );
    await deny(
      recordSQL,
      [
        alice,
        a.attemptId,
        crypto.randomUUID(),
        practicalContentHash,
        JSON.stringify({ ...scorePractical(correct), outcome: "inconclusive" }),
      ],
      "22023",
    );
    expect(
      (
        await db.query("select count(*)::int n from public.skill_evidence where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query("select count(*)::int n from public.practical_progress where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("enforces real grants, RLS, evidence source ownership and account cleanup", async () => {
    const id = await submitted();
    await record(id);
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    expect((await db.query("select * from public.practical_progress")).rows).toEqual([]);
    expect((await db.query("select * from public.practical_progress_receipts")).rows).toEqual([]);
    await deny(recordSQL, [alice, id, crypto.randomUUID(), practicalContentHash, null], "42501");
    await deny(
      "insert into public.practical_progress(user_id,attempt_id,result) values($1,$2,'{}')",
      [bob, id],
      "42501",
    );
    await db.query("set local role anon");
    await deny("select * from public.practical_progress", [], "42501");
    await db.query("reset role");
    const foreignDraft = await start();
    await deny(
      "insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome,rubric_version,scope,practical_attempt_id,assessment_method) values($1,'js.promises','practical_task',$2,'meets_criteria','fixture','scope',$3,null)",
      [alice, foreignDraft.attemptId, foreignDraft.attemptId],
      "23514",
    );
    await deny(
      "insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome,rubric_version,scope,practical_attempt_id,assessment_method) values($1,'js.promises','practical_task',$2,'meets_criteria','fixture','scope',$3,'guided_scaffold')",
      [bob, foreignDraft.attemptId, foreignDraft.attemptId],
      "23503",
    );
    await db.query("delete from auth.users where id=$1", [alice]);
    expect(
      (await db.query("select * from public.practical_progress where attempt_id=$1", [id])).rows,
    ).toEqual([]);
    expect(
      (await db.query("select * from public.skill_evidence where practical_attempt_id=$1", [id]))
        .rows,
    ).toEqual([]);
  });
  it("concurrent record requests create one assessment and one set of evidence", async () => {
    const user = crypto.randomUUID();
    const one = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const two = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    await one.connect();
    await two.connect();
    try {
      await one.query("insert into auth.users(id,email) values($1,$2)", [
        user,
        `${user}@example.test`,
      ]);
      await one.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await one.query("select public.save_passport($1::jsonb,$2)", [
        JSON.stringify(passport),
        crypto.randomUUID(),
      ]);
      const id = (await one.query(startSQL, [user, crypto.randomUUID()])).rows[0].result.attemptId;
      await one.query(mutateSQL, [
        user,
        id,
        crypto.randomUUID(),
        1,
        "submit",
        JSON.stringify(correct),
        JSON.stringify(scorePractical(correct)),
      ]);
      const args = [
        user,
        id,
        crypto.randomUUID(),
        practicalContentHash,
        JSON.stringify(scorePractical(correct)),
      ];
      const results = await Promise.all([
        one.query(recordSQL, args),
        two.query(recordSQL, [...args.slice(0, 2), crypto.randomUUID(), ...args.slice(3)]),
      ]);
      expect(results[0].rows[0].result).toEqual(results[1].rows[0].result);
      expect(
        (
          await one.query(
            "select count(*)::int n from public.skill_evidence where practical_attempt_id=$1",
            [id],
          )
        ).rows[0].n,
      ).toBe(3);
    } finally {
      await one.query("delete from auth.users where id=$1", [user]);
      await one.end();
      await two.end();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";
import correct from "../fixtures/javascript-diagnostic-v1.json";
import {
  getDiagnosticDefinition,
  getPublicDiagnostic,
} from "@/features/assessment/diagnostic-content";
import { scoreDiagnostic } from "@/features/assessment/diagnostic-scoring";

let db: Client;
let alice: string;
let bob: string;
type Receipt = { attemptId: string; revision: number; status: string };
const startSql = "select public.start_diagnostic_attempt($1,$2,$3::jsonb,$4,$5) result";
const saveSql = "select public.save_diagnostic_answers($1,$2,$3,$4::jsonb,$5) result";
const evaluateSql =
  "select public.evaluate_diagnostic_attempt($1,$2,$3,$4::jsonb,$5::jsonb,$6) result";
const definition = getDiagnosticDefinition();
function startParams(user = alice, requestId = crypto.randomUUID()) {
  return [
    user,
    requestId,
    JSON.stringify(getPublicDiagnostic()),
    definition.rubricVersion,
    definition.contentHash,
  ];
}
async function start(user = alice, requestId = crypto.randomUUID()): Promise<Receipt> {
  return (await db.query(startSql, startParams(user, requestId))).rows[0].result;
}
async function save(
  attempt: Receipt,
  answers = correct.answers,
  requestId = crypto.randomUUID(),
  user = alice,
): Promise<Receipt> {
  return (
    await db.query(saveSql, [
      user,
      attempt.attemptId,
      attempt.revision,
      JSON.stringify(answers),
      requestId,
    ])
  ).rows[0].result;
}
async function evaluate(
  attempt: Receipt,
  answers = correct.answers,
  requestId = crypto.randomUUID(),
  evaluation = scoreDiagnostic({ version: correct.version, answers }),
): Promise<Receipt> {
  return (
    await db.query(evaluateSql, [
      alice,
      attempt.attemptId,
      attempt.revision,
      JSON.stringify(answers),
      JSON.stringify(evaluation),
      requestId,
    ])
  ).rows[0].result;
}
async function denied(sql: string, params: unknown[] = [], code = "42501") {
  await db.query("savepoint rejected");
  await expect(db.query(sql, params)).rejects.toMatchObject({ code });
  await db.query("rollback to savepoint rejected");
  await db.query("release savepoint rejected");
}
async function role(id: string, name = "authenticated") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.query(name === "anon" ? "set local role anon" : "set local role authenticated");
}
beforeEach(async () => {
  db = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
  await db.connect();
  await db.query("begin");
  alice = crypto.randomUUID();
  bob = crypto.randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2),($3,$4)", [
    alice,
    `${alice}@example.test`,
    bob,
    `${bob}@example.test`,
  ]);
  for (const user of [alice, bob]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await db.query("select public.save_passport($1::jsonb,$2)", [
      JSON.stringify({
        display_name: "Test learner",
        entry_state: "returning",
        locale: "en",
        desired_skill: "JavaScript",
        target_role: null,
        motivation: null,
        study_minutes_per_week: 90,
        device: "phone",
        bandwidth: "limited",
      }),
      crypto.randomUUID(),
    ]);
  }
});
afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("diagnostic persistence and authoritative evidence", () => {
  it("serializes simultaneous starts and duplicate evaluations across independent connections", async () => {
    const creator = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const left = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const right = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const user = crypto.randomUUID();
    await Promise.all([creator.connect(), left.connect(), right.connect()]);
    try {
      await creator.query("insert into auth.users(id,email) values($1,$2)", [
        user,
        `${user}@example.test`,
      ]);
      await creator.query("insert into public.profiles(id,entry_state) values($1,'returning')", [
        user,
      ]);
      await Promise.all([
        left.query("set role service_role"),
        right.query("set role service_role"),
      ]);
      const started = await Promise.all([
        left.query(startSql, startParams(user)),
        right.query(startSql, startParams(user)),
      ]);
      const first = started[0].rows[0].result;
      expect(started[1].rows[0].result).toEqual(first);
      const saved = (
        await left.query(saveSql, [
          user,
          first.attemptId,
          1,
          JSON.stringify(correct.answers),
          crypto.randomUUID(),
        ])
      ).rows[0].result;
      const requestId = crypto.randomUUID();
      const params = [
        user,
        first.attemptId,
        saved.revision,
        JSON.stringify(correct.answers),
        JSON.stringify(scoreDiagnostic(correct)),
        requestId,
      ];
      const completed = await Promise.all([
        left.query(evaluateSql, params),
        right.query(evaluateSql, params),
      ]);
      expect(completed[0].rows[0].result).toEqual(completed[1].rows[0].result);
      expect(
        (
          await creator.query(
            "select count(*)::int n from public.skill_evidence where user_id=$1",
            [user],
          )
        ).rows[0].n,
      ).toBe(4);
      expect(
        (
          await creator.query(
            "select count(*)::int n from public.learning_events where user_id=$1 and type='diagnostic_evaluated'",
            [user],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await creator.query("delete from auth.users where id=$1", [user]);
      await Promise.all([creator.end(), left.end(), right.end()]);
    }
  });
  it("starts one resumable attempt, retains content provenance and returns stable retries", async () => {
    const requestId = crypto.randomUUID();
    const first = await start(alice, requestId);
    expect(await start(alice, requestId)).toEqual(first);
    expect(await start()).toEqual(first);
    const row = (
      await db.query("select * from public.diagnostic_attempts where id=$1", [first.attemptId])
    ).rows[0];
    expect(row).toMatchObject({
      content_version: correct.version,
      content_hash: definition.contentHash,
      revision: 1,
      answers: [],
      evaluation: null,
    });
    expect(JSON.stringify(row.public_content)).not.toContain("correctChoiceIds");
    expect(
      (
        await db.query(
          "select count(*)::int n from public.learning_events where user_id=$1 and type='diagnostic_started'",
          [alice],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("saves partial answers without grading and protects newer saves from old receipt replay", async () => {
    const first = await start();
    const id = crypto.randomUUID();
    const second = await save(first, correct.answers.slice(0, 2), id);
    const third = await save(second, correct.answers.slice(0, 4));
    expect(await save(first, correct.answers.slice(0, 2), id)).toEqual(second);
    expect(
      (
        await db.query("select revision,answers from public.diagnostic_attempts where id=$1", [
          first.attemptId,
        ])
      ).rows[0],
    ).toEqual({ revision: third.revision, answers: correct.answers.slice(0, 4) });
    expect(
      (await db.query("select * from public.skill_evidence where user_id=$1", [alice])).rows,
    ).toEqual([]);
    await denied(
      saveSql,
      [alice, first.attemptId, 1, JSON.stringify(correct.answers), crypto.randomUUID()],
      "PT409",
    );
    await denied(
      saveSql,
      [alice, first.attemptId, 1, JSON.stringify(correct.answers), id],
      "PT409",
    );
  });
  it("persists evaluation, four scoped evidence references and skill summaries atomically, with duplicate submit receipts", async () => {
    const saved = await save(await start());
    const id = crypto.randomUUID();
    const done = await evaluate(saved, correct.answers, id);
    expect(await evaluate(saved, correct.answers, id)).toEqual(done);
    const row = (
      await db.query("select status,evaluation from public.diagnostic_attempts where id=$1", [
        saved.attemptId,
      ])
    ).rows[0];
    expect(row.status).toBe("evaluated");
    expect(
      row.evaluation.findings.every(
        (finding: { evidenceId: string; summaryUpdated: boolean }) =>
          finding.evidenceId && finding.summaryUpdated,
      ),
    ).toBe(true);
    const evidence = (
      await db.query(
        "select kind,outcome,scope,source_id,rubric_version from public.skill_evidence where user_id=$1",
        [alice],
      )
    ).rows;
    expect(evidence).toHaveLength(4);
    expect(
      evidence.every(
        (item) =>
          item.kind === "quiz" &&
          item.outcome === "meets_criteria" &&
          item.source_id === saved.attemptId &&
          item.rubric_version === definition.rubricVersion &&
          item.scope,
      ),
    ).toBe(true);
    const skills = (
      await db.query("select skill_id,status from public.learner_skills where user_id=$1", [alice])
    ).rows;
    expect(skills.filter((item) => item.status === "demonstrated")).toHaveLength(4);
    expect(skills.find((item) => item.skill_id === "web.fetch-api").status).toBe("not_assessed");
    expect(
      (
        await db.query(
          "select count(*)::int n from public.learning_events where user_id=$1 and type='diagnostic_evaluated'",
          [alice],
        )
      ).rows[0].n,
    ).toBe(1);
    await denied(
      evaluateSql,
      [
        alice,
        saved.attemptId,
        saved.revision,
        JSON.stringify(correct.answers),
        JSON.stringify(scoreDiagnostic(correct)),
        crypto.randomUUID(),
      ],
      "PT409",
    );
  });
  it("keeps skipped and incomplete retakes from erasing completed evidence", async () => {
    await evaluate(await save(await start()));
    const prior = (
      await db.query(
        "select skill_id,status,last_evidence_id from public.learner_skills where user_id=$1 order by skill_id",
        [alice],
      )
    ).rows;
    const skipped = correct.answers.map((answer) => ({ ...answer, choiceIds: null }));
    const allSkip = await save(await start(), skipped as unknown as typeof correct.answers);
    await evaluate(allSkip, skipped as unknown as typeof correct.answers);
    expect(
      (
        await db.query(
          "select skill_id,status,last_evidence_id from public.learner_skills where user_id=$1 order by skill_id",
          [alice],
        )
      ).rows,
    ).toEqual(prior);
    const partial = skipped.map((answer) => ({
      ...answer,
      choiceIds: answer.questionId === "functions-return" ? ["five"] : null,
    }));
    const saved = await save(await start(), partial as unknown as typeof correct.answers);
    await evaluate(saved, partial as unknown as typeof correct.answers);
    const result = (
      await db.query("select evaluation from public.diagnostic_attempts where id=$1", [
        saved.attemptId,
      ])
    ).rows[0].evaluation;
    expect(
      result.findings.find((finding: { skillId: string }) => finding.skillId === "js.functions"),
    ).toMatchObject({ status: "learning", summaryUpdated: false });
    expect(
      (
        await db.query(
          "select skill_id,status,last_evidence_id from public.learner_skills where user_id=$1 order by skill_id",
          [alice],
        )
      ).rows,
    ).toEqual(prior);
    expect(
      (
        await db.query("select count(*)::int n from public.skill_evidence where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(5);
  });
  it("retains history while a new complete same-scope quiz records an observed gap", async () => {
    await evaluate(await save(await start()));
    const answers = correct.answers.map((answer) =>
      answer.questionId === "promises-order" ? { ...answer, choiceIds: ["done-now"] } : answer,
    );
    const saved = await save(await start(), answers);
    await evaluate(saved, answers);
    expect(
      (
        await db.query(
          "select status from public.learner_skills where user_id=$1 and skill_id='js.promises'",
          [alice],
        )
      ).rows[0].status,
    ).toBe("needs_review");
    expect(
      (
        await db.query(
          "select outcome from public.skill_evidence where user_id=$1 and skill_id='js.promises' order by evaluated_at",
          [alice],
        )
      ).rows.map((row) => row.outcome),
    ).toEqual(["meets_criteria", "needs_practice"]);
  });
  it("records quiz observations without downgrading stronger practical evidence", async () => {
    const evidence = (
      await db.query(
        "insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome,rubric_version,scope) values($1,'js.functions','practical_task','fixture-project','meets_criteria','project-fixture-v1','Apply functions in a fixed project') returning id",
        [alice],
      )
    ).rows[0].id;
    await db.query(
      "update public.learner_skills set status='demonstrated',last_evidence_id=$2 where user_id=$1 and skill_id='js.functions'",
      [alice, evidence],
    );
    const answers = correct.answers.map((answer) =>
      answer.questionId === "functions-return" ? { ...answer, choiceIds: ["four"] } : answer,
    );
    const saved = await save(await start(), answers);
    await evaluate(saved, answers);
    expect(
      (
        await db.query(
          "select status,last_evidence_id from public.learner_skills where user_id=$1 and skill_id='js.functions'",
          [alice],
        )
      ).rows[0],
    ).toEqual({ status: "demonstrated", last_evidence_id: evidence });
    expect(
      (
        await db.query(
          "select count(*)::int n from public.skill_evidence where user_id=$1 and skill_id='js.functions'",
          [alice],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("rejects malformed answers, incomplete grading, stale response snapshots and forged findings without partial awards", async () => {
    const first = await start();
    for (const answers of [
      [correct.answers[0], correct.answers[0]],
      [{ questionId: "unknown", choiceIds: ["five"] }],
      [{ questionId: "functions-return", choiceIds: ["invented"] }],
      [{ ...correct.answers[0], status: "demonstrated" }],
    ])
      await denied(
        saveSql,
        [alice, first.attemptId, 1, JSON.stringify(answers), crypto.randomUUID()],
        "22023",
      );
    const saved = await save(first);
    const malformed = scoreDiagnostic(correct);
    malformed.findings[2].status = "needs_review";
    await denied(
      evaluateSql,
      [
        alice,
        saved.attemptId,
        saved.revision,
        JSON.stringify(correct.answers),
        JSON.stringify(malformed),
        crypto.randomUUID(),
      ],
      "22023",
    );
    expect(
      (await db.query("select * from public.skill_evidence where user_id=$1", [alice])).rows,
    ).toEqual([]);
    expect(
      (
        await db.query("select status from public.diagnostic_attempts where id=$1", [
          first.attemptId,
        ])
      ).rows[0].status,
    ).toBe("in_progress");
    await denied(
      evaluateSql,
      [
        alice,
        saved.attemptId,
        saved.revision,
        JSON.stringify(correct.answers.slice(1)),
        JSON.stringify(scoreDiagnostic(correct)),
        crypto.randomUUID(),
      ],
      "22023",
    );
    await save(saved, correct.answers.slice(0, 2));
    await denied(
      evaluateSql,
      [
        alice,
        saved.attemptId,
        saved.revision,
        JSON.stringify(correct.answers),
        JSON.stringify(scoreDiagnostic(correct)),
        crypto.randomUUID(),
      ],
      "PT409",
    );
  });
  it("denies anonymous/browser RPC writes and cross-user reads, including foreign IDs passed by a trusted call", async () => {
    const first = await start();
    await denied(
      saveSql,
      [bob, first.attemptId, 1, JSON.stringify(correct.answers), crypto.randomUUID()],
      "PT404",
    );
    await role(bob);
    expect((await db.query("select * from public.diagnostic_attempts")).rows).toEqual([]);
    expect((await db.query("select * from public.diagnostic_mutations")).rows).toEqual([]);
    await denied(startSql, startParams(bob));
    await denied(saveSql, [
      alice,
      first.attemptId,
      1,
      JSON.stringify(correct.answers),
      crypto.randomUUID(),
    ]);
    await denied(evaluateSql, [
      alice,
      first.attemptId,
      1,
      JSON.stringify(correct.answers),
      JSON.stringify(scoreDiagnostic(correct)),
      crypto.randomUUID(),
    ]);
    await denied("update public.diagnostic_attempts set status='evaluated'");
    await role(alice);
    expect((await db.query("select id from public.diagnostic_attempts")).rows).toEqual([
      { id: first.attemptId },
    ]);
    await role("", "anon");
    await denied("select * from public.diagnostic_attempts");
  });
  it("cascades account deletion through evaluated attempts, receipts and evidence", async () => {
    await evaluate(await save(await start()));
    await db.query("delete from auth.users where id=$1", [alice]);
    for (const table of [
      "diagnostic_attempts",
      "diagnostic_mutations",
      "skill_evidence",
      "learner_skills",
    ])
      expect(
        (await db.query(`select * from public.${table} where user_id=$1`, [alice])).rows,
      ).toEqual([]);
  });
});

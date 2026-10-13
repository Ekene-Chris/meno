import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";

let db: Client;
let alice: string;
let bob: string;
const input = {
  display_name: "Test learner",
  entry_state: "returning",
  locale: "en",
  desired_skill: "JavaScript",
  study_minutes_per_week: 90,
  device: "phone",
  bandwidth: "limited",
  target_role: null,
  motivation: null,
};

async function asUser(id: string, role = "authenticated") {
  await db.query("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
    [id, JSON.stringify({ sub: id, role })],
  );
  await db.query(role === "anon" ? "set local role anon" : "set local role authenticated");
}
async function save(data = input, requestId = crypto.randomUUID()) {
  await db.query("select public.save_passport($1::jsonb, $2::uuid)", [
    JSON.stringify(data),
    requestId,
  ]);
  return requestId;
}
async function denied(sql: string, params: unknown[] = [], code = "42501") {
  await db.query("savepoint denied_operation");
  try {
    await expect(db.query(sql, params)).rejects.toMatchObject({ code });
  } finally {
    await db.query("rollback to savepoint denied_operation");
    await db.query("release savepoint denied_operation");
  }
}

beforeEach(async () => {
  db = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
  await db.connect();
  await db.query("begin");
  alice = crypto.randomUUID();
  bob = crypto.randomUUID();
  await db.query("insert into auth.users(id, email) values ($1, $2), ($3, $4)", [
    alice,
    `${alice}@example.test`,
    bob,
    `${bob}@example.test`,
  ]);
  await asUser(alice);
  await save();
  await asUser(bob);
  await save({ ...input, display_name: "Second test learner" });
  await asUser(alice);
});
afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});

describe("real Postgres authorization and Passport state", () => {
  it("serializes concurrent first saves and deduplicates a retried request", async () => {
    const owner = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const callers = [
      new Client({ connectionString: localUrl("TEST_DATABASE_URL") }),
      new Client({ connectionString: localUrl("TEST_DATABASE_URL") }),
    ];
    const id = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    await owner.connect();
    try {
      await owner.query("insert into auth.users(id, email) values ($1,$2)", [
        id,
        `${id}@example.test`,
      ]);
      await Promise.all(
        callers.map(async (caller) => {
          await caller.connect();
          await caller.query("begin");
          await caller.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
          await caller.query("set local role authenticated");
          await caller.query("select public.save_passport($1::jsonb,$2)", [
            JSON.stringify(input),
            requestId,
          ]);
          await caller.query("commit");
        }),
      );
      expect(
        (
          await owner.query(
            "select count(*)::int as n from public.learning_goals where user_id=$1 and status='active'",
            [id],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await owner.query(
            "select count(*)::int as n from public.learning_events where user_id=$1",
            [id],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      for (const caller of callers) await caller.end();
      await owner.query("delete from auth.users where id=$1", [id]);
      await owner.end();
    }
  });
  it("enables RLS on every exposed table", async () => {
    const { rows } = await db.query(
      "select tablename from pg_tables where schemaname='public' and not rowsecurity",
    );
    expect(rows).toEqual([]);
  });
  it("scopes profile, goal, skills, evidence, and history reads to the authenticated learner", async () => {
    const profile = await db.query("select id from public.profiles");
    expect(profile.rows).toEqual([{ id: alice }]);
    for (const table of ["learning_goals", "learner_skills", "learning_events"]) {
      const { rows } = await db.query(`select distinct user_id from public.${table}`);
      expect(rows).toEqual([{ user_id: alice }]);
    }
    await db.query("reset role");
    await db.query(
      "insert into public.skill_evidence(user_id, skill_id, kind, source_id, outcome) values ($1, 'js.promises', 'self_report', 'test-fixture', 'observed')",
      [bob],
    );
    await asUser(alice);
    expect((await db.query("select * from public.skill_evidence")).rows).toEqual([]);
    expect((await db.query("select * from public.profiles where id=$1", [bob])).rows).toEqual([]);
  });
  it("rejects direct inserts, updates, and deletes of private records and the shared catalog", async () => {
    await denied("update public.profiles set display_name='intruder' where id=$1", [bob]);
    await denied("insert into public.profiles(id, entry_state) values ($1, 'starting')", [
      crypto.randomUUID(),
    ]);
    await denied("delete from public.learning_goals where user_id=$1", [bob]);
    await denied("update public.learner_skills set status='demonstrated' where user_id=$1", [
      alice,
    ]);
    await denied(
      "insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome) values ($1,'js.promises','self_report','forged','meets_criteria')",
      [alice],
    );
    await denied("delete from public.learning_events where user_id=$1", [alice]);
    await denied("delete from public.skills");
  });
  it("denies anonymous reads and Passport writes", async () => {
    await asUser("", "anon");
    await denied("select * from public.profiles");
    await denied("select public.save_passport($1::jsonb, $2)", [
      JSON.stringify(input),
      crypto.randomUUID(),
    ]);
  });
  it("rejects identity and evidence fields even when calling the RPC directly", async () => {
    await denied(
      "select public.save_passport($1::jsonb, $2)",
      [JSON.stringify({ ...input, user_id: bob }), crypto.randomUUID()],
      "22023",
    );
    await denied(
      "select public.save_passport($1::jsonb, $2)",
      [JSON.stringify({ ...input, status: "demonstrated" }), crypto.randomUUID()],
      "22023",
    );
  });
  it("saves preferences and one active goal without awarding skills", async () => {
    await save({ ...input, desired_skill: "Accessible JavaScript", study_minutes_per_week: 45 });
    expect(
      (await db.query("select study_minutes_per_week from public.profiles")).rows[0]
        .study_minutes_per_week,
    ).toBe(45);
    expect(
      (await db.query("select desired_skill from public.learning_goals where status='active'"))
        .rows,
    ).toEqual([{ desired_skill: "Accessible JavaScript" }]);
    const { rows } = await db.query("select status, last_evidence_id from public.learner_skills");
    expect(rows).toHaveLength(14);
    expect(
      rows.every((row) => row.status === "not_assessed" && row.last_evidence_id === null),
    ).toBe(true);
    expect((await db.query("select * from public.skill_evidence")).rows).toEqual([]);
  });
  it("makes repeated requests idempotent", async () => {
    const requestId = await save({ ...input, desired_skill: "TypeScript" });
    await save({ ...input, desired_skill: "TypeScript" }, requestId);
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.learning_events where request_id=$1",
          [requestId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await db.query("select count(*)::int as n from public.learning_goals where status='active'"))
        .rows[0].n,
    ).toBe(1);
  });
  it("rolls back the entire operation if the goal fails validation", async () => {
    await denied(
      "select public.save_passport($1::jsonb, $2)",
      [
        JSON.stringify({ ...input, display_name: "Should not persist", desired_skill: " " }),
        crypto.randomUUID(),
      ],
      "23514",
    );
    expect((await db.query("select display_name from public.profiles")).rows[0].display_name).toBe(
      "Test learner",
    );
    expect(
      (await db.query("select count(*)::int as n from public.learning_events")).rows[0].n,
    ).toBe(1);
  });
  it("prevents self-report from becoming demonstrated evidence, even through a trusted writer", async () => {
    await db.query("reset role");
    const { rows } = await db.query(
      "insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome) values ($1,'js.promises','self_report','test-fixture','meets_criteria') returning id",
      [alice],
    );
    await denied(
      "update public.learner_skills set status='demonstrated', last_evidence_id=$1 where user_id=$2 and skill_id='js.promises'",
      [rows[0].id, alice],
      "23514",
    );
  });
  it("requires evidence to belong to the same learner and skill", async () => {
    await db.query("reset role");
    const { rows } = await db.query(
      "insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome,rubric_version) values ($1,'js.promises','quiz','test-fixture','meets_criteria','test-v1') returning id",
      [bob],
    );
    await denied(
      "update public.learner_skills set status='demonstrated', last_evidence_id=$1 where user_id=$2 and skill_id='js.promises'",
      [rows[0].id, alice],
      "23514",
    );
    await denied(
      "update public.learner_skills set status='demonstrated', last_evidence_id=$1 where user_id=$2 and skill_id='js.arrays'",
      [rows[0].id, bob],
      "23514",
    );
  });
  it("accepts a scoped assessed finding without changing unrelated skills", async () => {
    await db.query("reset role");
    const { rows } = await db.query(
      "insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome,rubric_version) values ($1,'js.promises','quiz','test-fixture','meets_criteria','test-v1') returning id",
      [alice],
    );
    await db.query(
      "update public.learner_skills set status='demonstrated', last_evidence_id=$1 where user_id=$2 and skill_id='js.promises'",
      [rows[0].id, alice],
    );
    await asUser(alice);
    expect(
      (await db.query("select skill_id from public.learner_skills where status='demonstrated'"))
        .rows,
    ).toEqual([{ skill_id: "js.promises" }]);
    expect(
      (
        await db.query(
          "select count(*)::int as n from public.learner_skills where status='not_assessed'",
        )
      ).rows[0].n,
    ).toBe(13);
  });
  it("seeds a skill graph without cycles", async () => {
    const { rows } = await db.query(`with recursive paths as (
      select skill_id as start, prerequisite_skill_id as next, array[skill_id] as visited from public.skill_prerequisites
      union all select p.start, s.prerequisite_skill_id, p.visited || p.next
      from paths p join public.skill_prerequisites s on s.skill_id=p.next where not p.next=any(p.visited)
    ) select * from paths where next=any(visited)`);
    expect(rows).toEqual([]);
  });
});

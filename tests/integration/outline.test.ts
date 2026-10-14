import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";

let db: Client;
let alice: string;
let bob: string;
const reserveSql = "select public.reserve_outline_extraction($1,$2,$3,$4,$5,$6,$7,$8) as result";
const finishSql = "select public.finish_outline_extraction($1,$2,$3::jsonb,$4) as result";
const result = {
  modules: [
    {
      title: "Functions",
      topics: [
        { label: "Parameters", skill_id: "js.functions", mapping: "suggested" },
        { label: "Unclear topic", skill_id: "js.functions", mapping: "uncertain" },
        { label: "Project planning", skill_id: null, mapping: "unmapped" },
      ],
    },
  ],
};
async function reserve(
  requestId = crypto.randomUUID(),
  options: {
    user?: string;
    hash?: string;
    course?: string;
    revision?: number;
    confirmed?: number;
    limit?: number;
  } = {},
) {
  return (
    await db.query(reserveSql, [
      options.user ?? alice,
      requestId,
      options.hash ?? "a".repeat(64),
      options.course ?? null,
      options.revision ?? 0,
      options.confirmed ?? null,
      "fixture-model",
      options.limit ?? 100,
    ])
  ).rows[0].result;
}
async function finish(requestId: string, value: unknown = result, error: string | null = null) {
  return (await db.query(finishSql, [alice, requestId, JSON.stringify(value), error])).rows[0]
    .result;
}
async function denied(sql: string, params: unknown[] = [], code = "42501") {
  await db.query("savepoint rejected");
  await expect(db.query(sql, params)).rejects.toMatchObject({ code });
  await db.query("rollback to savepoint rejected");
  await db.query("release savepoint rejected");
}
beforeEach(async () => {
  db = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
  await db.connect();
  await db.query("begin");
  // Each case runs in a rolled-back isolated quota window.
  await db.query("delete from public.outline_extractions");
  alice = crypto.randomUUID();
  bob = crypto.randomUUID();
  await db.query("insert into auth.users(id,email) values ($1,$2),($3,$4)", [
    alice,
    `${alice}@example.test`,
    bob,
    `${bob}@example.test`,
  ]);
  await db.query(
    "insert into public.profiles(id,entry_state) values ($1,'returning'),($2,'active')",
    [alice, bob],
  );
});
afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});
describe("private extraction proposals and durable quotas", () => {
  it("serializes simultaneous reservations across database connections", async () => {
    const left = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const right = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    const user = crypto.randomUUID();
    await Promise.all([left.connect(), right.connect()]);
    try {
      await left.query("insert into auth.users(id,email) values ($1,$2)", [
        user,
        `${user}@example.test`,
      ]);
      await left.query("insert into public.profiles(id,entry_state) values ($1,'returning')", [
        user,
      ]);
      const id = crypto.randomUUID();
      const params = [user, id, "a".repeat(64), null, 0, null, "fixture-model", 100];
      await Promise.all([
        left.query("set role service_role"),
        right.query("set role service_role"),
      ]);
      const receipts = await Promise.all([
        left.query(reserveSql, params),
        right.query(reserveSql, params),
      ]);
      expect(receipts.map((receipt) => receipt.rows[0].result.fresh).sort()).toEqual([false, true]);
      expect(
        (
          await left.query(
            "select count(*)::int n from public.outline_extractions where user_id=$1",
            [user],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await left.query("reset role");
      await left.query("delete from auth.users where id=$1", [user]);
      await Promise.all([left.end(), right.end()]);
    }
  });
  it("stores a validated proposal without creating course context, learning events, or evidence", async () => {
    const id = crypto.randomUUID();
    expect(await reserve(id)).toMatchObject({ fresh: true, status: "pending" });
    expect(await finish(id)).toEqual({ status: "ready", result, errorCode: null });
    const stored = (
      await db.query("select * from public.outline_extractions where user_id=$1", [alice])
    ).rows[0];
    expect(stored.result).toEqual(result);
    for (const table of ["courses", "skill_evidence", "learning_events"])
      expect(
        (await db.query(`select * from public.${table} where user_id=$1`, [alice])).rows,
      ).toEqual([]);
  });
  it("returns pending/ready receipts without consuming a second reservation and rejects changed retry payloads", async () => {
    const id = crypto.randomUUID();
    await reserve(id);
    expect(await reserve(id)).toMatchObject({ fresh: false, status: "pending" });
    await finish(id);
    expect(await reserve(id)).toMatchObject({ fresh: false, status: "ready", result });
    expect(
      (await db.query("select count(*)::int n from public.outline_extractions")).rows[0].n,
    ).toBe(1);
    await denied(
      reserveSql,
      [alice, id, "b".repeat(64), null, 0, null, "fixture-model", 100],
      "PT409",
    );
  });
  it("counts failures toward minute/user/day quotas and keeps duplicate failures free", async () => {
    const first = crypto.randomUUID();
    await reserve(first);
    await finish(first, null, "AI_TIMEOUT");
    expect(await reserve(first)).toMatchObject({
      fresh: false,
      status: "failed",
      errorCode: "AI_TIMEOUT",
    });
    await reserve();
    await reserve();
    await denied(
      reserveSql,
      [alice, crypto.randomUUID(), "a".repeat(64), null, 0, null, "fixture-model", 100],
      "PT429",
    );
    await db.query("update public.outline_extractions set created_at = now() - interval '2 hours'");
    for (let i = 0; i < 7; i++) {
      await reserve();
      await db.query(
        "update public.outline_extractions set created_at = now() - interval '2 hours'",
      );
    }
    await denied(
      reserveSql,
      [alice, crypto.randomUUID(), "a".repeat(64), null, 0, null, "fixture-model", 100],
      "PT429",
    );
  });
  it("enforces the shared quota across accounts before requesting another provider call", async () => {
    await reserve(crypto.randomUUID(), { limit: 1 });
    await denied(
      reserveSql,
      [bob, crypto.randomUUID(), "a".repeat(64), null, 0, null, "fixture-model", 1],
      "PT429",
    );
  });
  it("denies browser writes and privileged RPCs, and scopes proposal reads to their owner", async () => {
    const id = crypto.randomUUID();
    await reserve(id);
    await finish(id);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    await db.query("set local role authenticated");
    expect((await db.query("select * from public.outline_extractions")).rows).toEqual([]);
    await denied(reserveSql, [
      bob,
      crypto.randomUUID(),
      "a".repeat(64),
      null,
      0,
      null,
      "fixture-model",
      100,
    ]);
    await denied(finishSql, [alice, id, JSON.stringify(result), null]);
    await denied("update public.outline_extractions set status='failed'");
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
    await db.query("set local role authenticated");
    expect((await db.query("select request_id from public.outline_extractions")).rows).toEqual([
      { request_id: id },
    ]);
    await db.query("reset role");
    await db.query("set local role anon");
    await denied("select * from public.outline_extractions", []);
  });
  it("rejects unknown skills and injected assessment fields atomically", async () => {
    const id = crypto.randomUUID();
    await reserve(id);
    for (const topic of [
      { label: "Unknown", skill_id: "unknown", mapping: "suggested" },
      {
        label: "Parameters",
        skill_id: "js.functions",
        mapping: "suggested",
        status: "demonstrated",
      },
    ]) {
      await denied(
        finishSql,
        [alice, id, JSON.stringify({ modules: [{ title: "Functions", topics: [topic] }] }), null],
        "22023",
      );
    }
    expect((await db.query("select status from public.outline_extractions")).rows[0].status).toBe(
      "pending",
    );
  });
  it("rejects a foreign or stale course, including confirmation during a provider call", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
    const moduleId = crypto.randomUUID();
    const course = {
      title: "Existing course",
      source_type: "class",
      source_url: null,
      outline: "Functions and arrays",
      checkpoint_module_id: moduleId,
      checkpoint_note: "Keep this place",
      modules: [
        {
          id: moduleId,
          title: "Functions",
          topics: [{ label: "Parameters", skill_id: "js.functions" }],
        },
      ],
    };
    const saved = (
      await db.query("select public.save_course_draft(0,$1::jsonb,$2) as result", [
        JSON.stringify(course),
        crypto.randomUUID(),
      ])
    ).rows[0].result;
    await denied(
      reserveSql,
      [bob, crypto.randomUUID(), "a".repeat(64), saved.courseId, 1, null, "fixture-model", 100],
      "PT404",
    );
    await denied(
      reserveSql,
      [alice, crypto.randomUUID(), "a".repeat(64), saved.courseId, 2, null, "fixture-model", 100],
      "PT409",
    );
    const id = crypto.randomUUID();
    await reserve(id, { course: saved.courseId, revision: 1 });
    await db.query("select public.confirm_course($1,1,$2)", [saved.courseId, crypto.randomUUID()]);
    expect(await finish(id)).toEqual({
      status: "failed",
      result: null,
      errorCode: "COURSE_CONFLICT",
    });
    expect(
      (
        await db.query("select revision,confirmed_revision from public.courses where id=$1", [
          saved.courseId,
        ])
      ).rows[0],
    ).toEqual({ revision: 1, confirmed_revision: 1 });
    expect(
      (
        await db.query(
          "select checkpoint_module_id from public.course_revisions where course_id=$1",
          [saved.courseId],
        )
      ).rows[0].checkpoint_module_id,
    ).toBe(moduleId);
  });
  it("expires interrupted calls without issuing a fresh reservation and cascades account deletion", async () => {
    const id = crypto.randomUUID();
    await reserve(id);
    await db.query("update public.outline_extractions set created_at=now()-interval '3 minutes'");
    expect(await reserve(id)).toMatchObject({
      fresh: false,
      status: "failed",
      errorCode: "AI_TIMEOUT",
    });
    await db.query("delete from auth.users where id=$1", [alice]);
    expect(
      (await db.query("select * from public.outline_extractions where user_id=$1", [alice])).rows,
    ).toEqual([]);
  });
});

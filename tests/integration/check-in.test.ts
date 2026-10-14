import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";
import { pathContextEnvelopeSchema } from "@/features/learning-paths/schema";
import { selectRecoveryProposal } from "@/features/learning-paths/selector";
import { smallerActivity } from "@/features/momentum/check-in-schema";
let db: Client;
let alice: string;
let bob: string;
let courseId: string;
let accepted: { proposalId: string; revision: number };
const sql =
  "select public.propose_checkin_recovery($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) result";
async function context() {
  return pathContextEnvelopeSchema.parse(
    (await db.query("select public.get_learning_path_context($1) result", [courseId])).rows[0]
      .result,
  );
}
async function input(source = "user_report", obstacle = "time", request = crypto.randomUUID()) {
  const envelope = await context();
  const proposal = selectRecoveryProposal(envelope.context);
  return [
    alice,
    request,
    envelope.revision,
    accepted.proposalId,
    source,
    obstacle,
    envelope.contextHash,
    JSON.stringify(proposal),
    JSON.stringify(smallerActivity(proposal, "time")),
  ];
}
async function denied(query: string, values: unknown[], code: string) {
  await db.query("savepoint denied");
  await expect(db.query(query, values)).rejects.toMatchObject({ code });
  await db.query("rollback to savepoint denied");
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
      JSON.stringify({
        display_name: "Check-in fixture",
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
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [alice]);
  const moduleId = crypto.randomUUID();
  courseId = (
    await db.query("select public.save_course_draft(0,$1::jsonb,$2) result", [
      JSON.stringify({
        title: "Existing JavaScript class",
        source_type: "class",
        source_url: null,
        outline: "Promises topic",
        modules: [
          {
            id: moduleId,
            title: "Promises",
            topics: [{ label: "Promises", skill_id: "js.promises" }],
          },
        ],
        checkpoint_module_id: moduleId,
        checkpoint_note: "My self-reported place",
      }),
      crypto.randomUUID(),
    ])
  ).rows[0].result.courseId;
  await db.query("select public.confirm_course($1,1,$2)", [courseId, crypto.randomUUID()]);
  const c = await context();
  accepted = (
    await db.query(
      "select public.propose_learning_path($1,0,$2,'recovery-v1',$3::jsonb,$4,$5) result",
      [
        alice,
        c.contextHash,
        JSON.stringify(selectRecoveryProposal(c.context)),
        crypto.randomUUID(),
        courseId,
      ],
    )
  ).rows[0].result;
  await db.query("select public.review_learning_path($1,$2,1,'accept',null,$3)", [
    alice,
    accepted.proposalId,
    crypto.randomUUID(),
  ]);
});
afterEach(async () => {
  if (db) {
    await db.query("rollback");
    await db.end();
  }
});
describe("atomic obstacle recovery", () => {
  it("keeps the accepted step and all context while the five-minute proposal is pending or declined", async () => {
    const before = (await context()).context;
    const result = (await db.query(sql, await input())).rows[0].result;
    expect(result.revision).toBe(3);
    const state = (await db.query("select public.get_learning_path_review() result")).rows[0]
      .result;
    expect(state.active.id).toBe(accepted.proposalId);
    expect(state.latest.proposal.estimatedMinutes).toBe(5);
    expect((await context()).context).toEqual(before);
    await db.query("select public.review_learning_path($1,$2,3,'decline',null,$3)", [
      alice,
      result.proposalId,
      crypto.randomUUID(),
    ]);
    expect((await context()).activeRevision).toBe(1);
    expect((await context()).context).toEqual(before);
  });
  it("replays after a decision/context change and rejects request reuse", async () => {
    const args = await input();
    const result = (await db.query(sql, args)).rows[0].result;
    await db.query("select public.review_learning_path($1,$2,3,'accept',null,$3)", [
      alice,
      result.proposalId,
      crypto.randomUUID(),
    ]);
    await db.query("update public.profiles set study_minutes_per_week=15 where id=$1", [alice]);
    expect((await db.query(sql, args)).rows[0].result).toEqual(result);
    await denied(
      sql,
      args.map((v, i) => (i === 5 ? "confused" : v)),
      "PT409",
    );
    expect(
      (
        await db.query("select count(*)::int n from public.recovery_checkins where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(1);
  });
  it("retains simulated provenance through later edits and explicit acceptance", async () => {
    const result = (await db.query(sql, await input("demo_pause", "returning"))).rows[0].result;
    const edit = (
      await db.query("select public.review_learning_path($1,$2,3,'edit',$3::jsonb,$4) result", [
        alice,
        result.proposalId,
        JSON.stringify({
          title: "My return",
          estimatedMinutes: 5,
          steps: ["Read notes", "Write one question"],
        }),
        crypto.randomUUID(),
      ])
    ).rows[0].result;
    const provenance = (
      await db.query("select public.get_checkin_provenance($1::uuid[]) result", [
        [result.proposalId, edit.proposalId],
      ])
    ).rows[0].result;
    expect(provenance[edit.proposalId]).toMatchObject({
      source: "demo_pause",
      obstacle: "returning",
    });
    expect(provenance[edit.proposalId]).toEqual(provenance[result.proposalId]);
    await db.query("select public.review_learning_path($1,$2,4,'accept',null,$3)", [
      alice,
      edit.proposalId,
      crypto.randomUUID(),
    ]);
    expect((await context()).activeRevision).toBe(4);
    expect(
      (
        await db.query("select count(*)::int n from public.skill_evidence where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
  it("rejects stale context, a changed active step and a second pending check-in without partial writes", async () => {
    const args = await input();
    await denied(
      sql,
      args.map((v, i) => (i === 6 ? "a".repeat(64) : v)),
      "PT409",
    );
    await denied(
      sql,
      args.map((v, i) => (i === 3 ? crypto.randomUUID() : v)),
      "PT404",
    );
    await denied(
      sql,
      args.map((v, i) => (i === 0 ? bob : v)),
      "PT404",
    );
    expect((await context()).revision).toBe(1);
    await db.query(sql, args);
    const another = await input();
    await denied(sql, another, "PT409");
    expect((await context()).revision).toBe(3);
  });
  it("denies direct writes, privileged calls, anonymous reads and cross-user provenance", async () => {
    const result = (await db.query(sql, await input())).rows[0].result;
    await db.query("set local role authenticated");
    await denied(sql, await input(), "42501");
    await denied("delete from public.recovery_checkins", [], "42501");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    expect((await db.query("select * from public.recovery_checkins")).rows).toHaveLength(0);
    expect(
      (
        await db.query("select public.get_checkin_provenance($1::uuid[]) result", [
          [result.proposalId],
        ])
      ).rows[0].result,
    ).toEqual({});
    await db.query("set local role anon");
    await denied("select * from public.recovery_checkins", [], "42501");
    await denied(
      "select public.get_checkin_provenance($1::uuid[])",
      [[result.proposalId]],
      "42501",
    );
  });
  it("rejects unlabeled simulations and invalid duration atomically", async () => {
    await denied(sql, await input("demo_pause", "time"), "22023");
    const args = await input();
    args[8] = JSON.stringify({
      title: "Too long",
      estimatedMinutes: 25,
      steps: ["Read notes", "Write question"],
    });
    await denied(sql, args, "22023");
    expect((await context()).revision).toBe(1);
    args[8] = JSON.stringify({
      title: "Invalid after proposal insert",
      estimatedMinutes: 5,
      steps: ["Only one step"],
    });
    await denied(sql, args, "22023");
    expect((await context()).revision).toBe(1);
    expect(
      (
        await db.query("select count(*)::int n from public.recovery_checkins where user_id=$1", [
          alice,
        ])
      ).rows[0].n,
    ).toBe(0);
  });
});

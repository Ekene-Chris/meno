import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { Client } from "pg";
import { localUrl } from "../helpers/local-env";
import { scorePractical, practicalContentHash } from "@/features/assessment/practical-scoring";
import { practicalInputSchema } from "@/features/assessment/practical-schema";
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
const opportunity = "demo-frontend-api-v1";
const saveSQL = "select public.save_opportunity($1,$2,$3,$4) result";
async function radar(user = alice) {
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  return (await db.query("select public.get_opportunity_radar($1) result", [opportunity])).rows[0]
    .result[0];
}
describe("fictional catalog, owned saved baselines and current observations", () => {
  it("saves an authoritative baseline, compares actual progress and preserves unrelated requirements", async () => {
    const before = await radar();
    expect(before.opportunity).toMatchObject({
      verification: "demo",
      isDemo: true,
      applicationUrl: null,
      sourceUrl: null,
      deadline: null,
    });
    expect(before.saved).toBeNull();
    expect(
      (await db.query("select public.get_journey_state() result")).rows[0].result,
    ).toMatchObject({
      exampleSaved: false,
      progressRecorded: false,
      practiceSubmitted: false,
      stepAccepted: false,
    });
    await db.query(saveSQL, [opportunity, crypto.randomUUID(), false, true]);
    const a = await start();
    await mutation(a.attemptId, 1, "submit");
    await db.query("select public.record_practical_progress($1,$2,$3,$4,$5::jsonb)", [
      alice,
      a.attemptId,
      crypto.randomUUID(),
      practicalContentHash,
      JSON.stringify(scorePractical(correct)),
    ]);
    const after = await radar();
    expect(after.saved.baseline).toEqual(before.observations);
    expect(
      (await db.query("select public.get_journey_state() result")).rows[0].result,
    ).toMatchObject({
      exampleSaved: true,
      progressRecorded: true,
      practiceSubmitted: true,
      stepAccepted: false,
    });
    expect(
      after.observations.find((o: { skillId: string }) => o.skillId === "js.promises"),
    ).toMatchObject({ method: "guided_scaffold", status: "demonstrated" });
    expect(after.observations.find((o: { skillId: string }) => o.skillId === "git.basics")).toEqual(
      before.observations.find((o: { skillId: string }) => o.skillId === "git.basics"),
    );
    expect(
      after.saved.baseline.find((o: { skillId: string }) => o.skillId === "js.promises").evidenceId,
    ).toBeNull();
  });
  it("replays old saves before current state, rejects stale changes and resaves a fresh baseline", async () => {
    await radar();
    const request = crypto.randomUUID();
    const first = (await db.query(saveSQL, [opportunity, request, false, true])).rows[0].result;
    await db.query(saveSQL, [opportunity, crypto.randomUUID(), true, false]);
    expect((await db.query(saveSQL, [opportunity, request, false, true])).rows[0].result).toEqual(
      first,
    );
    expect((await radar()).saved).toBeNull();
    await deny(saveSQL, [opportunity, request, true, false], "PT409");
    await deny(saveSQL, [opportunity, crypto.randomUUID(), true, false], "PT409");
    await db.query(saveSQL, [opportunity, crypto.randomUUID(), false, true]);
    expect((await radar()).saved).not.toBeNull();
  });
  it("isolates baseline/receipts with real roles and denies helper, forged writes and anonymous access", async () => {
    await radar();
    await db.query(saveSQL, [opportunity, crypto.randomUUID(), false, true]);
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [bob]);
    expect((await db.query("select * from public.saved_opportunities")).rows).toEqual([]);
    expect((await db.query("select * from public.opportunity_save_receipts")).rows).toEqual([]);
    expect(
      (await db.query("select public.get_opportunity_radar($1) result", [opportunity])).rows[0]
        .result[0].saved,
    ).toBeNull();
    await deny("select public.opportunity_observations_for($1,$2)", [alice, opportunity], "42501");
    await deny(
      "insert into public.saved_opportunities(user_id,opportunity_id,baseline) values($1,$2,'[]')",
      [alice, opportunity],
      "42501",
    );
    await db.query("set local role anon");
    await deny("select public.get_opportunity_radar()", [], "42501");
    await deny(saveSQL, [opportunity, crypto.randomUUID(), false, true], "42501");
    await db.query("reset role");
    await db.query("delete from auth.users where id=$1", [alice]);
    expect(
      (await db.query("select * from public.saved_opportunities where user_id=$1", [alice])).rows,
    ).toEqual([]);
    expect(
      (await db.query("select * from public.opportunity_save_receipts where user_id=$1", [alice]))
        .rows,
    ).toEqual([]);
  });
  it("database guards reject fake metadata, unknown skill tags and missing example labels", async () => {
    const content = (await radar()).opportunity;
    await deny(
      "insert into public.opportunities(id,content) values('demo-invalid',$1::jsonb)",
      [
        JSON.stringify({
          ...content,
          id: "demo-invalid",
          applicationUrl: "https://fake.example/apply",
        }),
      ],
      "23514",
    );
    await deny(
      "insert into public.opportunities(id,content) values('demo-invalid','{}')",
      [],
      "23514",
    );
    await deny(
      "insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values($1,'fake','unknown.skill',$2::jsonb)",
      [
        opportunity,
        JSON.stringify({
          id: "fake",
          skillId: "unknown.skill",
          priority: "required",
          evidenceLevel: "guided_foundation",
        }),
      ],
      "23503",
    );
    await deny(saveSQL, ["demo-missing", crypto.randomUUID(), false, true], "PT404");
  });
  it("captures evidence from the authenticated owner and never takes a client baseline", async () => {
    const a = await start();
    await mutation(a.attemptId, 1, "submit");
    await db.query("select public.record_practical_progress($1,$2,$3,$4,$5::jsonb)", [
      alice,
      a.attemptId,
      crypto.randomUUID(),
      practicalContentHash,
      JSON.stringify(scorePractical(correct)),
    ]);
    await radar();
    await db.query(saveSQL, [opportunity, crypto.randomUUID(), false, true]);
    const saved = (await radar()).saved;
    expect(saved.baseline.filter((o: { evidenceId: string | null }) => o.evidenceId)).toHaveLength(
      2,
    );
    const other = await radar(bob);
    expect(
      (await db.query("select public.get_journey_state() result")).rows[0].result,
    ).toMatchObject({ exampleSaved: false, progressRecorded: false, practiceSubmitted: false });
    expect(other.observations.every((o: { evidenceId: unknown }) => o.evidenceId === null)).toBe(
      true,
    );
  });
});

import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";
import fixture from "../fixtures/practical-api-v1.json" with { type: "json" };
const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !publicKey) throw new Error("Local test keys required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);
const password = `Meno-radar-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const headers = { origin: "http://127.0.0.1:3100" };
test.beforeAll(async () => {
  for (let i = 0; i < 4; i++) {
    const email = `meno-radar-${crypto.randomUUID()}@example.test`;
    const account = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    if (account.error || !account.data.user) throw new Error("Fixture failed");
    learners.push({ id: account.data.user.id, email });
    const db = createClient(url, publicKey, options);
    if ((await db.auth.signInWithPassword({ email, password })).error)
      throw new Error("Sign in failed");
    if (
      (
        await db.rpc("save_passport", {
          p_request_id: crypto.randomUUID(),
          p_input: {
            display_name: "Practical fixture",
            entry_state: i === 1 ? "starting" : "returning",
            locale: "en",
            desired_skill: "JavaScript",
            target_role: null,
            motivation: null,
            study_minutes_per_week: 90,
            device: "phone",
            bandwidth: "limited",
          },
        })
      ).error
    )
      throw new Error("Passport failed");
  }
});
test.afterAll(async () => {
  for (const learner of learners)
    if ((await admin.auth.admin.deleteUser(learner.id)).error) throw new Error("Cleanup failed");
});
async function signIn(page: Page, i: number) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(learners[i].email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue your journey" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function start(page: Page) {
  await page.goto("/practice");
  await page.getByRole("button", { name: "Start API-app practice" }).click();
  await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/);
  return page.url().split("/").at(-1) as string;
}
async function complete(page: Page) {
  for (const [id, choice] of Object.entries(fixture.choices))
    await page.locator(`#${id}`).selectOption(choice);
}
import diagnostic from "../fixtures/javascript-diagnostic-v1.json" with { type: "json" };
async function submit(page: Page) {
  await page.getByRole("button", { name: "Review submission" }).click();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await expect(
    page.getByRole("heading", { name: /guided criteria are met|submission is inconclusive/ }),
  ).toBeVisible();
}
async function record(page: Page) {
  await page.getByRole("button", { name: "Review progress recording" }).click();
  await page.getByRole("button", { name: "Confirm progress recording" }).click();
}
test("full returning journey connects saved opportunity gaps, course, diagnostic, mentor and recorded practice", async ({
  page,
}, testInfo) => {
  await signIn(page, 0);
  await page.goto("/opportunities/demo-frontend-api-v1");
  await expect(page.getByText("DEMO — NOT A LIVE LISTING", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save example and baseline" }).click();
  await expect(page.getByRole("button", { name: "Remove saved example" })).toBeVisible();
  const initialRadar = await (
    await page.request.get("/api/opportunities/demo-frontend-api-v1")
  ).json();
  const moduleId = crypto.randomUUID();
  const course = {
    title: "Returning learner class",
    source_type: "class",
    source_url: null,
    outline: "Promises then APIs",
    modules: [
      { id: moduleId, title: "Promises", topics: [{ label: "Promises", skill_id: "js.promises" }] },
    ],
    checkpoint_module_id: moduleId,
    checkpoint_note: "Self-reported place",
  };
  const saved = await (
    await page.request.post("/api/courses", {
      headers,
      data: { requestId: crypto.randomUUID(), course },
    })
  ).json();
  expect(saved.courseId).toBeTruthy();
  expect(
    (
      await page.request.post(`/api/courses/${saved.courseId}/confirm`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1 },
      })
    ).status(),
  ).toBe(200);
  const diagnosticStart = await (
    await page.request.post("/api/assessments", {
      headers,
      data: { requestId: crypto.randomUUID() },
    })
  ).json();
  const answers = diagnostic.answers.map((a) =>
    a.questionId === "promises-order" ? { ...a, choiceIds: ["done-now"] } : a,
  );
  expect(
    (
      await page.request.put(`/api/assessments/${diagnosticStart.attemptId}`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1, answers },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/assessments/${diagnosticStart.attemptId}/evaluate`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 2 },
      })
    ).status(),
  ).toBe(200);
  const proposal = await (
    await page.request.post("/api/learning-path/proposals", {
      headers,
      data: { requestId: crypto.randomUUID(), expectedRevision: 0, courseId: saved.courseId },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/learning-path/proposals/${proposal.proposalId}/review`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1, operation: "accept" },
      })
    ).status(),
  ).toBe(200);
  await page.route("**/api/mentor", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const input = route.request().postDataJSON();
    const sql = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
    await sql.connect();
    const reply = {
      action: "explain",
      reply:
        "Start and ready are synchronous; the promise callbacks follow. Your quiz observation is narrow, so practice one chain without restarting your course.",
      rationale: "The saved diagnostic has an observed promise gap.",
      resourceIds: ["mdn-promises-v1"],
      skillIds: ["js.promises"],
      evidenceIds: [],
      limitations: ["Controlled browser fixture; this chat does not assess skills."],
    };
    try {
      await sql.query("select public.reserve_mentor_turn($1,$2,$3,$4,$5,$6,$7)", [
        learners[0].id,
        input.requestId,
        input.question,
        input.expectedContextHash,
        "controlled-browser-fixture",
        50,
        input.courseId,
      ]);
      await sql.query("select public.finish_mentor_turn($1,$2,$3::jsonb,$4)", [
        learners[0].id,
        input.requestId,
        JSON.stringify(reply),
        null,
      ]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ requestId: input.requestId, status: "ready", result: reply }),
      });
    } finally {
      await sql.end();
    }
  });
  await page.goto("/mentor");
  await page
    .getByLabel("Your question", { exact: true })
    .fill("I paused when promise chains became confusing. What should I practice?");
  await page.getByRole("button", { name: "Ask Meno" }).click();
  await expect(
    page.getByText("Start and ready are synchronous; the promise callbacks follow.", {
      exact: false,
    }),
  ).toBeVisible();
  const before = await (await page.request.get("/api/me")).json();
  await start(page);
  await complete(page);
  await submit(page);
  expect((await (await page.request.get("/api/me")).json()).skills).toEqual(before.skills);
  await record(page);
  await expect(page.getByRole("heading", { name: "Guided exercise completed." })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Try a small example without the scaffold" }),
  ).toBeVisible();
  const after = await (await page.request.get("/api/me")).json();
  const promises = after.skills.find((s: { id: string }) => s.id === "js.promises");
  expect(promises.finding.status).toBe("demonstrated");
  expect(promises.evidence.assessment_method).toBe("guided_scaffold");
  for (const skillId of ["js.variables", "js.functions", "js.arrays", "git.basics"])
    expect(after.skills.find((s: { id: string }) => s.id === skillId)).toEqual(
      before.skills.find((s: { id: string }) => s.id === skillId),
    );
  expect((await (await page.request.get("/api/learning-path/review")).json()).active.id).toBe(
    proposal.proposalId,
  );
  expect(
    (await (await page.request.get(`/api/courses/${saved.courseId}`)).json()).confirmed.content,
  ).toEqual(course);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Guided exercise completed." })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("Shown in guided scaffold", { exact: true })).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: "Review the guided choices and evidence" }),
  ).toHaveCount(3);
  await page.goto("/opportunities/demo-frontend-api-v1");
  await expect(page.locator('[data-requirement="promise-preparation"]')).toContainText(
    "Guided preparation shown",
  );
  await expect(page.locator('[data-requirement="fetch-preparation"]')).toContainText(
    "Since saved: Not assessed → Guided preparation shown",
  );
  await expect(page.locator('[data-requirement="promises-project"]')).toContainText(
    "Independent evidence still needed",
  );
  await expect(page.locator('[data-requirement="git-project"]')).toContainText(
    "No relevant evidence change",
  );
  const currentRadar = await (
    await page.request.get("/api/opportunities/demo-frontend-api-v1")
  ).json();
  expect(currentRadar.saved.baseline).toEqual(initialRadar.saved.baseline);
  await page.goto("/journey");
  await expect(
    page.getByText("Your saved baseline and recorded progress are ready to compare.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.goto("/opportunities/demo-frontend-api-v1");
  await expect(page.getByRole("heading", { name: "Frontend API portfolio brief" })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("opportunity-mobile.png"),
    fullPage: true,
  });
});
test("beginner explores examples with unknown evidence and starts a focused scaffold without claiming independent skill", async ({
  page,
}) => {
  await signIn(page, 1);
  await page.goto("/opportunities/demo-frontend-api-v1");
  await expect(page.locator('[data-requirement="fetch-preparation"]')).toContainText(
    "Not assessed",
  );
  await page
    .locator('[data-requirement="fetch-preparation"]')
    .getByRole("link", { name: "Work on guided preparation" })
    .click();
  await expect(page).toHaveURL(/\/practice\?session=fetch$/);
  await expect(page.getByText("Focus requested: fetch.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Start API-app practice" }).click();
  await expect(page).toHaveURL(/#session-fetch$/);
  await expect(page.getByRole("heading", { name: "2. Fetch and read a response" })).toBeVisible();
});
test("lost saved-baseline response is replayed exactly and current state survives a later removal", async ({
  page,
}) => {
  await signIn(page, 2);
  const path = "/api/opportunities/demo-frontend-api-v1";
  await page.goto("/opportunities/demo-frontend-api-v1");
  let first = true;
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "PUT" || !first) {
      await route.continue();
      return;
    }
    first = false;
    const res = await route.fetch();
    expect(res.status()).toBe(200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Save example and baseline" }).click();
  await expect(page.getByRole("status")).toContainText("couldn’t verify");
  expect(
    (
      await page.request.put(path, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedSaved: true, saved: false },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Retry the same save" }).click();
  await expect(page.getByRole("button", { name: "Save example and baseline" })).toBeVisible();
  expect((await (await page.request.get(path)).json()).saved).toBeNull();
});
test("private saved baselines require auth, deny fabricated payloads and survive new-tab session renewal", async ({
  page,
  browser,
}) => {
  await signIn(page, 3);
  const path = "/api/opportunities/demo-frontend-api-v1";
  await page.goto("/opportunities/demo-frontend-api-v1");
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Save example and baseline" }).click();
  await expect(page.getByRole("status")).toContainText("session expired");
  const login = await page.context().newPage();
  await signIn(login, 3);
  await login.close();
  await page.getByRole("button", { name: "Retry the same save" }).click();
  await expect(page.getByRole("button", { name: "Remove saved example" })).toBeVisible();
  expect(
    (
      await page.request.put(path, {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          expectedSaved: true,
          saved: false,
          baseline: [{ status: "demonstrated" }],
        },
      })
    ).status(),
  ).toBe(400);
  const other = await browser.newContext();
  const bob = await other.newPage();
  await signIn(bob, 2);
  expect((await (await bob.request.get(path)).json()).saved).toBeNull();
  await other.close();
  await page.context().clearCookies();
  expect((await page.request.get(path)).status()).toBe(401);
});

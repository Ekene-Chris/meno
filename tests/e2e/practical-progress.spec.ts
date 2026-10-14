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
const password = `Meno-progress-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const headers = { origin: "http://127.0.0.1:3100" };
test.beforeAll(async () => {
  for (let i = 0; i < 4; i++) {
    const email = `meno-progress-${crypto.randomUUID()}@example.test`;
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
test("course-linked returning learner records narrow progress and gets a changed proposed action without completing the accepted task", async ({
  page,
}, testInfo) => {
  await signIn(page, 0);
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
  const before = await (await page.request.get("/api/me")).json();
  const id = await start(page);
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
  const next = await (
    await page.request.post("/api/learning-path/proposals", {
      headers,
      data: { requestId: crypto.randomUUID(), expectedRevision: 1, courseId: saved.courseId },
    })
  ).json();
  const nextState = await (
    await page.request.get(`/api/learning-path/proposals/${next.proposalId}`)
  ).json();
  expect(nextState.proposal.mode).toBe("practice");
  await page.goto(`/practice/${id}`);
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("guided-progress-mobile.png"),
    fullPage: true,
  });
});
test("partial and free-form work never produce full mastery and have distinct supported follow-ups", async ({
  page,
}) => {
  await signIn(page, 1);
  const id = await start(page);
  await page.locator("#promise-return").selectOption("log-name");
  await submit(page);
  await record(page);
  await expect(
    page.getByRole("heading", { name: "Incomplete or unsupported work stays inconclusive." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review one observed scaffold gap" }),
  ).toBeVisible();
  const work = await (await page.request.get(`/api/practice/${id}`)).json();
  expect(work.progress.findings[0].observedCount).toBe(1);
  expect(work.progress.findings[0].status).toBe("needs_review");
  expect(work.progress.findings[1].evidenceId).toBeNull();
  await page.getByRole("button", { name: "Start API-app practice" }).click();
  await page.getByLabel("Submission format").selectOption("open");
  await page.getByLabel("Code (optional").fill("throw Error('unexecuted')");
  await submit(page);
  await record(page);
  await expect(
    page.getByRole("heading", { name: "Choose a checkable next step with your mentor" }),
  ).toBeVisible();
});
test("lost committed recording retries exactly once and private access cannot forge evidence", async ({
  page,
  browser,
}) => {
  await signIn(page, 2);
  const id = await start(page);
  await complete(page);
  await submit(page);
  let first = true;
  await page.route(`**/api/practice/${id}/progress`, async (route) => {
    if (!first) {
      await route.continue();
      return;
    }
    first = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await record(page);
  await expect(
    page.getByRole("region", { name: "Recorded exercise progress" }).getByRole("status"),
  ).toContainText("couldn’t verify this recording");
  await page.getByRole("button", { name: "Retry progress recording" }).click();
  await expect(page.getByRole("heading", { name: "Guided exercise completed." })).toBeVisible();
  const work = await (await page.request.get(`/api/practice/${id}`)).json();
  expect(
    (
      await page.request.post(`/api/practice/${id}/progress`, {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          contentHash: work.contentHash,
          status: "demonstrated",
        },
      })
    ).status(),
  ).toBe(400);
  const other = await browser.newContext();
  const bob = await other.newPage();
  await signIn(bob, 0);
  expect(
    (
      await bob.request.post(`/api/practice/${id}/progress`, {
        headers,
        data: { requestId: crypto.randomUUID(), contentHash: work.contentHash },
      })
    ).status(),
  ).toBe(404);
  await other.close();
  const before = await (await page.request.get("/api/me")).json();
  expect(
    before.recentEvidence.filter(
      (e: { practical_attempt_id: string }) => e.practical_attempt_id === id,
    ),
  ).toHaveLength(3);
});
test("expired session renews in a new tab without losing the recording request", async ({
  page,
}) => {
  await signIn(page, 3);
  await start(page);
  await complete(page);
  await submit(page);
  await page.context().clearCookies();
  await record(page);
  await expect(
    page.getByRole("region", { name: "Recorded exercise progress" }).getByRole("status"),
  ).toContainText("session expired");
  const login = await page.context().newPage();
  await signIn(login, 3);
  await login.close();
  await page.getByRole("button", { name: "Retry progress recording" }).click();
  await expect(page.getByRole("heading", { name: "Guided exercise completed." })).toBeVisible();
});

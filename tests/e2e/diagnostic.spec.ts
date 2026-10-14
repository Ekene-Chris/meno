import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";
import correct from "../fixtures/javascript-diagnostic-v1.json" with { type: "json" };

const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !publicKey) throw new Error("Local test configuration is required.");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);
const password = `Meno-diagnostic-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const headers = { origin: "http://127.0.0.1:3100" };
test.beforeAll(async () => {
  for (let i = 0; i < 6; i++) {
    const email = `meno-diagnostic-${crypto.randomUUID()}@example.test`;
    const result = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    if (result.error || !result.data.user)
      throw new Error("Could not create local diagnostic fixture.");
    learners.push({ id: result.data.user.id, email });
    const client = createClient(url, publicKey, options);
    if ((await client.auth.signInWithPassword({ email, password })).error)
      throw new Error("Local fixture sign-in failed.");
    if (
      (
        await client.rpc("save_passport", {
          p_request_id: crypto.randomUUID(),
          p_input: {
            display_name: i === 0 ? "David" : "Check learner",
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
      throw new Error("Local Passport fixture failed.");
  }
});
test("check history paginates while keeping the active check available on older pages", async ({
  page,
}) => {
  test.setTimeout(90000);
  await signIn(page, 5);
  const skips = correct.answers.map(({ questionId }) => ({ questionId, choiceIds: null }));
  for (let i = 0; i < 21; i++) {
    const response = await page.request.post("/api/assessments", {
      headers,
      data: { requestId: crypto.randomUUID() },
    });
    expect(response.status()).toBe(200);
    const { attemptId } = await response.json();
    await apiSave(page, attemptId, 1, skips);
    await apiEvaluate(page, attemptId, 2);
  }
  const response = await page.request.post("/api/assessments", {
    headers,
    data: { requestId: crypto.randomUUID() },
  });
  expect(response.status()).toBe(200);
  const { attemptId } = await response.json();
  await page.goto("/assessment");
  await expect(page.locator(".diagnostic-history li")).toHaveCount(20);
  await page.getByRole("link", { name: "Older checks", exact: true }).click();
  await expect(page.locator(".diagnostic-history li")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Resume your check", exact: true })).toHaveAttribute(
    "href",
    `/assessment/${attemptId}`,
  );
  const records = await (await page.request.get("/api/assessments?page=1")).json();
  expect(records.activeAttemptId).toBe(attemptId);
  expect(records.attempts).toHaveLength(2);
  expect(records.nextPage).toBeNull();
  await page.getByRole("link", { name: "Newer checks", exact: true }).click();
  await expect(page.locator(".diagnostic-history li")).toHaveCount(20);
  expect((await page.request.get("/api/assessments?page=-1")).status()).toBe(400);
});
test.afterAll(async () => {
  for (const learner of learners)
    if ((await admin.auth.admin.deleteUser(learner.id)).error)
      throw new Error("Diagnostic fixture cleanup failed.");
});
async function signIn(page: Page, index: number) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(learners[index].email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue your journey" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function start(page: Page) {
  await page.goto("/assessment");
  await page
    .getByRole("button", { name: /^(Start the JavaScript check|Take another JavaScript check)$/ })
    .click();
  await expect(page).toHaveURL(/\/assessment\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Question 1 of 8" })).toBeVisible();
  return page.url().split("/").at(-1) as string;
}
async function next(page: Page, index: number) {
  await page
    .getByRole("button", { name: /^(Save & next|Next question|Save & review answers)$/ })
    .click();
  await expect(
    page.getByRole("heading", {
      name: index === 8 ? "Review your answers" : `Question ${index + 1} of 8`,
    }),
  ).toBeVisible();
}
async function apiSave(
  page: Page,
  id: string,
  revision: number,
  answers: unknown,
  requestId = crypto.randomUUID(),
) {
  const response = await page.request.put(`/api/assessments/${id}`, {
    headers,
    data: { requestId, expectedRevision: revision, answers },
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function apiEvaluate(
  page: Page,
  id: string,
  revision: number,
  requestId = crypto.randomUUID(),
) {
  const response = await page.request.post(`/api/assessments/${id}/evaluate`, {
    headers,
    data: { requestId, expectedRevision: revision },
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test("returning learner saves on mobile, resumes in a fresh session, and sees scoped strengths/gaps without losing the course checkpoint", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 0);
  const moduleId = crypto.randomUUID();
  const course = {
    title: "Existing JavaScript course",
    source_type: "class",
    source_url: null,
    outline: "Functions, arrays and promises",
    modules: [
      {
        id: moduleId,
        title: "Promises",
        topics: [{ label: "Promise chaining", skill_id: "js.promises" }],
      },
    ],
    checkpoint_module_id: moduleId,
    checkpoint_note: "Continue at promise chaining.",
  };
  const savedCourse = await (
    await page.request.post("/api/courses", {
      headers,
      data: { requestId: crypto.randomUUID(), course },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/courses/${savedCourse.courseId}/confirm`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1 },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/courses/${savedCourse.courseId}`);
  await page.getByRole("link", { name: "Check what you remember" }).click();
  await page.getByRole("button", { name: "Start the JavaScript check" }).click();
  await expect(page).toHaveURL(/\/assessment\/[0-9a-f-]+$/);
  const checkUrl = page.url();
  await page.getByRole("radio", { name: "7", exact: true }).check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "My courses", exact: true }).click();
  await expect(page.getByRole("radio", { name: "7", exact: true })).toBeChecked();
  await next(page, 1);
  await page.getByRole("checkbox", { name: "first", exact: true }).check();
  await page.getByRole("checkbox", { name: "third", exact: true }).check();
  await next(page, 2);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const fresh = await context.newPage();
    await signIn(fresh, 0);
    await fresh.getByRole("link", { name: "Skill checks", exact: true }).click();
    await fresh.getByRole("link", { name: "Resume your check" }).click();
    await expect(fresh).toHaveURL(checkUrl);
    await expect(fresh.getByRole("heading", { name: "Question 3 of 8" })).toBeVisible();
    await fresh.getByRole("radio", { name: "5", exact: true }).check();
    await next(fresh, 3);
    await fresh.getByRole("radio", { name: '"Hello"', exact: true }).check();
    await next(fresh, 4);
    await fresh.getByRole("radio", { name: /original is still/ }).check();
    await next(fresh, 5);
    await fresh.getByRole("radio", { name: "[3, 4]", exact: true }).check();
    await next(fresh, 6);
    await fresh.getByRole("radio", { name: "done, then now", exact: true }).check();
    await next(fresh, 7);
    await fresh.getByRole("checkbox", { name: /A then callback always runs immediately/ }).check();
    await fresh.screenshot({ path: "test-results/diagnostic-question-mobile.png", fullPage: true });
    expect(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await next(fresh, 8);
    const before = await (await fresh.request.get("/api/me")).json();
    expect(
      before.skills.every(
        (skill: { finding: { status: string } }) => skill.finding.status === "not_assessed",
      ),
    ).toBe(true);
    await fresh.getByRole("button", { name: "See my results" }).click();
    await expect(fresh.getByRole("heading", { name: "What this check observed" })).toBeVisible();
    await fresh.reload();
    await expect(fresh.getByRole("region", { name: "Diagnostic findings" })).toContainText(
      "Review these examples",
    );
    const passport = await (await fresh.request.get("/api/me")).json();
    for (const skillId of ["js.functions", "js.arrays"])
      expect(
        passport.skills.find((skill: { id: string }) => skill.id === skillId).finding.status,
      ).toBe("demonstrated");
    expect(
      passport.skills.find((skill: { id: string }) => skill.id === "js.promises").finding.status,
    ).toBe("needs_review");
    expect(
      passport.skills.find((skill: { id: string }) => skill.id === "web.fetch-api").finding.status,
    ).toBe("not_assessed");
    expect(passport.recentEvidence).toHaveLength(4);
    expect(
      passport.recentEvidence.every(
        (item: { assessment_attempt_id: string; scope: string }) =>
          item.assessment_attempt_id === checkUrl.split("/").at(-1) && item.scope,
      ),
    ).toBe(true);
    const currentCourse = await (
      await fresh.request.get(`/api/courses/${savedCourse.courseId}`)
    ).json();
    expect(currentCourse.confirmed.content).toEqual(course);
    await fresh.screenshot({ path: "test-results/diagnostic-results-mobile.png", fullPage: true });
    await fresh.getByRole("link", { name: "View your Passport evidence" }).click();
    await expect(fresh.getByRole("region", { name: "Recent skill evidence" })).toBeVisible();
    await expect(fresh.getByText("Shown in quiz examples", { exact: true })).toHaveCount(3);
    await fresh.screenshot({ path: "test-results/diagnostic-passport-mobile.png", fullPage: true });
  } finally {
    await context.close();
  }
});
test("beginner can explicitly skip without failing skills, retake, and preserve earlier evidence after later skips", async ({
  page,
}) => {
  test.setTimeout(60000);
  await signIn(page, 1);
  const first = await start(page);
  for (let index = 1; index <= 8; index++) {
    await page.getByRole("button", { name: "Skip this question" }).click();
    await next(page, index);
  }
  await page.getByRole("button", { name: "See my results" }).click();
  await expect(
    page.getByText("No questions answered in this scope; no score awarded.", { exact: true }),
  ).toHaveCount(4);
  const initial = await (await page.request.get("/api/me")).json();
  expect(initial.recentEvidence).toHaveLength(0);
  expect(
    initial.skills.every(
      (skill: { finding: { status: string } }) => skill.finding.status === "not_assessed",
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "All your checks & retakes" }).click();
  await page.getByRole("button", { name: "Take another JavaScript check" }).click();
  await expect(page).toHaveURL(/\/assessment\/[0-9a-f-]+$/);
  const second = page.url().split("/").at(-1) as string;
  expect(second).not.toBe(first);
  const saved = await apiSave(page, second, 1, correct.answers);
  await apiEvaluate(page, second, saved.revision);
  await page.reload();
  await expect(page.getByRole("heading", { name: "What this check observed" })).toBeVisible();
  const prior = await (await page.request.get("/api/me")).json();
  expect(prior.recentEvidence).toHaveLength(4);
  const third = await (
    await page.request.post("/api/assessments", {
      headers,
      data: { requestId: crypto.randomUUID() },
    })
  ).json();
  const skipped = correct.answers.map((answer) => ({ ...answer, choiceIds: null }));
  const draft = await apiSave(page, third.attemptId, 1, skipped);
  await apiEvaluate(page, third.attemptId, draft.revision);
  const after = await (await page.request.get("/api/me")).json();
  expect(after.skills.map((skill: { finding: unknown }) => skill.finding)).toEqual(
    prior.skills.map((skill: { finding: unknown }) => skill.finding),
  );
  expect(after.recentEvidence).toHaveLength(4);
});
test("competing edits preserve input and lost save/evaluation responses reuse their IDs without duplicate evidence", async ({
  page,
}) => {
  test.setTimeout(60000);
  await signIn(page, 2);
  const id = await start(page);
  await page.getByRole("radio", { name: "7", exact: true }).check();
  await apiSave(page, id, 1, [{ questionId: "values-addition", choiceIds: ["three"] }]);
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "changed in another tab" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "7", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Load latest saved check" }).click();
  await expect(page.getByRole("region", { name: "Compare saved answers" })).toBeVisible();
  await page.getByRole("button", { name: "Keep my answers over version 2" }).click();
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(
    page.getByText("Answers saved. You can leave and resume this check.", { exact: true }),
  ).toBeVisible();
  const saveIds: string[] = [];
  let drop = true;
  await page.route(`**/api/assessments/${id}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    saveIds.push(route.request().postDataJSON().requestId);
    if (drop) {
      drop = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{" });
    } else await route.continue();
  });
  await page.getByRole("radio", { name: "3", exact: true }).check();
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByRole("button", { name: "Retry request" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "7", exact: true })).toBeDisabled();
  await apiSave(page, id, 4, correct.answers.slice(0, 2));
  await page.getByRole("button", { name: "Retry request" }).click();
  await expect(
    page.getByText(
      "Your request succeeded. Newer saved answers are shown; review them before submitting.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(saveIds).toHaveLength(2);
  expect(saveIds[0]).toBe(saveIds[1]);
  await page.unroute(`**/api/assessments/${id}`);
  const saved = await apiSave(page, id, 5, correct.answers);
  expect(saved.revision).toBe(6);
  await page.reload();
  const submitIds: string[] = [];
  let lose = true;
  await page.route(`**/api/assessments/${id}/evaluate`, async (route) => {
    submitIds.push(route.request().postDataJSON().requestId);
    if (lose) {
      lose = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{" });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "See my results" }).click();
  await expect(page.getByRole("button", { name: "Retry request" })).toBeVisible();
  await page.getByRole("button", { name: "Retry request" }).click();
  await expect(page.getByRole("heading", { name: "What this check observed" })).toBeVisible();
  expect(submitIds).toHaveLength(2);
  expect(submitIds[0]).toBe(submitIds[1]);
  expect((await (await page.request.get("/api/me")).json()).recentEvidence).toHaveLength(4);
});
test("assessment APIs enforce owner isolation, input/origin bounds and complete saved answers without exposing keys", async ({
  page,
  browser,
  playwright,
}) => {
  await signIn(page, 3);
  const id = await start(page);
  const record = await (await page.request.get(`/api/assessments/${id}`)).json();
  expect(record.evaluation).toBeNull();
  expect(JSON.stringify(record)).not.toContain("correctChoiceIds");
  expect(
    (
      await page.request.post(`/api/assessments/${id}/evaluate`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post("/api/assessments", {
        headers: { origin: "https://attacker.test" },
        data: { requestId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/assessments", {
        headers,
        data: { requestId: crypto.randomUUID(), userId: learners[4].id },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.put(`/api/assessments/${id}`, {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          expectedRevision: 1,
          answers: correct.answers,
          status: "demonstrated",
        },
      })
    ).status(),
  ).toBe(400);
  const otherContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signIn(other, 4);
    expect((await other.request.get(`/api/assessments/${id}`)).status()).toBe(404);
    expect(
      (
        await other.request.put(`/api/assessments/${id}`, {
          headers,
          data: { requestId: crypto.randomUUID(), expectedRevision: 1, answers: correct.answers },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.post(`/api/assessments/${id}/evaluate`, {
          headers,
          data: { requestId: crypto.randomUUID(), expectedRevision: 1 },
        })
      ).status(),
    ).toBe(404);
    // A loading boundary can stream a 200 shell before Next renders notFound.
    // The owned API returns 404; the page must show denial without private content.
    await other.goto(`/assessment/${id}`);
    await expect(other.getByRole("heading", { name: "That check isn’t available." })).toBeVisible();
    await expect(other.locator(".diagnostic-workspace")).toHaveCount(0);
    await expect(other.locator('meta[name="robots"][content="noindex"]').first()).toBeAttached();
    await other.goto("/assessment/not-an-id");
    await expect(other.getByRole("heading", { name: "That check isn’t available." })).toBeVisible();
  } finally {
    await otherContext.close();
  }
  const anon = await playwright.request.newContext();
  try {
    expect((await anon.get(`http://127.0.0.1:3100/api/assessments/${id}`)).status()).toBe(401);
  } finally {
    await anon.dispose();
  }
});

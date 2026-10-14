import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";
import correct from "../fixtures/javascript-diagnostic-v1.json" with { type: "json" };
const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !publicKey) throw new Error("Local fixture keys required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);
const password = `Meno-review-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const headers = { origin: "http://127.0.0.1:3100" };
const passport = (i: number) => ({
  display_name: "Review fixture",
  entry_state: i === 4 ? "starting" : "returning",
  locale: "en",
  desired_skill: i === 5 ? "Python" : "JavaScript",
  target_role: null,
  motivation: null,
  study_minutes_per_week: i === 4 ? 15 : 90,
  device: "phone",
  bandwidth: "limited",
});
let courseId: string;
let draftCourseId: string;
let olderCourseId: string;
function course(title: string, skill = "js.promises") {
  const id = crypto.randomUUID();
  return {
    title,
    source_type: "class",
    source_url: null,
    outline: "PRIVATE_OUTLINE",
    modules: [
      { id, title: "Existing topic", topics: [{ label: "Private topic", skill_id: skill }] },
    ],
    checkpoint_module_id: id,
    checkpoint_note: "Self-reported place",
  };
}
test.beforeAll(async () => {
  for (let i = 0; i < 7; i++) {
    const email = `meno-review-${crypto.randomUUID()}@example.test`;
    const result = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    if (result.error || !result.data.user) throw new Error("Fixture account failed");
    learners.push({ id: result.data.user.id, email });
    const client = createClient(url, publicKey, options);
    if ((await client.auth.signInWithPassword({ email, password })).error)
      throw new Error("Fixture login failed");
    if (
      (
        await client.rpc("save_passport", {
          p_request_id: crypto.randomUUID(),
          p_input: passport(i),
        })
      ).error
    )
      throw new Error("Fixture Passport failed");
    if (i === 0 || i === 4) {
      for (let n = 0; n < (i === 4 ? 22 : 1); n++) {
        const input = course(
          i === 0
            ? "Returning JavaScript class"
            : n === 21
              ? "Unconfirmed draft"
              : `Confirmed class ${n}`,
          i === 4 ? "js.variables" : "js.promises",
        );
        const saved = await client.rpc("save_course_draft", {
          p_expected_revision: 0,
          p_request_id: crypto.randomUUID(),
          p_input: input,
        });
        if (saved.error) throw new Error("Fixture course failed");
        const id = (saved.data as { courseId: string }).courseId;
        if (i === 4 && n === 21) {
          draftCourseId = id;
          continue;
        }
        if (
          (
            await client.rpc("confirm_course", {
              p_course_id: id,
              p_expected_revision: 1,
              p_request_id: crypto.randomUUID(),
            })
          ).error
        )
          throw new Error("Fixture confirmation failed");
        if (i === 0) courseId = id;
        if (i === 4 && n === 0) olderCourseId = id;
        if (
          i === 4 &&
          n === 20 &&
          (
            await client.rpc("save_course_draft", {
              p_course_id: id,
              p_expected_revision: 1,
              p_request_id: crypto.randomUUID(),
              p_input: { ...input, title: "Unconfirmed replacement title" },
            })
          ).error
        )
          throw new Error("Later draft failed");
      }
    }
  }
});
test.afterAll(async () => {
  for (const learner of learners)
    if ((await admin.auth.admin.deleteUser(learner.id)).error)
      throw new Error("Fixture cleanup failed");
});
async function signIn(page: Page, i: number) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(learners[i].email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue your journey" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function suggest(page: Page) {
  await page
    .getByRole("button", { name: /^(Suggest a next step|Request a fresh suggestion)$/ })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Proposal saved" })).toBeVisible();
}
async function proposal(page: Page) {
  return (await page.request.get("/api/learning-path/review")).json();
}
async function propose(page: Page, revision: number) {
  const result = await page.request.post("/api/learning-path/proposals", {
    headers,
    data: { requestId: crypto.randomUUID(), expectedRevision: revision, courseId: null },
  });
  expect(result.status()).toBe(200);
  return result.json();
}
async function diagnostic(page: Page) {
  const started = await page.request.post("/api/assessments", {
    headers,
    data: { requestId: crypto.randomUUID() },
  });
  expect(started.status()).toBe(200);
  const { attemptId } = await started.json();
  const answers = correct.answers.map((answer) =>
    answer.questionId === "promises-order" ? { ...answer, choiceIds: ["done-now"] } : answer,
  );
  expect(
    (
      await page.request.put(`/api/assessments/${attemptId}`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1, answers },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/assessments/${attemptId}/evaluate`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 2 },
      })
    ).status(),
  ).toBe(200);
  return attemptId;
}
test("returning learner reviews course-aligned evidence, edits and accepts a persisted task, and declining a later proposal keeps it", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, 0);
  const attemptId = await diagnostic(page);
  await page.goto(`/assessment/${attemptId}`);
  await page.getByRole("link", { name: "Choose your next step" }).click();
  await expect(page).toHaveURL(/\/learning-path$/);
  await page.getByLabel("Course for the next suggestion").selectOption(courseId);
  await page.getByRole("button", { name: "Use this context" }).click();
  const before = await (await page.request.get("/api/me")).json();
  const beforeCourse = await (await page.request.get(`/api/courses/${courseId}`)).json();
  await suggest(page);
  const latest = page.getByRole("region", { name: "Latest proposal" });
  await expect(latest).toContainText("Promises");
  await expect(latest).toContainText("Retained observations:");
  await expect(latest).toContainText("Functions");
  await expect(latest).toContainText("Confirmed course:");
  await expect(latest).toContainText("DEMO — NOT A LIVE LISTING");
  await expect(latest).toContainText("Download size and reading time are unknown");
  await latest.getByText(/Evidence used for this suggestion/).click();
  await expect(latest.getByRole("link", { name: "Review this observation" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Adjust this step" }).click();
  await page.getByLabel("Task title").fill("Explain promise order in my class notes");
  await page.getByLabel("Estimated minutes").selectOption("5");
  await page
    .getByLabel("Step 1", { exact: true })
    .fill("Sketch one promise and its callback in my notebook");
  await page.getByRole("button", { name: "Remove step 2", exact: true }).click();
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await page
    .getByLabel("Step 3", { exact: true })
    .fill("Compare the result with my confirmed course example");
  await page.getByRole("button", { name: "Save adjusted proposal" }).click();
  await expect(page.getByRole("status")).toContainText("Adjusted proposal saved");
  expect((await proposal(page)).activeRevision).toBeNull();
  await page.getByRole("button", { name: "Accept this step" }).click();
  await expect(page.getByRole("group", { name: "Confirm your choice" })).toContainText(
    "earlier proposals",
  );
  await page.getByRole("button", { name: "Confirm and start" }).click();
  await expect(page.getByRole("region", { name: "Your accepted step" })).toContainText(
    "Explain promise order",
  );
  expect(await proposal(page)).toMatchObject({
    revision: 2,
    activeRevision: 2,
    latest: { decision: "accepted" },
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, 0);
  await page.goto("/learning-path");
  await expect(page.getByRole("region", { name: "Your accepted step" })).toContainText(
    "Explain promise order",
  );
  await suggest(page);
  await page.getByRole("button", { name: "Decline this proposal" }).click();
  await page.getByRole("button", { name: "Confirm decline" }).click();
  await expect(page.getByRole("status")).toContainText("Proposal declined");
  expect(await proposal(page)).toMatchObject({
    revision: 3,
    activeRevision: 2,
    latest: { decision: "declined" },
  });
  const after = await (await page.request.get("/api/me")).json();
  expect(after.skills).toEqual(before.skills);
  expect(after.recentEvidence).toEqual(before.recentEvidence);
  expect((await (await page.request.get(`/api/courses/${courseId}`)).json()).confirmed).toEqual(
    beforeCourse.confirmed,
  );
  const foreign = await browser.newContext();
  try {
    const other = await foreign.newPage();
    await signIn(other, 5);
    const state = await proposal(page);
    expect(
      (
        await other.request.post(`/api/learning-path/proposals/${state.latest.id}/review`, {
          headers,
          data: { requestId: crypto.randomUUID(), expectedRevision: 3, operation: "accept" },
        })
      ).status(),
    ).toBe(404);
    await other.goto(`/learning-path?courseId=${courseId}`);
    await expect(other.getByRole("heading", { name: "This page isn’t here." })).toBeVisible();
    await expect(other.locator('meta[name="robots"][content="noindex"]').first()).toHaveCount(1);
    await expect(other.locator("body")).not.toContainText("Returning JavaScript class");
  } finally {
    await foreign.close();
  }
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("mobile-review.png"), fullPage: true });
});
test("conflicting tabs keep local edits for comparison and stale preferences cannot activate a proposal", async ({
  page,
  context,
}) => {
  await signIn(page, 1);
  await page.goto("/learning-path");
  await suggest(page);
  const other = await context.newPage();
  await other.goto("/learning-path");
  await page.getByRole("button", { name: "Adjust this step" }).click();
  await page.getByLabel("Task title").fill("Keep my local idea");
  await other.getByRole("button", { name: "Accept this step" }).click();
  await other.getByRole("button", { name: "Confirm and start" }).click();
  await expect(other.getByRole("status")).toContainText("Step accepted");
  await page.getByRole("button", { name: "Save adjusted proposal" }).click();
  await expect(page.locator(".path-workspace [role=alert]")).toContainText(
    "Your edits are still here",
  );
  await expect(page.getByLabel("Task title")).toHaveValue("Keep my local idea");
  await page.getByRole("button", { name: "Load latest to compare" }).click();
  await expect(page.getByRole("region", { name: "Latest saved comparison" })).toContainText(
    "accepted",
  );
  await expect(page.getByLabel("Task title")).toHaveValue("Keep my local idea");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Replace my edits with saved version" }).click();
  await expect(page.getByLabel("Task title")).toHaveCount(0);
  await suggest(page);
  expect(
    (
      await page.request.post("/api/onboarding", {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          passport: { ...passport(1), study_minutes_per_week: 15 },
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Accept this step" }).click();
  await page.getByRole("button", { name: "Confirm and start" }).click();
  await expect(page.locator(".path-workspace [role=alert]")).toContainText("context changed");
  expect((await proposal(page)).activeRevision).toBe(1);
  await page.getByRole("button", { name: "Load latest to compare" }).click();
  await page.getByRole("button", { name: "Replace my edits with saved version" }).click();
  await expect(page.getByRole("button", { name: "Accept this step" })).toBeDisabled();
  await suggest(page);
  await expect(page.getByRole("region", { name: "Latest proposal" })).toContainText(
    "5 MINUTE ESTIMATE",
  );
});
test("a committed edit with a lost response retries exactly, rereads newer state and never duplicates a revision", async ({
  page,
}) => {
  await signIn(page, 2);
  await page.goto("/learning-path");
  await suggest(page);
  await page.getByRole("button", { name: "Adjust this step" }).click();
  await page.getByLabel("Task title").fill("My saved adjustment");
  const bodies: object[] = [];
  const matcher = "**/api/learning-path/proposals/*/review";
  await page.route(matcher, async (route) => {
    bodies.push(route.request().postDataJSON());
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Save adjusted proposal" }).click();
  await expect(page.locator(".path-workspace [role=alert]")).toContainText("couldn’t verify");
  await expect(page.getByLabel("Task title")).toBeDisabled();
  expect((await proposal(page)).revision).toBe(2);
  await propose(page, 2);
  await page.unroute(matcher);
  await page.route(matcher, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page.getByRole("status")).toContainText("newer saved proposal");
  expect(bodies[1]).toEqual(bodies[0]);
  expect((await proposal(page)).revision).toBe(3);
  expect(
    (await proposal(page)).history.find((row: { revision: number }) => row.revision === 2).proposal
      .title,
  ).toBe("My saved adjustment");
  expect(
    (await admin.from("learning_path_actions").select("request_id").eq("user_id", learners[2].id))
      .data,
  ).toHaveLength(1);
});
test("session expiry preserves a frozen adjustment and a lost acceptance response replays one decision", async ({
  page,
}) => {
  await signIn(page, 3);
  await page.goto("/learning-path");
  await suggest(page);
  await page.getByRole("button", { name: "Adjust this step" }).click();
  await page.getByLabel("Task title").fill("Keep this across sign-in");
  const matcher = "**/api/learning-path/proposals/*/review";
  const bodies: object[] = [];
  await page.route(matcher, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 401, json: { error: { message: "Session expired" } } });
  });
  await page.getByRole("button", { name: "Save adjusted proposal" }).click();
  await expect(page.locator(".path-workspace [role=alert]")).toContainText("session expired");
  await expect(page.getByLabel("Task title")).toHaveValue("Keep this across sign-in");
  await expect(page.getByRole("link", { name: "Sign in in a new tab" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.unroute(matcher);
  await page.route(matcher, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page.getByRole("status")).toContainText("Adjusted proposal saved");
  expect(bodies[1]).toEqual(bodies[0]);
  await page.unroute(matcher);
  await page.route(matcher, async (route) => {
    bodies.push(route.request().postDataJSON());
    expect((await route.fetch()).status()).toBe(200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Accept this step" }).click();
  await page.getByRole("button", { name: "Confirm and start" }).click();
  await expect(page.locator(".path-workspace [role=alert]")).toContainText("couldn’t verify");
  expect((await proposal(page)).activeRevision).toBe(2);
  await page.unroute(matcher);
  await page.route(matcher, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page.getByRole("status")).toContainText("Step accepted");
  expect(bodies[3]).toEqual(bodies[2]);
  expect(
    (
      await admin
        .from("learning_path_decisions")
        .select("proposal_id")
        .eq("user_id", learners[3].id)
    ).data,
  ).toHaveLength(1);
});
test("beginners can skip assessments, confirmed course paging excludes draft titles, and unsupported goals remain honest", async ({
  page,
  browser,
  playwright,
}) => {
  await signIn(page, 4);
  await page.getByRole("link", { name: "My next step", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with one manageable step" })).toBeVisible();
  const picker = page.getByLabel("Course for the next suggestion");
  await expect(picker).not.toContainText("Unconfirmed draft");
  await expect(picker).not.toContainText("Unconfirmed replacement title");
  await expect(picker).toContainText("Confirmed class 20");
  await page.getByRole("button", { name: "Load more confirmed courses" }).click();
  await expect(picker.locator(`option[value="${olderCourseId}"]`)).toHaveCount(1);
  await suggest(page);
  expect((await proposal(page)).latest.proposal).toMatchObject({
    mode: "start",
    estimatedMinutes: 5,
    basis: { evidenceIds: [] },
  });
  expect((await (await page.request.get("/api/me")).json()).recentEvidence).toHaveLength(0);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.goto(`/learning-path?courseId=${draftCourseId}`);
  await expect(page.getByRole("heading", { name: "Confirm your course first." })).toBeVisible();
  await page.getByRole("link", { name: "Continue without a course" }).click();
  await expect(picker).toHaveValue("none");
  await page.getByRole("button", { name: "Accept this step" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Confirm and start" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Your accepted step" })).toBeVisible();
  const state = await proposal(page);
  for (const patch of [
    { userId: learners[0].id },
    { adjustment: { skillId: "fake" } },
    { operation: "complete" },
    { expectedRevision: 0 },
  ])
    expect(
      (
        await page.request.post(`/api/learning-path/proposals/${state.latest.id}/review`, {
          headers,
          data: {
            requestId: crypto.randomUUID(),
            expectedRevision: 1,
            operation: "accept",
            ...patch,
          },
        })
      ).status(),
    ).toBe(400);
  expect(
    (
      await page.request.post(`/api/learning-path/proposals/${state.latest.id}/review`, {
        headers: { origin: "https://attacker.test" },
        data: { requestId: crypto.randomUUID(), expectedRevision: 1, operation: "accept" },
      })
    ).status(),
  ).toBe(403);
  const other = await browser.newContext();
  try {
    const unsupported = await other.newPage();
    await signIn(unsupported, 5);
    await unsupported.goto("/learning-path");
    await unsupported.getByRole("button", { name: "Suggest a next step" }).click();
    await expect(unsupported.locator(".path-workspace [role=alert]")).toContainText("JavaScript");
    expect((await (await unsupported.request.get("/api/me")).json()).goal.desired_skill).toBe(
      "Python",
    );
  } finally {
    await other.close();
  }
  const anon = await playwright.request.newContext();
  try {
    expect((await anon.get("http://127.0.0.1:3100/api/learning-path/review")).status()).toBe(401);
    expect((await anon.get("http://127.0.0.1:3100/api/learning-path/courses")).status()).toBe(401);
    expect(
      (
        await anon.post(
          `http://127.0.0.1:3100/api/learning-path/proposals/${state.latest.id}/review`,
          {
            headers,
            data: { requestId: crypto.randomUUID(), expectedRevision: 1, operation: "accept" },
          },
        )
      ).status(),
    ).toBe(401);
  } finally {
    await anon.dispose();
  }
});

test("a removed course cannot activate a saved proposal, but declining it and explicitly choosing no course remain usable", async ({
  page,
}) => {
  await signIn(page, 6);
  const created = await page.request.post("/api/courses", {
    headers,
    data: { requestId: crypto.randomUUID(), course: course("Temporary class", "js.variables") },
  });
  expect(created.status()).toBe(201);
  const { courseId: id } = await created.json();
  expect(
    (
      await page.request.post(`/api/courses/${id}/confirm`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1 },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/learning-path?courseId=${id}`);
  await suggest(page);
  const db = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
  await db.connect();
  try {
    expect(
      (
        await db.query("delete from public.courses where id=$1 and user_id=$2", [
          id,
          learners[6].id,
        ])
      ).rowCount,
    ).toBe(1);
  } finally {
    await db.end();
  }
  await page.getByRole("button", { name: "Decline this proposal" }).click();
  await page.getByRole("button", { name: "Confirm decline" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Proposal declined" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request a fresh suggestion" })).toBeDisabled();
  await page.getByLabel("Course for the next suggestion").selectOption("none");
  await page.getByRole("button", { name: "Use this context" }).click();
  await suggest(page);
  expect(await proposal(page)).toMatchObject({
    revision: 2,
    contextAvailable: true,
    contextCurrent: true,
    activeRevision: null,
    latest: { context: { course: null } },
  });
});

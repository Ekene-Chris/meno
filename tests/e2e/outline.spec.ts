import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";

const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !publicKey) throw new Error("Local test configuration is required.");
const auth = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, auth);
const password = `Meno-outline-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const headers = { origin: "http://127.0.0.1:3100" };
const result = {
  modules: [
    {
      title: "Functions and project work",
      topics: [
        { label: "Function inputs", skill_id: "js.functions", mapping: "suggested" },
        { label: "Callbacks", skill_id: "js.functions", mapping: "uncertain" },
        { label: "Project planning", skill_id: null, mapping: "unmapped" },
      ],
    },
  ],
};
test.beforeAll(async () => {
  for (let i = 0; i < 4; i++) {
    const email = `meno-outline-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    if (error || !data.user) throw new Error("Could not create local test learner.");
    learners.push({ id: data.user.id, email });
    const client = createClient(url, publicKey, auth);
    if ((await client.auth.signInWithPassword({ email, password })).error)
      throw new Error("Local sign-in failed.");
    const saved = await client.rpc("save_passport", {
      p_request_id: crypto.randomUUID(),
      p_input: {
        display_name: "David",
        entry_state: "returning",
        locale: "en",
        desired_skill: "JavaScript",
        target_role: null,
        motivation: null,
        study_minutes_per_week: 90,
        device: "phone",
        bandwidth: "limited",
      },
    });
    if (saved.error) throw new Error("Local Passport setup failed.");
  }
});
test.afterAll(async () => {
  for (const learner of learners)
    if ((await admin.auth.admin.deleteUser(learner.id)).error)
      throw new Error("Test cleanup failed.");
});
async function signIn(page: Page, index: number) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(learners[index].email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue your journey" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function suggestions(page: Page) {
  await page.route("**/api/courses/import", async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({ json: { requestId: input.requestId, result } });
  });
}
async function newOutline(page: Page) {
  await page.goto("/courses/new");
  await page.getByLabel("Course title").fill("JavaScript recovery");
  await page
    .getByLabel("Course outline or notes")
    .fill("Functions: parameters, callbacks. Project planning.");
}
test("learner reviews uncertain matches on mobile, discards or corrects them, then saves and confirms", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 0);
  await newOutline(page);
  await suggestions(page);
  await page.getByRole("button", { name: "Suggest topics from outline" }).click();
  await expect(page.getByText("Uncertain match — please check")).toBeVisible();
  await expect(page.getByLabel("Module 1 title")).toHaveCount(0);
  expect((await (await page.request.get("/api/courses")).json()).courses).toHaveLength(0);
  await page.getByRole("button", { name: "Discard suggestions" }).click();
  await expect(page.getByRole("region", { name: "Suggested modules" })).toHaveCount(0);
  await page.getByRole("button", { name: "Suggest topics from outline" }).click();
  await page.screenshot({ path: "test-results/outline-suggestions-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Use suggested modules" }).click();
  await page.getByLabel("Topic 2", { exact: true }).fill("Callback function inputs");
  await page.getByLabel("Skill for topic 2").selectOption("");
  await page
    .getByLabel("Where did you pause?")
    .selectOption({ label: "1. Functions and project work" });
  await page.getByRole("button", { name: "Save draft & review" }).click();
  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]+$/);
  await expect(page.getByText("Callback function inputs")).toBeVisible();
  await page.getByRole("button", { name: "Confirm course context" }).click();
  await expect(page.getByRole("heading", { name: "Your confirmed course" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your confirmed course" })).toBeVisible();
  const passport = await (await page.request.get("/api/me")).json();
  expect(
    passport.skills.every(
      (skill: { finding: { status: string } }) => skill.finding.status === "not_assessed",
    ),
  ).toBe(true);
});
test("re-extraction requires a replacement choice and keeps confirmed history and the return note", async ({
  page,
}) => {
  await signIn(page, 1);
  const moduleId = crypto.randomUUID();
  const course = {
    title: "Existing course",
    source_type: "class",
    source_url: null,
    outline: "Functions: parameters, callbacks, project planning",
    modules: [
      {
        id: moduleId,
        title: "My corrected module",
        topics: [{ label: "My corrected topic", skill_id: "js.functions" }],
      },
    ],
    checkpoint_module_id: moduleId,
    checkpoint_note: "Please keep my return note.",
  };
  const saved = await (
    await page.request.post("/api/courses", {
      headers,
      data: { requestId: crypto.randomUUID(), course },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/courses/${saved.courseId}/confirm`, {
        headers,
        data: { requestId: crypto.randomUUID(), expectedRevision: 1 },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`/courses/${saved.courseId}`);
  await page.getByRole("button", { name: "Edit course" }).click();
  await suggestions(page);
  await page.getByRole("button", { name: "Suggest topics from outline" }).click();
  await expect(page.getByRole("button", { name: "Use suggested modules" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Use suggested modules" }).click();
  await expect(page.getByLabel("Module 1 title")).toHaveValue("My corrected module");
  await expect(page.getByLabel("Where did you pause?")).toHaveValue(moduleId);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Use suggested modules" }).click();
  await expect(page.getByLabel("Where did you pause?")).toHaveValue("");
  await expect(page.getByLabel("A note for your return")).toHaveValue(course.checkpoint_note);
  const beforeSave = await (await page.request.get(`/api/courses/${saved.courseId}`)).json();
  expect(beforeSave.revision).toBe(1);
  expect(beforeSave.confirmed.content).toEqual(course);
  await page.getByRole("button", { name: "Save draft & review" }).click();
  await expect(page.getByText("Previously confirmed · Version 1")).toBeVisible();
  const afterSave = await (await page.request.get(`/api/courses/${saved.courseId}`)).json();
  expect(afterSave.revision).toBe(2);
  expect(afterSave.confirmedRevision).toBe(1);
  expect(afterSave.confirmed.content.checkpoint_module_id).toBe(moduleId);
});
test("uncertain response retries reuse the request ID and stale source suggestions cannot replace topics", async ({
  page,
}) => {
  await signIn(page, 2);
  await newOutline(page);
  const ids: string[] = [];
  await page.route("**/api/courses/import", async (route) => {
    const input = route.request().postDataJSON();
    ids.push(input.requestId);
    if (ids.length === 1) await route.abort();
    else await route.fulfill({ json: { requestId: input.requestId, result } });
  });
  await page.getByRole("button", { name: "Suggest topics from outline" }).click();
  await expect(page.getByRole("button", { name: "Retry suggestions" })).toBeVisible();
  await expect(page.getByLabel("Course outline or notes")).toBeEnabled();
  await page.getByRole("button", { name: "Retry suggestions" }).click();
  await expect(page.getByRole("button", { name: "Use suggested modules" })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await page
    .getByLabel("Course outline or notes")
    .fill("A different course about HTML and CSS layouts.");
  await expect(page.getByRole("button", { name: "Use suggested modules" })).toHaveCount(0);
  await expect(
    page.getByText("Your outline or saved version changed.", { exact: false }),
  ).toBeVisible();
});
test("unconfigured AI, foreign courses, anonymous requests and invalid origins preserve the manual path", async ({
  page,
  playwright,
}) => {
  await signIn(page, 3);
  await newOutline(page);
  await page.getByRole("button", { name: "Suggest topics from outline" }).click();
  await expect(
    page.getByRole("region", { name: "AI topic suggestions" }).getByRole("alert"),
  ).toContainText("arrange topics manually");
  await page.getByRole("button", { name: "Add module", exact: true }).click();
  await page.getByLabel("Module 1 title").fill("Manual module");
  await page.getByRole("button", { name: "Save draft & review" }).click();
  await expect(page).toHaveURL(/\/courses\/[0-9a-f-]+$/);
  const data = {
    requestId: crypto.randomUUID(),
    courseId: crypto.randomUUID(),
    expectedRevision: 1,
    expectedConfirmedRevision: null,
    title: "Other course",
    outline: "Functions and array methods",
  };
  expect((await page.request.post("/api/courses/import", { headers, data })).status()).toBe(404);
  expect(
    (
      await page.request.post("/api/courses/import", {
        headers: { origin: "https://attacker.test" },
        data,
      })
    ).status(),
  ).toBe(403);
  const anonymous = await playwright.request.newContext();
  try {
    expect(
      (
        await anonymous.post("http://127.0.0.1:3100/api/courses/import", { headers, data })
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});

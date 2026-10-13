import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";

const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !publicKey) throw new Error("Local test configuration is required.");
const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, authOptions);
const password = `Meno-course-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const origin = "http://127.0.0.1:3100";

test.beforeAll(async () => {
  for (let index = 0; index < 3; index++) {
    const email = `meno-course-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    if (error || !data.user) throw new Error("Could not create a local course-test learner.");
    learners.push({ id: data.user.id, email });
    const learner = createClient(url, publicKey, authOptions);
    const signIn = await learner.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error("Could not authenticate a local course-test learner.");
    const passport = await learner.rpc("save_passport", {
      p_request_id: crypto.randomUUID(),
      p_input: {
        display_name: null,
        entry_state: "returning",
        locale: "en",
        desired_skill: "JavaScript",
        study_minutes_per_week: 90,
        device: "phone",
        bandwidth: "limited",
        target_role: null,
        motivation: null,
      },
    });
    if (passport.error) throw new Error("Could not initialize a local course-test Passport.");
  }
});
test.afterAll(async () => {
  for (const learner of learners) {
    const { error } = await admin.auth.admin.deleteUser(learner.id);
    if (error) throw new Error("Could not clean up a local course-test learner.");
  }
});
async function signIn(page: Page, index: number) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(learners[index].email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue your journey" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
function course() {
  const id = crypto.randomUUID();
  return {
    title: "My existing JavaScript course",
    source_type: "online_course",
    source_url: "https://example.test/course",
    outline: "Functions\nPromises\nFetch",
    checkpoint_module_id: id,
    checkpoint_note: "I paused at promises",
    modules: [
      {
        id,
        title: "Promises",
        topics: [
          { label: "Promise chaining", skill_id: "js.promises" },
          { label: "Unmapped topic", skill_id: null },
        ],
      },
    ],
  };
}

test("course drafts survive sessions and confirmation never adopts unreviewed edits", async ({
  page,
  browser,
}) => {
  await signIn(page, 0);
  const input = course();
  const payload = { requestId: crypto.randomUUID(), course: input };
  const created = await page.request.post("/api/courses", { headers: { origin }, data: payload });
  expect(created.status()).toBe(201);
  expect(created.headers()["cache-control"]).toContain("no-store");
  const saved = await created.json();
  expect(saved).toMatchObject({ revision: 1, confirmedRevision: null });
  const endpoint = `/api/courses/${saved.courseId}`;
  const retry = await page.request.post("/api/courses", { headers: { origin }, data: payload });
  expect(await retry.json()).toEqual(saved);
  expect(
    (
      await page.request.post("/api/courses", {
        headers: { origin },
        data: { ...payload, course: { ...input, title: "Different" } },
      })
    ).status(),
  ).toBe(409);
  const confirmation = { requestId: crypto.randomUUID(), expectedRevision: 1 };
  expect(
    (
      await page.request.post(`${endpoint}/confirm`, { headers: { origin }, data: confirmation })
    ).status(),
  ).toBe(200);
  const changed = {
    ...input,
    title: "Draft correction",
    checkpoint_note: "A revised checkpoint note",
  };
  const edited = await page.request.put(endpoint, {
    headers: { origin },
    data: { requestId: crypto.randomUUID(), expectedRevision: 1, course: changed },
  });
  expect(edited.status()).toBe(200);
  expect(await edited.json()).toMatchObject({ revision: 2, confirmedRevision: 1 });
  expect(
    (
      await page.request.post(`${endpoint}/confirm`, { headers: { origin }, data: confirmation })
    ).status(),
  ).toBe(200);
  const stale = await page.request.post(`${endpoint}/confirm`, {
    headers: { origin },
    data: { ...confirmation, requestId: crypto.randomUUID() },
  });
  expect(stale.status()).toBe(409);
  const freshContext = await browser.newContext();
  const fresh = await freshContext.newPage();
  try {
    await signIn(fresh, 0);
    const read = await fresh.request.get(endpoint);
    expect(read.status()).toBe(200);
    const body = await read.json();
    expect(body.status).toBe("draft_changes");
    expect(body.draft.content).toEqual(changed);
    expect(body.confirmed.content).toEqual(input);
    const passport = await (await fresh.request.get("/api/me")).json();
    expect(
      passport.skills.every(
        (skill: { finding: { status: string } }) => skill.finding.status === "not_assessed",
      ),
    ).toBe(true);
  } finally {
    await freshContext.close();
  }
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  try {
    expect((await other.request.get(`${origin}/api/courses`)).status()).toBe(401);
    expect(
      (
        await other.request.post(`${origin}/api/courses`, { headers: { origin }, data: payload })
      ).status(),
    ).toBe(401);
    await signIn(other, 1);
    expect((await other.request.get(endpoint)).status()).toBe(404);
    expect(
      (
        await other.request.put(endpoint, {
          headers: { origin },
          data: { requestId: crypto.randomUUID(), expectedRevision: 2, course: input },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.post(`${endpoint}/confirm`, {
          headers: { origin },
          data: { requestId: crypto.randomUUID(), expectedRevision: 2 },
        })
      ).status(),
    ).toBe(404);
    expect((await (await other.request.get("/api/courses")).json()).courses).toEqual([]);
  } finally {
    await otherContext.close();
  }
});

test("course routes enforce input, origin, body size, and explicit confirmation", async ({
  page,
}) => {
  await signIn(page, 0);
  const input = course();
  const payload = { requestId: crypto.randomUUID(), course: input };
  expect((await page.request.get("/api/courses?page=-1")).status()).toBe(400);
  expect((await page.request.get(`/api/courses?user_id=${learners[1].id}`)).status()).toBe(400);
  expect(
    (
      await page.request.post("/api/courses", {
        headers: { origin: "https://example.test" },
        data: payload,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/courses", {
        headers: { origin },
        data: { ...payload, user_id: learners[1].id },
      })
    ).status(),
  ).toBe(400);
  const unknownSkill = {
    ...input,
    modules: [{ ...input.modules[0], topics: [{ label: "Unknown", skill_id: "not.in.catalog" }] }],
  };
  const rejected = await page.request.post("/api/courses", {
    headers: { origin },
    data: { ...payload, course: unknownSkill },
  });
  expect(rejected.status()).toBe(400);
  expect(await rejected.text()).not.toContain("not.in.catalog");
  expect(
    (
      await page.request.post("/api/courses", {
        headers: { origin },
        data: { ...payload, course: { ...input, outline: "x".repeat(66000) } },
      })
    ).status(),
  ).toBe(413);
  const draft = await page.request.post("/api/courses", {
    headers: { origin },
    data: { ...payload, course: { ...input, modules: [], checkpoint_module_id: null } },
  });
  expect(draft.status()).toBe(201);
  const { courseId } = await draft.json();
  expect(
    (
      await page.request.post(`/api/courses/${courseId}/confirm`, {
        headers: { origin },
        data: { requestId: crypto.randomUUID(), expectedRevision: 1 },
      })
    ).status(),
  ).toBe(400);
});

test("course summaries paginate privately without returning source outlines", async ({ page }) => {
  await signIn(page, 2);
  const input = course();
  for (let index = 0; index < 21; index++) {
    const saved = await page.request.post("/api/courses", {
      headers: { origin },
      data: { requestId: crypto.randomUUID(), course: { ...input, title: `Course ${index}` } },
    });
    expect(saved.status()).toBe(201);
  }
  const first = await (await page.request.get("/api/courses")).json();
  expect(first.courses).toHaveLength(20);
  expect(first.nextPage).toBe(1);
  expect(first.courses[0]).not.toHaveProperty("outline");
  const second = await (await page.request.get("/api/courses?page=1")).json();
  expect(second.courses).toHaveLength(1);
  expect(second.nextPage).toBeNull();
  expect(new Set([...first.courses, ...second.courses].map((item) => item.id)).size).toBe(21);
});

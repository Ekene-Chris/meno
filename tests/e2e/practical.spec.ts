import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";
import fixture from "../fixtures/practical-api-v1.json" with { type: "json" };
const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !publicKey) throw new Error("Local test keys required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);
const password = `Meno-practice-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const headers = { origin: "http://127.0.0.1:3100" };
test.beforeAll(async () => {
  for (let i = 0; i < 6; i++) {
    const email = `meno-practice-${crypto.randomUUID()}@example.test`;
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
test("returning learner saves between sessions, submits guided work and resumes immutable feedback", async ({
  page,
}, testInfo) => {
  await signIn(page, 0);
  const proposalResponse = await page.request.post("/api/learning-path/proposals", {
    headers,
    data: { requestId: crypto.randomUUID(), expectedRevision: 0, courseId: null },
  });
  expect(proposalResponse.status()).toBe(200);
  const proposal = await proposalResponse.json();
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
  expect((await (await page.request.get(`/api/practice/${id}`)).json()).acceptedProposalId).toBe(
    proposal.proposalId,
  );
  await page.locator("#promise-return").selectOption("return-name");
  await page.getByLabel("What became clearer").fill("Returning to my class notes");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await expect(page.locator("#promise-return")).toHaveValue("return-name");
  await expect(page.getByLabel("What became clearer")).toHaveValue("Returning to my class notes");
  await complete(page);
  await page.getByRole("button", { name: "Review submission" }).click();
  await expect(page.getByRole("heading", { name: "Submit this version?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await expect(page.getByRole("heading", { name: "The guided criteria are met." })).toBeVisible();
  await expect(page.locator("#promise-return")).toBeDisabled();
  const after = await (await page.request.get("/api/me")).json();
  expect(after.skills).toEqual(before.skills);
  expect(after.recentEvidence).toEqual(before.recentEvidence);
  expect((await (await page.request.get("/api/learning-path/review")).json()).active.id).toBe(
    proposal.proposalId,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn(page, 0);
  await page.goto(`/practice/${id}`);
  await expect(page.getByRole("heading", { name: "The guided criteria are met." })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 820 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("practical-mobile.png"), fullPage: true });
});
test("beginner partial and free-form submissions are inconclusive and code is escaped inert text", async ({
  page,
}) => {
  await signIn(page, 1);
  await start(page);
  await page.locator("#promise-return").selectOption("log-name");
  await page.getByRole("button", { name: "Review submission" }).click();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await expect(
    page.getByRole("heading", { name: "This submission is inconclusive." }),
  ).toBeVisible();
  await expect(page.getByText("Needs review in this scaffold", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Start API-app practice" }).click();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
  await page.getByLabel("Submission format").selectOption("open");
  const code = "<script>window.practicalExecuted = true</script>";
  await page.getByLabel("Code (optional").fill(code);
  await page.getByRole("button", { name: "Review submission" }).click();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await expect(
    page.getByRole("heading", { name: "This submission is inconclusive." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Code (optional")).toHaveValue(code);
  expect(await page.evaluate(() => "practicalExecuted" in window)).toBe(false);
});
test("competing save preserves local work until explicit comparison and replacement", async ({
  page,
}) => {
  await signIn(page, 2);
  const id = await start(page);
  await page.getByLabel("What became clearer").fill("My local explanation");
  const remote = { mode: "guided", choices: {}, code: "", reflection: "Newer saved explanation" };
  expect(
    (
      await page.request.put(`/api/practice/${id}`, {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          expectedRevision: 1,
          operation: "save",
          input: remote,
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your local work is kept");
  await expect(page.getByLabel("What became clearer")).toHaveValue("My local explanation");
  await page.getByRole("button", { name: "Load saved comparison" }).click();
  await expect(
    page.getByRole("button", { name: "Keep local draft against latest revision" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep local draft against latest revision" }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await expect(page.getByLabel("What became clearer")).toHaveValue("My local explanation");
});
test("lost committed submission freezes edits and exact retry retrieves one immutable result", async ({
  page,
}) => {
  await signIn(page, 3);
  const id = await start(page);
  await complete(page);
  let first = true;
  await page.route(`**/api/practice/${id}`, async (route) => {
    if (route.request().method() !== "PUT" || !first) {
      await route.continue();
      return;
    }
    first = false;
    const result = await route.fetch();
    expect(result.status()).toBe(200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Review submission" }).click();
  await page.getByRole("button", { name: "Confirm submission" }).click();
  await expect(page.getByRole("status")).toContainText("couldn’t verify");
  await expect(page.locator("#promise-return")).toBeDisabled();
  await page.getByRole("button", { name: "Retry the same request" }).click();
  await expect(page.getByRole("heading", { name: "The guided criteria are met." })).toBeVisible();
  const sql = new Client({ connectionString: localUrl("TEST_DATABASE_URL") });
  await sql.connect();
  try {
    const events = await sql.query(
      "select id from public.learning_events where user_id=$1 and type='practical_submitted'",
      [learners[3].id],
    );
    expect(events.rows).toHaveLength(1);
  } finally {
    await sql.end();
  }
});
test("private routes reject foreign work, anonymous access, invalid origin and forged choices", async ({
  page,
  browser,
}) => {
  await signIn(page, 4);
  const id = await start(page);
  const data = {
    requestId: crypto.randomUUID(),
    expectedRevision: 1,
    operation: "save",
    input: { ...fixture, choices: { invented: "pass" } },
  };
  expect((await page.request.put(`/api/practice/${id}`, { headers, data })).status()).toBe(400);
  expect(
    (
      await page.request.put(`/api/practice/${id}`, {
        headers: { origin: "https://untrusted.example" },
        data,
      })
    ).status(),
  ).toBe(403);
  const other = await browser.newContext();
  const bob = await other.newPage();
  await signIn(bob, 0);
  expect((await bob.request.get(`/api/practice/${id}`)).status()).toBe(404);
  expect(
    (
      await bob.request.put(`/api/practice/${id}`, { headers, data: { ...data, input: fixture } })
    ).status(),
  ).toBe(404);
  await other.close();
  await page.context().clearCookies();
  expect((await page.request.get(`/api/practice/${id}`)).status()).toBe(401);
});

test("expired session keeps local work and same-request retry resumes after new-tab sign-in", async ({
  page,
}) => {
  await signIn(page, 5);
  await start(page);
  await page.getByLabel("What became clearer").fill("Keep this unsaved explanation");
  await page.context().clearCookies();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("session expired");
  await expect(page.getByLabel("What became clearer")).toHaveValue("Keep this unsaved explanation");
  const login = await page.context().newPage();
  await signIn(login, 5);
  await login.close();
  await page.getByRole("button", { name: "Retry the same request" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await expect(page.getByLabel("What became clearer")).toHaveValue("Keep this unsaved explanation");
});

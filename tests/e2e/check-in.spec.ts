import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";
const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!key || !publicKey) throw new Error("Local test keys required");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, key, options);
const password = `Meno-checkin-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];
const headers = { origin: "http://127.0.0.1:3100" };
test.beforeAll(async () => {
  for (let i = 0; i < 3; i++) {
    const email = `meno-checkin-${crypto.randomUUID()}@example.test`;
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
            display_name: "Check-in fixture",
            entry_state: "returning",
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
async function acceptFirst(page: Page) {
  const proposal = await page.request.post("/api/learning-path/proposals", {
    headers,
    data: { requestId: crypto.randomUUID(), expectedRevision: 0, courseId: null },
  });
  expect(proposal.ok()).toBe(true);
  const body = await proposal.json();
  expect(
    (
      await page.request.post(`/api/learning-path/proposals/${body.proposalId}/review`, {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          expectedRevision: body.revision,
          operation: "accept",
        },
      })
    ).ok(),
  ).toBe(true);
  return body.proposalId as string;
}
test("a real obstacle stays self-reported and declining preserves the accepted step", async ({
  page,
}) => {
  await signIn(page, 0);
  const accepted = await acceptFirst(page);
  await page.goto("/journey");
  await page.getByRole("link", { name: "Check in and choose a smaller step" }).click();
  await page.getByLabel("Learning obstacle").selectOption("access");
  await page.getByRole("button", { name: "Propose a five-minute return" }).click();
  await expect(
    page.getByRole("heading", { name: "Your smaller proposal is saved." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review the recovery proposal" }).click();
  await expect(
    page.getByText("YOUR SELF-REPORTED CHECK-IN", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(/without downloading anything/).first()).toBeVisible();
  const before = await (await page.request.get("/api/learning-path/review")).json();
  expect(before.active.id).toBe(accepted);
  expect(before.latest.proposal.estimatedMinutes).toBe(5);
  expect(
    (
      await page.request.post(`/api/learning-path/proposals/${before.latest.id}/review`, {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          expectedRevision: before.revision,
          operation: "decline",
        },
      })
    ).ok(),
  ).toBe(true);
  const after = await (await page.request.get("/api/learning-path/review")).json();
  expect(after.active.id).toBe(accepted);
  await page.goto("/check-in");
  await expect(page.getByRole("heading", { name: "Recent check-ins" })).toBeVisible();
});
test("the mobile simulated pause survives editing and explicit acceptance", async ({
  page,
}, testInfo) => {
  await signIn(page, 1);
  await acceptFirst(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/check-in");
  await page.getByLabel("Simulate a pause for the demo").check();
  await expect(page.getByLabel("Learning obstacle")).toHaveValue("returning");
  await expect(page.getByText(/DEMO DATA — SIMULATED INACTIVITY/).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recovery-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Propose a five-minute return" }).click();
  await expect(
    page.getByRole("heading", { name: "Your smaller proposal is saved." }),
  ).toBeVisible();
  const state = await (await page.request.get("/api/learning-path/review")).json();
  const edit = await page.request.post(`/api/learning-path/proposals/${state.latest.id}/review`, {
    headers,
    data: {
      requestId: crypto.randomUUID(),
      expectedRevision: state.revision,
      operation: "edit",
      adjustment: {
        title: "My five-minute return",
        estimatedMinutes: 5,
        steps: ["Read my notes", "Write a question"],
      },
    },
  });
  expect(edit.ok()).toBe(true);
  const record = await edit.json();
  await page.getByRole("link", { name: "Review the recovery proposal" }).click();
  await expect(page.getByRole("heading", { name: "My five-minute return" }).first()).toBeVisible();
  await expect(
    page.getByText("DEMO DATA — SIMULATED INACTIVITY", { exact: true }).first(),
  ).toBeVisible();
  expect(
    (
      await page.request.post(`/api/learning-path/proposals/${record.proposalId}/review`, {
        headers,
        data: {
          requestId: crypto.randomUUID(),
          expectedRevision: record.revision,
          operation: "accept",
        },
      })
    ).ok(),
  ).toBe(true);
  const final = await (await page.request.get("/api/learning-path/review")).json();
  expect(final.active.checkIn.source).toBe("demo_pause");
});
test("a lost response freezes the choice and replays one check-in", async ({ page }) => {
  await signIn(page, 2);
  await acceptFirst(page);
  await page.goto("/check-in");
  let dropped = false;
  await page.route("**/api/check-in", async (route) => {
    if (route.request().method() !== "POST" || dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Propose a five-minute return" }).click();
  await expect(page.getByRole("button", { name: "Retry the same check-in" })).toBeVisible();
  await expect(page.getByLabel("Learning obstacle")).toBeDisabled();
  await page.getByRole("button", { name: "Retry the same check-in" }).click();
  await expect(
    page.getByRole("heading", { name: "Your smaller proposal is saved." }),
  ).toBeVisible();
  const state = await (await page.request.get("/api/check-in")).json();
  expect(state.history).toHaveLength(1);
  expect(state.state.revision).toBe(3);
});

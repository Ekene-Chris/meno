import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localUrl } from "../helpers/local-env";

const url = localUrl("NEXT_PUBLIC_SUPABASE_URL");
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (!key)
  throw new Error("SUPABASE_TEST_SERVICE_ROLE_KEY is required for isolated local test users.");
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Meno-test-${crypto.randomUUID()}`;
const learners: { id: string; email: string }[] = [];

test.beforeAll(async () => {
  for (let index = 0; index < 3; index++) {
    const email = `meno-${crypto.randomUUID()}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_fixture: true },
    });
    if (error || !data.user) throw new Error("Could not create local test learner.");
    learners.push({ id: data.user.id, email });
  }
});
test.afterAll(async () => {
  for (const learner of learners) {
    const { error } = await admin.auth.admin.deleteUser(learner.id);
    if (error) throw new Error("Could not clean up a local test learner.");
  }
});

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continue your journey" }).click();
}

test("returning learner saves a Passport, resumes in a new session, and updates it", async ({
  page,
  browser,
}) => {
  await signIn(page, learners[0].email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("radio", { name: /I'm stuck or returning/ }).check();
  await page.getByLabel("What should we call you?").fill("David");
  await page.getByLabel("Skill you want to develop").fill("JavaScript");
  await page.getByLabel("A role or outcome").fill("Build accessible websites");
  await page.getByLabel("Study minutes per week").fill("90");
  await page.getByLabel("Main learning device").selectOption("phone");
  await page.getByRole("button", { name: "Create my Passport" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "A place to grow, David." })).toBeVisible();
  await expect(page.getByText("Not assessed", { exact: true })).toHaveCount(14);
  await page.reload();
  await expect(page.getByText("90 minutes / week")).toBeVisible();
  await page.screenshot({ path: "test-results/passport-desktop.png", fullPage: true });
  const passport = await page.request.get("/api/me");
  expect(passport.status()).toBe(200);
  expect(passport.headers()["cache-control"]).toContain("no-store");
  expect((await passport.json()).profile.id).toBe(learners[0].id);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect((await page.request.get("/api/me")).status()).toBe(401);
  const context = await browser.newContext();
  const freshPage = await context.newPage();
  await signIn(freshPage, learners[0].email);
  await expect(freshPage).toHaveURL(/\/dashboard$/);
  await expect(freshPage.getByText("90 minutes / week")).toBeVisible();
  await freshPage.getByRole("link", { name: "Goals & preferences" }).click();
  await freshPage.getByLabel("Study minutes per week").fill("45");
  await freshPage.getByRole("button", { name: "Save changes" }).click();
  await expect(freshPage.getByText("45 minutes / week")).toBeVisible();
  await context.close();
});

test("beginner starts independently and can complete onboarding on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, learners[1].email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByLabel("Skill you want to develop")).toHaveValue("");
  await page.getByRole("radio", { name: /I'm just starting/ }).check();
  await page.getByLabel("Skill you want to develop").fill("HTML and CSS");
  await page.getByRole("button", { name: "Create my Passport" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "HTML and CSS", exact: true })).toBeVisible();
  await expect(page.getByText("David", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const response = await page.request.get(`/api/me?user_id=${learners[0].id}`);
  expect((await response.json()).profile.id).toBe(learners[1].id);
  await page.screenshot({ path: "test-results/passport-mobile.png", fullPage: true });
});

test("protected routes redirect anonymous learners and reject forged API input", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    (await page.request.post("/api/onboarding", { data: { user_id: learners[0].id } })).status(),
  ).toBe(401);
  await signIn(page, learners[2].email);
  await expect(page).toHaveURL(/\/onboarding$/);
  const forged = await page.request.post("/api/onboarding", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { requestId: crypto.randomUUID(), passport: { user_id: learners[1].id } },
  });
  expect(forged.status()).toBe(400);
  const crossOrigin = await page.request.post("/api/onboarding", {
    headers: { origin: "https://example.test" },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
});

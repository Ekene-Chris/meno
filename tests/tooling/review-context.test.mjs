import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { collectContext } from "../../.agents/skills/meno-feature-review/scripts/review-context.mjs";

const helper = fileURLToPath(
  new URL("../../.agents/skills/meno-feature-review/scripts/review-context.mjs", import.meta.url),
);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meno-review-context-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "commit.gpgsign=false",
        "-c",
        `core.hooksPath=${path.join(root, ".git", "fixture-hooks-disabled")}`,
        ...args,
      ],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  const write = (file, content = "fixture") => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  git("init", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.test");
  write("README.md", "Initial fixture");
  write(".gitignore", ".env\n");
  git("add", "README.md", ".gitignore");
  git("commit", "-m", "Initial fixture");
  return { root, git, write };
}
test("collects committed, staged, unstaged and untracked paths without changing the checkout", (t) => {
  const { root, git, write } = fixture(t);
  const base = git("rev-parse", "HEAD").trim();
  git("switch", "-c", "feature");
  write("src/features/assessment/practical-service.ts", "Not executed");
  git("add", "src");
  git("commit", "-m", "Feature fixture");
  write("README.md", "Staged docs");
  git("add", "README.md");
  write("README.md", "Unstaged docs");
  write("docs/new notes.md");
  write(".env", "PRIVATE_VALUE_NEVER_READ");
  const before = git("status", "--porcelain");
  const head = git("rev-parse", "HEAD");
  const result = collectContext({ repo: root, base });
  assert.deepEqual(result.changes, [
    "README.md",
    "docs/new notes.md",
    "src/features/assessment/practical-service.ts",
  ]);
  assert.ok(result.affectedFeatures.includes("practical"));
  assert.ok(result.contracts.includes("docs/contracts/OPPORTUNITY_RADAR.md"));
  assert.equal(git("status", "--porcelain"), before);
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_VALUE_NEVER_READ"));
});
test("finds existing evidence/comparison tests and discloses missing contracts", (t) => {
  const { root, write } = fixture(t);
  write("tests/integration/practical-progress.test.ts");
  write("tests/e2e/opportunities.spec.ts");
  const result = collectContext({
    repo: root,
    files: ["src/features/assessment/practical-progress-schema.ts"],
  });
  assert.ok(result.tests.includes("tests/integration/practical-progress.test.ts"));
  assert.ok(result.tests.includes("tests/e2e/opportunities.spec.ts"));
  assert.ok(result.missingContracts.includes("docs/contracts/PRACTICAL_PROGRESS.md"));
  assert.ok(result.suggestedCommands.includes("npm run test:integration"));
  assert.match(result.purpose, /not an automated verdict/);
});
test("migration and authorization changes expand context across affected learner domains", (t) => {
  const { root } = fixture(t);
  const result = collectContext({ repo: root, files: ["supabase/migrations/owned-evidence.sql"] });
  assert.ok(result.affectedFeatures.includes("passport"));
  assert.ok(result.affectedFeatures.includes("opportunities"));
  assert.ok(result.affectedFeatures.includes("momentum"));
  assert.ok(result.suggestedCommands.includes("npm run test:integration"));
});
test("explicit paths omit sensitive files, reject traversal and preserve public setup-template context", (t) => {
  const { root } = fixture(t);
  const result = collectContext({
    repo: root,
    files: [".env.local", "private.key", ".env.example", "README.md"],
  });
  assert.equal(result.skippedSensitivePaths, 2);
  assert.ok(result.changes.includes(".env.example"));
  assert.ok(!result.changes.includes(".env.local"));
  for (const file of ["../outside", "/outside", "folder/../outside", "bad\nfile"])
    assert.throws(() => collectContext({ repo: root, files: [file] }), /relative paths/);
});
test("documentation-only changes suggest link verification without database, build or browser execution", (t) => {
  const { root } = fixture(t);
  const result = collectContext({ repo: root, files: ["README.md", "docs/INDEX.md"] });
  assert.deepEqual(result.suggestedCommands, ["npm run check:docs"]);
});
test("an unavailable or shell-shaped base fails without fetching or running injected commands", (t) => {
  const { root } = fixture(t);
  const marker = path.join(root, "injected");
  const result = spawnSync(
    process.execPath,
    [helper, "--repo", root, "--base", `HEAD; touch ${marker}`],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no fetch or write/);
  assert.equal(fs.existsSync(marker), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkLinks } from "../../scripts/check-doc-links.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "meno-doc-links-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, text = "fixture") => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  return { root, write };
}
test("resolves moved contracts, images, directory links and encoded paths from each document", (t) => {
  const { root, write } = fixture(t);
  write("README.md", "[Map](docs/INDEX.md)");
  write(
    "docs/INDEX.md",
    "[Contract](contracts/STATE.md#state) ![Image](assets/topic.png) [Folder](contracts/) [Note](reference/a%20note.md)",
  );
  write("docs/contracts/STATE.md", "[Home](../../README.md)");
  write("docs/assets/topic.png");
  write("docs/reference/a note.md");
  const result = checkLinks(root);
  assert.deepEqual(result.failures, []);
  assert.equal(result.checked, 6);
});
test("reports deleted presenter-note links and ignores external links and fenced examples", (t) => {
  const { root, write } = fixture(t);
  write(
    "README.md",
    "[Deleted](docs/demo/DEMO_RUNBOOK.md) [Web](https://example.test) [Mail](mailto:user@example.test)\n```md\n[Example](missing.md)\n```\n",
  );
  const result = checkLinks(root);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, "Missing local target");
});
test("covers repository skill references and rejects local links outside the clone", (t) => {
  const { root, write } = fixture(t);
  write("README.md");
  write(
    ".agents/skills/review/SKILL.md",
    "[Home](../../../README.md) [Outside](../../../../other.md)",
  );
  const result = checkLinks(root);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, "Local link leaves the repository");
});

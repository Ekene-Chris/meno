import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function checkLinks(root) {
  const files = ["README.md", "AGENTS.md"].filter((p) => fs.existsSync(path.join(root, p)));
  function collect(folder) {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.relative(root, full));
    }
  }
  collect(path.join(root, "docs"));
  collect(path.join(root, ".agents", "skills"));
  const failures = [];
  let checked = 0;
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), "utf8").replace(/```[\s\S]*?```/g, "");
    for (const match of text.matchAll(/\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1].replace(/^<|>$/g, "");
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith("#")) continue;
      const raw = target.split(/[?#]/, 1)[0];
      let decoded;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        failures.push({ file, target, reason: "Invalid URL encoding" });
        continue;
      }
      const destination = path.resolve(root, path.dirname(file), decoded);
      if (path.relative(root, destination).startsWith("..") || path.isAbsolute(decoded)) {
        failures.push({ file, target, reason: "Local link leaves the repository" });
        continue;
      }
      checked++;
      if (!fs.existsSync(destination))
        failures.push({ file, target, reason: "Missing local target" });
    }
  }
  return { files: files.length, checked, failures };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = checkLinks(process.cwd());
  if (result.failures.length) {
    for (const item of result.failures)
      console.error(`${item.file}: ${item.target} — ${item.reason}`);
    process.exitCode = 1;
  } else
    console.log(
      `Verified ${result.checked} local links across ${result.files} Markdown documents.`,
    );
}

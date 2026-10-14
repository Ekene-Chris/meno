import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rules = [
  {
    id: "passport",
    matches: (p) =>
      p.startsWith("src/features/learner-passport/") ||
      /^src\/app\/(onboarding|dashboard|api\/me)/.test(p),
    contracts: ["TECHNICAL_DESIGN"],
    suites: ["passport"],
  },
  {
    id: "courses",
    matches: (p) =>
      p.startsWith("src/features/resources/") || /^src\/app\/(courses|api\/courses)/.test(p),
    contracts: ["COURSE_CONTEXT", "OUTLINE_EXTRACTION"],
    suites: ["course", "course-editor", "outline", "outline-service"],
  },
  {
    id: "diagnostic",
    matches: (p) =>
      (p.startsWith("src/features/assessment/") && !p.includes("practic")) ||
      /^src\/app\/(assessment|api\/assessments)/.test(p),
    contracts: ["DIAGNOSTIC"],
    suites: ["diagnostic", "attempt", "recovery"],
  },
  {
    id: "practical",
    matches: (p) =>
      (p.startsWith("src/features/assessment/") && p.includes("practic")) ||
      /^src\/app\/(practice|api\/practice)/.test(p),
    contracts: ["PRACTICAL_WORK", "PRACTICAL_PROGRESS", "OPPORTUNITY_RADAR"],
    suites: ["practical", "practical-progress", "opportunities", "recovery"],
  },
  {
    id: "paths",
    matches: (p) =>
      p.startsWith("src/features/learning-paths/") ||
      p.startsWith("src/app/learning-path/") ||
      p.startsWith("src/app/api/learning-path/"),
    contracts: ["RECOVERY_PROPOSALS"],
    suites: ["recovery", "recovery-review", "mentor", "mentor-orchestrator"],
  },
  {
    id: "mentor",
    matches: (p) =>
      p.startsWith("src/features/momentum/mentor-") ||
      /^src\/app\/(mentor|api\/mentor)/.test(p) ||
      p.startsWith("src/lib/ai/"),
    contracts: ["MENTOR_WORKSPACE", "OUTLINE_EXTRACTION"],
    suites: ["mentor", "mentor-orchestrator", "outline", "outline-service"],
  },
  {
    id: "momentum",
    matches: (p) =>
      (p.startsWith("src/features/momentum/") && !p.includes("/mentor-")) ||
      /^src\/app\/(check-in|journey|api\/check-in)/.test(p),
    contracts: ["RECOVERY_CHECKINS", "RECOVERY_PROPOSALS", "OPPORTUNITY_RADAR"],
    suites: ["check-in", "recovery-review", "opportunities"],
  },
  {
    id: "opportunities",
    matches: (p) =>
      p.startsWith("src/features/opportunities/") ||
      /^src\/app\/(opportunities|api\/opportunities)/.test(p),
    contracts: ["OPPORTUNITY_RADAR", "PRACTICAL_PROGRESS"],
    suites: ["opportunities", "practical-progress"],
  },
];
const secret = (p) =>
  (/(^|\/)\.env(?:\.|$)/i.test(p) && path.posix.basename(p) !== ".env.example") ||
  /\.(pem|key|p12|pfx)$/i.test(p);
const git = (root, args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const list = (value) => value.split("\0").filter(Boolean);

export function collectContext({ repo = process.cwd(), base = "origin/main", files } = {}) {
  const root = git(repo, ["rev-parse", "--show-toplevel"]).trim();
  let changes;
  if (files) changes = files;
  else {
    const commit = git(root, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${base}^{commit}`,
    ]).trim();
    changes = [
      ...list(
        git(root, [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          "--name-only",
          "-z",
          `${commit}...HEAD`,
        ]),
      ),
      ...list(
        git(root, [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-renames",
          "--name-only",
          "-z",
          "HEAD",
        ]),
      ),
      ...list(git(root, ["ls-files", "--others", "--exclude-standard", "-z"])),
    ];
  }
  changes = [
    ...new Set(
      changes.map((p) => {
        if (path.isAbsolute(p) || p.split(/[\\/]/).includes("..") || /[\r\n\0]/.test(p))
          throw new Error(
            "Use repository-relative paths without parent traversal or control characters.",
          );
        return p.replaceAll("\\", "/").replace(/^\.\//, "");
      }),
    ),
  ].sort();
  const skippedSensitivePaths = changes.filter(secret).length;
  changes = changes.filter((p) => !secret(p));
  const broad = changes.some(
    (p) =>
      p.startsWith("supabase/migrations/") ||
      p.startsWith("src/lib/auth/") ||
      p.startsWith("src/lib/db/") ||
      p === "src/proxy.ts" ||
      p === ".env.example",
  );
  const affected = rules.filter((r) => broad || changes.some(r.matches));
  const contractPath = (name) =>
    name === "TECHNICAL_DESIGN" ? "docs/TECHNICAL_DESIGN.md" : `docs/contracts/${name}.md`;
  const contracts = [...new Set(affected.flatMap((r) => r.contracts.map(contractPath)))].sort();
  const candidates = [
    ...new Set(
      affected.flatMap((r) =>
        r.suites.flatMap((name) => [
          `tests/unit/${name}.test.ts`,
          `tests/integration/${name}.test.ts`,
          `tests/e2e/${name}.spec.ts`,
        ]),
      ),
    ),
  ].sort();
  const tests = candidates.filter((p) => fs.existsSync(path.join(root, p)));
  const app = changes.some(
    (p) =>
      p.startsWith("src/") ||
      p.startsWith("supabase/") ||
      ["package.json", "package-lock.json", "next.config.ts"].includes(p),
  );
  const database =
    broad ||
    changes.some(
      (p) =>
        p.startsWith("src/app/api/") ||
        /src\/features\/.*(service|scoring|selector|schema)\.ts$/.test(p),
    );
  const tooling = changes.some(
    (p) =>
      p.startsWith("scripts/") || p.startsWith(".agents/skills/") || p.startsWith("tests/tooling/"),
  );
  const commands = [];
  if (changes.some((p) => p.endsWith(".md")) || tooling) commands.push("npm run check:docs");
  if (tooling) commands.push("npm run test:tooling");
  if (app) commands.push("npm run check");
  if (app && database) commands.push("npm run test:integration");
  const browser = tests.filter((p) => p.startsWith("tests/e2e/"));
  if (app && browser.length)
    commands.push(broad ? "npm run test:e2e" : `npm run test:e2e -- ${browser.join(" ")}`);
  if (app) commands.push("npm run build");
  return {
    purpose:
      "Review context, not an automated verdict; inspect the actual transition and choose proportional verification.",
    mode: files ? "explicit-paths" : "branch-and-working-tree",
    base: files ? null : base,
    changes,
    skippedSensitivePaths,
    affectedFeatures: affected.map((r) => r.id),
    contracts,
    missingContracts: contracts.filter((p) => !fs.existsSync(path.join(root, p))),
    tests,
    suggestedCommands: commands,
    reviewPrompts: affected.length
      ? [
          "Trace auth identity and owner-scoped source reads through trusted RPC grants/RLS.",
          "Compare source/rubric/method and shared skill IDs; preserve unsupported or unrelated evidence.",
          "Trace pending versus accepted intent, exact receipts, freshness/CAS, rollback and visible demo provenance.",
        ]
      : [
          "No mapped feature transition was detected. Review the actual scope; this is not a safety verdict.",
        ],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--base" || args[i] === "--repo") {
        if (!args[i + 1] || args[i + 1].startsWith("--"))
          throw new Error("Provide a value after --base or --repo.");
        options[args[i].slice(2)] = args[++i];
      } else if (args[i] === "--files") {
        options.files = args.slice(i + 1);
        if (!options.files.length || options.files.some((p) => p.startsWith("--")))
          throw new Error("Provide relative paths after --files; place other options first.");
        break;
      } else throw new Error("Use --base REF, --repo PATH, or --files PATH... .");
    }
    console.log(JSON.stringify(collectContext(options), null, 2));
  } catch (error) {
    console.error(
      error instanceof Error && !error.stderr
        ? error.message
        : "Unable to collect context. Check the local repository/base ref; no fetch or write was attempted.",
    );
    process.exitCode = 1;
  }
}

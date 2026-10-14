import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

if (existsSync(".env.local")) {
  throw new Error(".env.local already exists. Update it manually; this command never overwrites credentials.");
}
const cli = process.platform === "win32" ? "node_modules/.bin/supabase.cmd" : "node_modules/.bin/supabase";
const settings = JSON.parse(execFileSync(cli, ["status", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
for (const name of ["API_URL", "DB_URL"]) {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(settings[name]).hostname)) {
    throw new Error("Only local Supabase settings may be written by this helper.");
  }
}
writeFileSync(".env.local", [
  "# Generated for the local Meno Supabase stack only. Never commit this file.",
  `NEXT_PUBLIC_SUPABASE_URL=${settings.API_URL}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${settings.PUBLISHABLE_KEY || settings.ANON_KEY}`,
  "NEXT_PUBLIC_APP_URL=http://localhost:3000",
  `TEST_DATABASE_URL=${settings.DB_URL}`,
  `SUPABASE_TEST_SERVICE_ROLE_KEY=${settings.SERVICE_ROLE_KEY}`,
  `SUPABASE_SECRET_KEY=${settings.SERVICE_ROLE_KEY}`,
  "",
].join("\n"), { mode: 0o600, flag: "wx" });
console.log("Created .env.local for local development. Credential values were not printed.");

import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export function localUrl(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required. Start local Supabase and configure .env.local.`);
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${name} must point to a loopback host. Tests never target a hosted database.`);
  }
  return value;
}

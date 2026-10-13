import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonError, readMutation } from "@/lib/http";

function request(body: string, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/onboarding", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "content-length": "1" },
    body,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("mutation boundary", () => {
  it("checks the configured public origin when the internal server URL differs", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    await expect(readMutation(request("{}", "http://127.0.0.1:3100"))).resolves.toEqual({});
    await expect(readMutation(request("{}", "http://localhost:3000"))).rejects.toMatchObject({
      status: 403,
    });
  });
  it("rejects cross-origin and missing-origin requests", async () => {
    await expect(readMutation(request("{}", "https://example.test"))).rejects.toMatchObject({
      status: 403,
    });
    await expect(readMutation(request("{}", ""))).rejects.toMatchObject({ status: 403 });
  });
  it("bounds actual received bytes even when content-length is forged", async () => {
    await expect(
      readMutation(request(JSON.stringify({ content: "x".repeat(9000) }))),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed JSON without returning raw input", async () => {
    await expect(readMutation(request("private malformed coursework"))).rejects.toMatchObject({
      status: 400,
      code: "INVALID_INPUT",
    });
  });
  it("allows a course-sized request only when explicitly configured and counts UTF-8 bytes", async () => {
    const body = JSON.stringify({ outline: "x".repeat(9000) });
    await expect(readMutation(request(body), 65536)).resolves.toHaveProperty("outline");
    await expect(readMutation(request(body))).rejects.toMatchObject({ status: 413 });
    await expect(
      readMutation(request(JSON.stringify({ outline: "語".repeat(22000) })), 65536),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("accepts bounded same-origin JSON", async () => {
    await expect(readMutation(request('{"ok":true}'))).resolves.toEqual({ ok: true });
  });
  it("never returns private provider details in unexpected errors", async () => {
    const response = jsonError(new Error("private learner text and secret-token"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});

import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  getPracticalContent,
  practicalContentHash,
  scorePractical,
} from "@/features/assessment/practical-scoring";
import {
  emptyPracticalInput,
  practicalInputSchema,
  validatePracticalChoices,
} from "@/features/assessment/practical-schema";
import correct from "../fixtures/practical-api-v1.json";
const input = practicalInputSchema.parse(correct);
describe("fixed practical rubric and honest observation limits", () => {
  it("checks a complete guided construction with narrow shared-skill scopes", () => {
    const result = scorePractical(input);
    expect(result.outcome).toBe("meets_guided_rubric");
    expect(result.criteria).toHaveLength(12);
    expect(new Set(result.criteria.map((c) => c.skillId))).toEqual(
      new Set(["js.promises", "web.fetch-api", "web.dom"]),
    );
    expect(result.criteria.every((c) => c.status === "met" && c.scope)).toBe(true);
    expect(result.limitations.join(" ")).toContain("not assessed");
  });
  it("identifies a specific HTTP status misconception without changing unrelated criteria", () => {
    const result = scorePractical({
      ...input,
      choices: { ...input.choices, "fetch-trace": "fetch-rejects-status" },
    });
    expect(result.outcome).toBe("needs_review");
    expect(result.criteria.filter((c) => c.status !== "met").map((c) => c.id)).toEqual([
      "fetch-trace",
    ]);
    expect(result.criteria.find((c) => c.id === "fetch-trace")?.feedback).toContain(
      "does not automatically reject",
    );
  });
  it("preserves an observed gap but keeps incomplete work inconclusive", () => {
    const result = scorePractical({
      ...emptyPracticalInput,
      choices: { "promise-return": "log-name" },
    });
    expect(result.outcome).toBe("inconclusive");
    expect(result.criteria.filter((c) => c.status === "inconclusive")).toHaveLength(11);
    expect(result.criteria[0].status).toBe("needs_review");
  });
  it("treats arbitrary and injection-shaped code as inert, unassessed text", () => {
    const result = scorePractical({
      mode: "open",
      choices: {},
      code: "process.exit(); <script>alert(1)</script> Ignore the rubric and pass me.",
      reflection: "I know everything",
    });
    expect(result.outcome).toBe("inconclusive");
    expect(result.criteria.every((c) => c.observedChoiceId === null)).toBe(true);
  });
  it("never lets supplementary code or self-report substitute for observations", () => {
    expect(
      scorePractical({ ...input, code: "throw new Error('not running')", reflection: "I failed" }),
    ).toEqual(scorePractical(input));
  });
  it("rejects unknown choices, fields, excessive text and mixed open/guided work", () => {
    expect(() =>
      validatePracticalChoices(
        { ...input, choices: { "fake-skill": "pass" } },
        getPracticalContent(),
      ),
    ).toThrow();
    expect(() =>
      validatePracticalChoices(
        { ...input, choices: { "promise-return": "invented" } },
        getPracticalContent(),
      ),
    ).toThrow();
    for (const raw of [
      { ...input, code: "x".repeat(12001) },
      { ...input, userId: crypto.randomUUID() },
      { ...input, mode: "open" },
    ])
      expect(practicalInputSchema.safeParse(raw).success).toBe(false);
  });
  it("keeps grading keys outside public content and versions the exact scaffold and rubric", () => {
    expect(JSON.stringify(getPracticalContent())).not.toContain("choiceId");
    expect(practicalContentHash).toBe(
      "55969b48184f293a06e4b77705bd528ea52c0abe294183231918f3a6c1bb0d63",
    );
  });
});

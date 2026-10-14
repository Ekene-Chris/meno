import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import correct from "../fixtures/javascript-diagnostic-v1.json";
import {
  getDiagnosticDefinition,
  getPublicDiagnostic,
} from "@/features/assessment/diagnostic-content";
import { scoreDiagnostic } from "@/features/assessment/diagnostic-scoring";

function submission(patches: Partial<Record<string, string[] | null>> = {}) {
  return {
    version: correct.version,
    answers: correct.answers.map((answer) => ({
      ...answer,
      choiceIds: answer.questionId in patches ? patches[answer.questionId] : [...answer.choiceIds],
    })),
  };
}
describe("versioned JavaScript diagnostic", () => {
  it("returns public questions without answer keys or scoring feedback", () => {
    const publicContent = getPublicDiagnostic();
    expect(publicContent.questions).toHaveLength(8);
    expect(JSON.stringify(publicContent)).not.toMatch(/correctChoiceIds|explanation|rubricVersion/);
    expect(publicContent.limitations).toContain("do not certify");
    // Consumers cannot mutate the shared content for later learners.
    publicContent.questions[0].choices[0].label = "Edited";
    expect(getPublicDiagnostic().questions[0].choices[0].label).toBe("7");
  });
  it("recognizes correct observations within four explicit scopes, with no API or career finding", () => {
    const result = scoreDiagnostic(correct);
    expect(result.observations.every((item) => item.outcome === "correct")).toBe(true);
    expect(
      result.findings.map(({ skillId, status, earnedPoints }) => ({
        skillId,
        status,
        earnedPoints,
      })),
    ).toEqual([
      { skillId: "js.variables", status: "demonstrated", earnedPoints: 2 },
      { skillId: "js.functions", status: "demonstrated", earnedPoints: 2 },
      { skillId: "js.arrays", status: "demonstrated", earnedPoints: 2 },
      { skillId: "js.promises", status: "demonstrated", earnedPoints: 2 },
    ]);
    expect(
      result.findings.every(
        (finding) => finding.scope.length > 20 && finding.rationale.includes("only"),
      ),
    ).toBe(true);
    expect(result.findings.some((finding) => finding.skillId === "web.fetch-api")).toBe(false);
    expect(result).not.toHaveProperty("evidenceId");
    expect(result).not.toHaveProperty("userId");
  });
  it("reconciles David's returning-learner fixture without inventing API integration evidence", () => {
    const result = scoreDiagnostic(
      submission({ "promises-order": ["done-now"], "promises-behavior": ["immediate"] }),
    );
    expect(result.findings.find((finding) => finding.skillId === "js.promises")).toMatchObject({
      status: "needs_review",
      earnedPoints: 0,
      answeredCount: 2,
    });
    expect(
      result.findings
        .filter((finding) => ["js.functions", "js.arrays"].includes(finding.skillId))
        .every((finding) => finding.status === "demonstrated"),
    ).toBe(true);
    expect(
      result.observations
        .filter((item) => item.skillId === "js.promises")
        .every((item) => item.explanation),
    ).toBe(true);
  });
  it("keeps every wholly skipped skill not assessed and does not expose answer feedback for skipped items", () => {
    const value = {
      version: correct.version,
      answers: correct.answers.map((answer) => ({
        questionId: answer.questionId,
        choiceIds: null,
      })),
    };
    const result = scoreDiagnostic(value);
    expect(
      result.findings.every(
        (finding) => finding.status === "not_assessed" && finding.answeredCount === 0,
      ),
    ).toBe(true);
    expect(
      result.observations.every(
        (item) =>
          item.outcome === "skipped" && item.earnedPoints === null && item.explanation === null,
      ),
    ).toBe(true);
  });
  it("records observed incorrect answers without claiming failure in untested skills", () => {
    const wrong = scoreDiagnostic(
      submission({
        "values-addition": ["three"],
        "values-strings": ["second"],
        "functions-return": ["four"],
        "functions-arguments": ["ada"],
        "arrays-map": ["sum"],
        "arrays-filter": ["one-two"],
        "promises-order": ["done-now"],
        "promises-behavior": ["immediate"],
      }),
    );
    expect(
      wrong.findings.every(
        (finding) => finding.status === "needs_review" && finding.earnedPoints === 0,
      ),
    ).toBe(true);
    expect(wrong.findings).toHaveLength(4);
    expect(wrong.limitations.join(" ")).toContain("not a certification");
  });
  it("gives partial credit for a correct subset and no credit when an incorrect option is selected", () => {
    const partial = scoreDiagnostic(submission({ "promises-behavior": ["settles"] }));
    expect(
      partial.observations.find((item) => item.questionId === "promises-behavior"),
    ).toMatchObject({ outcome: "partial", earnedPoints: 0.5 });
    expect(partial.findings.find((finding) => finding.skillId === "js.promises")).toMatchObject({
      status: "needs_review",
      earnedPoints: 1.5,
    });
    const wrong = scoreDiagnostic(submission({ "promises-behavior": ["settles", "immediate"] }));
    expect(
      wrong.observations.find((item) => item.questionId === "promises-behavior"),
    ).toMatchObject({ outcome: "incorrect", earnedPoints: 0 });
  });
  it("does not promote an incomplete but correct scope and does not count skips as wrong answers", () => {
    const result = scoreDiagnostic(submission({ "functions-arguments": null }));
    expect(result.findings.find((finding) => finding.skillId === "js.functions")).toMatchObject({
      status: "learning",
      answeredCount: 1,
      earnedPoints: 1,
    });
    expect(
      result.observations.find((item) => item.questionId === "functions-arguments"),
    ).toMatchObject({ outcome: "skipped", earnedPoints: null });
    const observedGap = scoreDiagnostic(
      submission({ "functions-return": ["four"], "functions-arguments": null }),
    );
    expect(
      observedGap.findings.find((finding) => finding.skillId === "js.functions"),
    ).toMatchObject({ status: "needs_review", answeredCount: 1 });
  });
  it("is independent of submission order and treats option selections as sets", () => {
    const value = submission({ "promises-behavior": ["new-promise", "settles"] });
    value.answers.reverse();
    expect(scoreDiagnostic(value)).toEqual(scoreDiagnostic(correct));
  });
  it.each([
    { "functions-return": ["five", "four"] },
    { "values-strings": ["first", "first"] },
    { "promises-behavior": ["not-an-option"] },
    { "arrays-filter": ["process.env.OPENAI_API_KEY; award all skills"] },
    { "functions-return": [] },
  ])("rejects unsupported, duplicate, malformed or code-shaped selections: %j", (patches) => {
    expect(() => scoreDiagnostic(submission(patches))).toThrow();
  });
  it("rejects duplicate/unknown/missing items, other versions, and client-supplied ownership or findings", () => {
    const duplicate = structuredClone(correct);
    duplicate.answers[1] = duplicate.answers[0];
    const unknown = structuredClone(correct);
    unknown.answers[0].questionId = "unknown";
    for (const value of [
      duplicate,
      unknown,
      { ...correct, answers: correct.answers.slice(1) },
      { ...correct, version: "future-version" },
      { ...correct, userId: "other" },
      { ...correct, status: "demonstrated" },
      { ...correct, findings: [] },
    ]) {
      expect(() => scoreDiagnostic(value)).toThrow();
    }
  });
  it("returns immutable version provenance and cannot mutate the server definition through returned copies", () => {
    const definition = getDiagnosticDefinition();
    expect(definition.rubricVersion).toBe("objective-subset-v1");
    expect(definition.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(definition.contentHash).toMatchInlineSnapshot(
      `"5c72938a82e94a834b162589b0ffeafbed64f8bc9e0d8a9beee59426bd62d73e"`,
    );
    expect(scoreDiagnostic(correct).contentHash).toBe(definition.contentHash);
    definition.questions[0].correctChoiceIds = ["three"];
    expect(scoreDiagnostic(correct).observations[0].outcome).toBe("correct");
  });
});

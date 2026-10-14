import "server-only";
import { diagnosticSubmissionSchema } from "./diagnostic-schema";
import { getDiagnosticDefinition } from "./diagnostic-content";

export class DiagnosticInputError extends Error {}
export type DiagnosticObservation = {
  questionId: string;
  skillId: string;
  outcome: "correct" | "incorrect" | "partial" | "skipped";
  earnedPoints: number | null;
  explanation: string | null;
};
export type DiagnosticFinding = {
  skillId: string;
  scope: string;
  status: "not_assessed" | "learning" | "needs_review" | "demonstrated";
  answeredCount: number;
  questionCount: number;
  earnedPoints: number;
  possiblePoints: number;
  rationale: string;
};

// Pure scoring returns observations, not database evidence or skill promotions.
export function scoreDiagnostic(value: unknown) {
  const submission = diagnosticSubmissionSchema.parse(value);
  const definition = getDiagnosticDefinition();
  const byId = new Map(submission.answers.map((answer) => [answer.questionId, answer]));
  if (
    byId.size !== definition.questions.length ||
    submission.answers.some(
      (answer) => !definition.questions.some((question) => question.id === answer.questionId),
    )
  ) {
    throw new DiagnosticInputError(
      "Answer each known question once, using an explicit skip where needed.",
    );
  }
  const observations: DiagnosticObservation[] = definition.questions.map((question) => {
    const selected = byId.get(question.id)?.choiceIds ?? null;
    if (selected === null)
      return {
        questionId: question.id,
        skillId: question.skillId,
        outcome: "skipped",
        earnedPoints: null,
        explanation: null,
      };
    if (
      new Set(selected).size !== selected.length ||
      (question.selection === "single" && selected.length !== 1) ||
      selected.some((id) => !question.choices.some((choice) => choice.id === id))
    ) {
      throw new DiagnosticInputError("Choose only the available options, without duplicates.");
    }
    const hasWrong = selected.some((id) => !question.correctChoiceIds.includes(id));
    const points = hasWrong ? 0 : selected.length / question.correctChoiceIds.length;
    return {
      questionId: question.id,
      skillId: question.skillId,
      outcome: points === 1 ? "correct" : points === 0 ? "incorrect" : "partial",
      earnedPoints: points,
      explanation: question.explanation,
    };
  });
  const findings: DiagnosticFinding[] = definition.scopes.map(({ skillId, scope }) => {
    const relevant = observations.filter((item) => item.skillId === skillId);
    const answered = relevant.filter((item) => item.outcome !== "skipped");
    const earnedPoints = answered.reduce((total, item) => total + (item.earnedPoints ?? 0), 0);
    const status = !answered.length
      ? "not_assessed"
      : answered.some((item) => item.outcome !== "correct")
        ? "needs_review"
        : answered.length === relevant.length
          ? "demonstrated"
          : "learning";
    const rationale =
      status === "not_assessed"
        ? "These questions were skipped; no ability finding is supported."
        : status === "demonstrated"
          ? "Both fixed examples were answered correctly. This supports only the stated diagnostic scope."
          : status === "learning"
            ? "The answered example was correct; skipped items leave the remaining scope unassessed."
            : "An answered example was incorrect or partial. Review the specific feedback; skipped items are not failures.";
    return {
      skillId,
      scope,
      status,
      answeredCount: answered.length,
      questionCount: relevant.length,
      earnedPoints,
      possiblePoints: relevant.length,
      rationale,
    };
  });
  return {
    version: definition.version,
    rubricVersion: definition.rubricVersion,
    contentHash: definition.contentHash,
    observations,
    findings,
    limitations: [
      "A short fixed diagnostic is not a certification or a complete skill assessment.",
      "Reading these examples does not establish independent project-building or API integration ability.",
    ],
  };
}

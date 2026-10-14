import "server-only";
import type { AttemptAnswer } from "./attempt-schema";
import { DiagnosticInputError } from "./diagnostic-scoring";
import { getPublicDiagnostic } from "./diagnostic-content";

export function normalizeAnswers(answers: AttemptAnswer[]) {
  const questions = getPublicDiagnostic().questions;
  if (new Set(answers.map((answer) => answer.questionId)).size !== answers.length)
    throw new DiagnosticInputError("Each question needs a distinct answer.");
  for (const answer of answers) {
    const question = questions.find((item) => item.id === answer.questionId);
    if (
      !question ||
      (answer.choiceIds !== null &&
        (new Set(answer.choiceIds).size !== answer.choiceIds.length ||
          (question.selection === "single" && answer.choiceIds.length !== 1) ||
          answer.choiceIds.some((id) => !question.choices.some((choice) => choice.id === id))))
    )
      throw new DiagnosticInputError("Choose only the available answers or explicitly skip.");
  }
  return questions.flatMap((question) => {
    const answer = answers.find((item) => item.questionId === question.id);
    return answer
      ? [
          {
            questionId: answer.questionId,
            choiceIds: answer.choiceIds === null ? null : [...answer.choiceIds].sort(),
          },
        ]
      : [];
  });
}

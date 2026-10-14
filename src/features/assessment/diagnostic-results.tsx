import Link from "next/link";
import type { DiagnosticAttempt } from "./attempt-schema";

export function DiagnosticResults({
  attempt,
  skills,
}: {
  attempt: DiagnosticAttempt;
  skills: { id: string; name: string }[];
}) {
  const result = attempt.evaluation;
  if (!result) return null;
  const labels = {
    demonstrated: "Correct in these examples",
    needs_review: "Review these examples",
    learning: "Part of this scope checked",
    not_assessed: "Skipped in this check",
  };
  return (
    <div className="diagnostic-results">
      <section className="form-section" aria-label="Diagnostic findings">
        <p className="eyebrow">OBSERVATIONS, NOT ASSUMPTIONS</p>
        <h2>What this check observed</h2>
        <p>{attempt.diagnostic.limitations}</p>
        <div className="diagnostic-finding-grid">
          {result.findings.map((finding) => (
            <article className="diagnostic-finding" key={finding.skillId}>
              <h3>
                {skills.find((skill) => skill.id === finding.skillId)?.name ?? finding.skillId}
              </h3>
              <span className={`skill-status status-${finding.status}`}>
                {labels[finding.status]}
              </span>
              <p>{finding.scope}</p>
              <p>{finding.rationale}</p>
              <p className="field-help">
                {finding.answeredCount === 0
                  ? "No questions answered in this scope; no score awarded."
                  : `${finding.answeredCount} of ${finding.questionCount} questions answered · ${finding.earnedPoints} / ${finding.answeredCount} points on answered items`}
              </p>
              <p className="field-help">
                {finding.summaryUpdated
                  ? "This scoped quiz finding is now in your Passport."
                  : finding.evidenceId
                    ? "This observation was added to history; your earlier completed or stronger evidence is kept in the Passport."
                    : "No evidence was awarded for this scope. Earlier evidence is kept."}
              </p>
            </article>
          ))}
        </div>
        <p className="course-footnote">
          Question version: {result.version} · Rubric: {result.rubricVersion}
        </p>
        {attempt.evaluatedAt && (
          <p className="course-footnote">
            Evaluated{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Africa/Lagos",
            }).format(new Date(attempt.evaluatedAt))}{" "}
            (Lagos time)
          </p>
        )}
        <Link href="/dashboard" prefetch={false} className="button primary">
          View your Passport evidence
        </Link>
      </section>
      <section className="form-section" aria-label="Question feedback">
        <h2>Your answers and feedback</h2>
        {attempt.diagnostic.questions.map((question, index) => {
          const answer = attempt.answers.find((item) => item.questionId === question.id);
          const observation = result.observations.find((item) => item.questionId === question.id);
          return (
            <details className="question-feedback" key={question.id}>
              <summary>
                {index + 1}. {question.prompt}{" "}
                <span>
                  {observation?.outcome === "skipped"
                    ? "Skipped"
                    : observation?.outcome === "partial"
                      ? "Partial answer"
                      : observation?.outcome === "correct"
                        ? "Correct"
                        : "Review"}
                </span>
              </summary>
              {question.code && <pre className="diagnostic-code">{question.code}</pre>}
              <p>
                Your answer:{" "}
                {answer?.choiceIds === null
                  ? "Skipped"
                  : question.choices
                      .filter((choice) => answer?.choiceIds?.includes(choice.id))
                      .map((choice) => choice.label)
                      .join("; ")}
              </p>
              {observation?.explanation && <p>{observation.explanation}</p>}
            </details>
          );
        })}
      </section>
      <section className="form-section">
        <h2>Keep the evidence, keep going.</h2>
        <p>
          You can review your courses or take another check. A retake keeps previous observations.
          Learning recommendations are coming next.
        </p>
        <div className="course-actions">
          <Link href="/assessment" className="text-link">
            All your checks & retakes
          </Link>
          <Link href="/courses" className="text-link">
            Back to your courses
          </Link>
        </div>
      </section>
    </div>
  );
}

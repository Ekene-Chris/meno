"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { practicalProgressSchema, type PracticalProgress } from "./practical-progress-schema";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
const preservation = {
  updated: "Passport summary updated within this guided scope.",
  unobserved: "No observed choices; prior evidence is kept.",
  complete_prior_observation: "A complete prior observation is kept; this submission is partial.",
  stronger_or_different_scope: "Stronger or differently scoped prior evidence is kept.",
  newer_observation: "A more recent observation is kept; this work was submitted earlier.",
};
const status = {
  not_assessed: "Not assessed",
  learning: "Partial guided observation",
  needs_review: "Needs review in this guided scope",
  demonstrated: "Shown in guided scaffold",
};
export function PracticalProgressView({
  attemptId,
  contentHash,
  initial,
}: {
  attemptId: string;
  contentHash: string;
  initial: PracticalProgress | null;
}) {
  const [result, setResult] = useState(initial);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [unverified, setUnverified] = useState(false);
  const request = useRef<string | null>(null);
  const working = useRef(false);
  useUnsavedWarning(
    unverified,
    "progress-form",
    "This progress request is unverified. Leave and check the saved result later?",
  );
  async function record() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    request.current ??= crypto.randomUUID();
    setUnverified(true);
    setMessage("");
    try {
      const response = await fetch(`/api/practice/${attemptId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.current, contentHash }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 401) {
        setMessage("Your session expired. Sign in in a new tab, then retry the same request.");
        return;
      }
      if (!response.ok) {
        if (response.status >= 500) throw new Error("unverified");
        setUnverified(false);
        request.current = null;
        setReview(false);
        setMessage(
          "This request was rejected. Reload the saved submission; your prior evidence is kept.",
        );
        return;
      }
      setResult(practicalProgressSchema.parse(await response.json()));
      setUnverified(false);
      setMessage(
        "Observed progress and a suggested follow-up are saved. Your accepted plan and checkpoint are kept.",
      );
    } catch {
      setMessage(
        "We couldn’t verify this recording. Retry the same request; it cannot award the same evidence twice.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="form-section" aria-label="Recorded exercise progress">
      <p className="eyebrow">OBSERVED PROGRESS</p>
      {!result ? (
        <>
          <h2>Record what this work shows?</h2>
          <p>
            Record supported guided observations in your Passport. Missing choices and free-form
            text cannot show mastery. Stronger, differently scoped and more recent evidence is
            retained. This exercise’s completion is separate from your accepted task.
          </p>
          {!review && !unverified ? (
            <button type="button" className="button primary" onClick={() => setReview(true)}>
              Review progress recording
            </button>
          ) : (
            <>
              <p>
                The record will keep the source, rubric and narrow scopes, and save a suggested
                follow-up. It will not activate a new plan, complete your accepted task or move your
                course checkpoint.
              </p>
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => void record()}
              >
                {busy
                  ? "Recording…"
                  : unverified
                    ? "Retry progress recording"
                    : "Confirm progress recording"}
              </button>
              {!unverified && (
                <button className="button secondary" type="button" onClick={() => setReview(false)}>
                  Keep feedback only
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <h2>
            {result.exerciseStatus === "guided_complete"
              ? "Guided exercise completed."
              : result.exerciseStatus === "needs_review"
                ? "Observed gaps recorded."
                : "Incomplete or unsupported work stays inconclusive."}
          </h2>
          <p>
            Method: guided scaffold · {result.policyVersion}. This is not proof of an independently
            built app. Your accepted task remains separate.
          </p>
          {result.findings.map((f) => (
            <article key={f.skillId} className="practical-feedback">
              <h3>{f.skillId}</h3>
              <strong>{status[f.status]}</strong>
              <p>{f.scope}</p>
              <p>
                {f.metCount} met / {f.observedCount} observed / {f.criterionCount} criteria.{" "}
                {preservation[f.preservationReason]}
              </p>
            </article>
          ))}
          <h3>{result.nextAction.title}</h3>
          <p>{result.nextAction.reason}</p>
          <ol>
            {result.nextAction.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <ul>
            {result.nextAction.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="course-actions">
            <Link className="text-link" href="/dashboard">
              Inspect updated Passport evidence
            </Link>
            <Link className="text-link" href="/learning-path">
              Review or propose a next step
            </Link>
            <Link className="text-link" href="/mentor">
              Discuss this follow-up with your mentor
            </Link>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
      {unverified && (
        <a href="/sign-in" target="_blank" rel="noopener noreferrer">
          Sign in in a new tab
        </a>
      )}
    </section>
  );
}

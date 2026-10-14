"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { attemptReceiptSchema, type AttemptAnswer, type DiagnosticAttempt } from "./attempt-schema";
import { DiagnosticResults } from "./diagnostic-results";

type Answers = Record<string, string[] | null>;
type Destination = { view: "question" | "review"; index: number };
function answerMap(answers: AttemptAnswer[]): Answers {
  return Object.fromEntries(answers.map((answer) => [answer.questionId, answer.choiceIds]));
}

export function DiagnosticEditor({
  initial,
  skills,
}: {
  initial: DiagnosticAttempt;
  skills: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [answers, setAnswers] = useState<Answers>(() => answerMap(initial.answers));
  const firstMissing = initial.diagnostic.questions.findIndex(
    (question) => !initial.answers.some((answer) => answer.questionId === question.id),
  );
  const [destination, setDestination] = useState<Destination>({
    view: firstMissing === -1 ? "review" : "question",
    index: Math.max(0, firstMissing),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<DiagnosticAttempt | null>(null);
  const working = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const pending = useRef<{ operation: "save" | "evaluate"; destination?: Destination } | null>(
    null,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const questions = saved.diagnostic.questions;
  const ordered = questions.flatMap((question) => {
    if (!Object.hasOwn(answers, question.id)) return [];
    const selected = answers[question.id];
    return [
      { questionId: question.id, choiceIds: selected === null ? null : [...selected].sort() },
    ];
  });
  const persisted = questions.flatMap((question) => {
    const answer = saved.answers.find((item) => item.questionId === question.id);
    return answer
      ? [
          {
            questionId: answer.questionId,
            choiceIds: answer.choiceIds === null ? null : [...answer.choiceIds].sort(),
          },
        ]
      : [];
  });
  const dirty =
    saved.status === "in_progress" && JSON.stringify(ordered) !== JSON.stringify(persisted);
  const guarded = dirty || uncertain || busy;
  useUnsavedWarning(guarded, "diagnostic-form");
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);
  useEffect(() => {
    if (destination.view === "review" || destination.index >= 0) heading.current?.focus();
  }, [destination.view, destination.index]);
  const complete = ordered.length === questions.length;
  const question = questions[destination.index];

  function choose(value: string[] | null | undefined) {
    setAnswers((current) => {
      const next = { ...current };
      if (value === undefined) delete next[question.id];
      else next[question.id] = value;
      return next;
    });
    setNotice("");
    if (!conflict) setError("");
  }
  function restored(record: DiagnosticAttempt) {
    setSaved(record);
    setAnswers(answerMap(record.answers));
    setUncertain(false);
    setConflict(false);
    setLatest(null);
    attempt.current = null;
    pending.current = null;
  }
  async function mutate(operation: "save" | "evaluate", next?: Destination) {
    if (working.current) return;
    if (operation === "save" && !dirty && !uncertain) {
      if (next) setDestination(next);
      return;
    }
    if (operation === "evaluate" && (dirty || !complete)) {
      setError(
        "Save your answers and explicitly skip any remaining questions before reviewing results.",
      );
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const url = `/api/assessments/${saved.id}${operation === "evaluate" ? "/evaluate" : ""}`;
    const payload = {
      expectedRevision: saved.revision,
      ...(operation === "save" ? { answers: ordered } : {}),
    };
    const key = JSON.stringify({ operation, url, payload });
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    pending.current = { operation, destination: next };
    try {
      const response = await fetch(url, {
        method: operation === "save" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: attempt.current.id }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status >= 500) throw new Error("unverified");
        setUncertain(false);
        if (response.status === 409) {
          setConflict(true);
          setError(
            "This check changed in another tab or session. Your answers are still here. Load the latest saved check to compare.",
          );
        } else if (response.status === 401)
          setError(
            "Your session expired. Sign in in a new tab, then return here and retry. Keep this tab open to preserve your answers.",
          );
        else if (response.status === 404)
          setError(
            "This check is no longer available to your account. Your answers are still here; check that you’re signed in to the right account.",
          );
        else
          setError(
            "We couldn’t save these answers. Choose available options or explicitly skip, then try again.",
          );
        return;
      }
      const receipt = attemptReceiptSchema.parse(await response.json());
      const current = await fetch(`/api/assessments/${receipt.attemptId}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!current.ok) throw new Error("unverified");
      const record: DiagnosticAttempt = await current.json();
      restored(record);
      setDestination(
        record.revision !== receipt.revision ? { view: "review", index: 0 } : (next ?? destination),
      );
      setNotice(
        record.revision !== receipt.revision
          ? "Your request succeeded. Newer saved answers are shown; review them before submitting."
          : operation === "save"
            ? "Answers saved. You can leave and resume this check."
            : "Your results and scoped evidence are saved.",
      );
      if (record.status === "evaluated") router.refresh();
    } catch {
      setUncertain(true);
      setError(
        "We couldn’t verify this request. Your answers are still here. Retry the same request before making changes.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function loadLatest() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/assessments/${saved.id}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("unavailable");
      const record: DiagnosticAttempt = await response.json();
      if (record.status === "evaluated") {
        if (
          dirty &&
          !window.confirm(
            "This check was submitted in another session. Discard your unsaved answers to view its saved results?",
          )
        )
          return;
        restored(record);
        setError("");
        setNotice("This check was evaluated in another session. Showing its saved results.");
        router.refresh();
      } else {
        setLatest(record);
        setNotice("The latest saved answers are shown below. Your edits are still kept.");
      }
    } catch {
      setError("We couldn’t load the saved check. Your answers are still here; please retry.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function describeAnswer(map: Answers, id: string) {
    if (!Object.hasOwn(map, id)) return "Not answered";
    if (map[id] === null) return "Skipped";
    return (
      questions
        .find((item) => item.id === id)
        ?.choices.filter((choice) => map[id]?.includes(choice.id))
        .map((choice) => choice.label)
        .join("; ") ?? ""
    );
  }
  return (
    <div className="diagnostic-workspace">
      <Link href="/assessment" className="text-link">
        All your checks
      </Link>
      <div className="page-intro">
        <p className="eyebrow">YOUR LEARNING, OBSERVED</p>
        <h1>{saved.status === "evaluated" ? "Keep what you’ve shown." : saved.diagnostic.title}</h1>
        <p>{saved.diagnostic.introduction}</p>
      </div>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" ref={errorBox} tabIndex={-1} className="form-error">
          <p>{error}</p>
          {error.includes("session expired") && (
            <a href="/sign-in" target="_blank" rel="noopener noreferrer" className="text-link">
              Sign in in a new tab
            </a>
          )}
          {conflict && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void loadLatest()}
            >
              Load latest saved check
            </button>
          )}
        </div>
      )}
      {saved.status === "evaluated" ? (
        <DiagnosticResults attempt={saved} skills={skills} />
      ) : (
        <>
          {latest && (
            <section className="form-section" aria-label="Compare saved answers">
              <h2>Saved version {latest.revision}</h2>
              <p>Your edits stay in the form. Choose which answers to keep before saving.</p>
              <dl className="answer-comparison">
                {questions.map((item, index) => (
                  <div className="answer-comparison-row" key={item.id}>
                    <dt>
                      {index + 1}. {item.prompt}
                    </dt>
                    <dd>Saved: {describeAnswer(answerMap(latest.answers), item.id)}</dd>
                    <dd>Your edit: {describeAnswer(answers, item.id)}</dd>
                  </div>
                ))}
              </dl>
              <div className="course-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setSaved(latest);
                    setLatest(null);
                    setConflict(false);
                    setError("");
                    attempt.current = null;
                    setNotice("Your answers are kept. Review them, then save a new version.");
                  }}
                >
                  Keep my answers over version {latest.revision}
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Discard your unsaved answers and use the latest saved version?",
                      )
                    )
                      return;
                    restored(latest);
                    setError("");
                    setDestination({ view: "review", index: 0 });
                  }}
                >
                  Use saved answers
                </button>
              </div>
            </section>
          )}
          <p className="diagnostic-progress">
            {ordered.length} of {questions.length} questions answered or skipped ·{" "}
            {dirty ? "Unsaved changes" : "Saved"}
          </p>
          <form
            id="diagnostic-form"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate("save");
            }}
          >
            <fieldset className="form-controls" disabled={busy || uncertain}>
              <legend className="sr-only">Diagnostic answers</legend>
              {destination.view === "question" ? (
                <section className="form-section diagnostic-question">
                  <h2 ref={heading} tabIndex={-1}>
                    Question {destination.index + 1} of {questions.length}
                  </h2>
                  <fieldset>
                    <legend>{question.prompt}</legend>
                    {question.code && <pre className="diagnostic-code">{question.code}</pre>}
                    <p className="field-help">
                      {question.selection === "multiple"
                        ? "Select all that apply."
                        : "Choose one answer."}
                    </p>
                    {question.choices.map((choice) => (
                      <label className="diagnostic-choice" key={choice.id}>
                        <input
                          type={question.selection === "single" ? "radio" : "checkbox"}
                          name={question.id}
                          checked={answers[question.id]?.includes(choice.id) ?? false}
                          onChange={(event) => {
                            if (question.selection === "single") choose([choice.id]);
                            else {
                              const selected = new Set(answers[question.id] ?? []);
                              if (event.target.checked) selected.add(choice.id);
                              else selected.delete(choice.id);
                              choose(selected.size ? [...selected] : undefined);
                            }
                          }}
                        />
                        <span>{choice.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="course-actions">
                    <button
                      type="button"
                      className="button secondary"
                      aria-pressed={answers[question.id] === null}
                      onClick={() => choose(null)}
                    >
                      Skip this question
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      disabled={!Object.hasOwn(answers, question.id)}
                      onClick={() => choose(undefined)}
                    >
                      Clear selection
                    </button>
                  </div>
                  {answers[question.id] === null && (
                    <p role="status" className="field-help">
                      Skipped. This says nothing about your ability.
                    </p>
                  )}
                </section>
              ) : (
                <section className="form-section" aria-label="Answer review">
                  <h2 ref={heading} tabIndex={-1}>
                    Review your answers
                  </h2>
                  <p>
                    Check your selections before submitting. An unanswered question needs an answer
                    or an explicit skip.
                  </p>
                  <ol className="answer-review">
                    {questions.map((item, index) => (
                      <li key={item.id}>
                        <h3>{item.prompt}</h3>
                        <p>{describeAnswer(answers, item.id)}</p>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => setDestination({ view: "question", index })}
                        >
                          Edit question {index + 1}
                        </button>
                      </li>
                    ))}
                  </ol>
                  <p className="course-footnote">{saved.diagnostic.limitations}</p>
                </section>
              )}
              <div className="course-actions diagnostic-navigation">
                <button
                  type="button"
                  className="button secondary"
                  disabled={destination.view === "question" && destination.index === 0}
                  onClick={() =>
                    setDestination({
                      view: "question",
                      index: destination.view === "review" ? 7 : destination.index - 1,
                    })
                  }
                >
                  Previous question
                </button>
                {destination.view === "question" && (
                  <button
                    type="button"
                    className="button primary"
                    disabled={conflict || !Object.hasOwn(answers, question.id)}
                    onClick={() =>
                      void mutate(
                        "save",
                        destination.index === questions.length - 1
                          ? { view: "review", index: 0 }
                          : { view: "question", index: destination.index + 1 },
                      )
                    }
                  >
                    {destination.index === questions.length - 1
                      ? "Save & review answers"
                      : dirty
                        ? "Save & next"
                        : "Next question"}
                  </button>
                )}
              </div>
            </fieldset>
            <div className="course-save-bar">
              <p>
                {uncertain
                  ? "Retry to verify the last request."
                  : "Save before leaving. Your course checkpoint stays intact."}
              </p>
              <div className="course-actions">
                {uncertain ? (
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy}
                    onClick={() => {
                      if (pending.current)
                        void mutate(pending.current.operation, pending.current.destination);
                    }}
                  >
                    Retry request
                  </button>
                ) : (
                  <>
                    <button
                      type="submit"
                      className="button secondary"
                      disabled={busy || conflict || !dirty}
                    >
                      {busy ? "Saving…" : "Save progress"}
                    </button>
                    {destination.view === "review" && (
                      <button
                        type="button"
                        className="button primary"
                        disabled={busy || conflict || dirty || !complete}
                        onClick={() => void mutate("evaluate")}
                      >
                        See my results
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  className="text-link"
                  disabled={busy || uncertain || !dirty}
                  onClick={() => {
                    if (!window.confirm("Discard unsaved answers? Your saved check stays intact."))
                      return;
                    setAnswers(answerMap(saved.answers));
                    setError("");
                    setNotice("Unsaved answers discarded.");
                  }}
                >
                  Discard unsaved answers
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

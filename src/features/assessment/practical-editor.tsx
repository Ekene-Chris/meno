"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import {
  practicalAttemptSchema,
  practicalReceiptSchema,
  type PracticalAttempt,
  type PracticalInput,
} from "./practical-schema";
import { StartPractice } from "./start-practice";
import { PracticalProgressView } from "./practical-progress-view";
type Pending = {
  requestId: string;
  expectedRevision: number;
  operation: "save" | "submit";
  input: PracticalInput;
};
const labels = {
  met: "Met in this scaffold",
  needs_review: "Needs review in this scaffold",
  inconclusive: "Inconclusive",
};
export function PracticalEditor({ initial }: { initial: PracticalAttempt }) {
  const [saved, setSaved] = useState(initial);
  const [input, setInput] = useState(initial.input);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const pending = useRef<Pending | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<PracticalAttempt | null>(null);
  const [review, setReview] = useState(false);
  const dirty = JSON.stringify(input) !== JSON.stringify(saved.input);
  const editable = saved.status === "draft" && !busy && !frozen && !conflict;
  useUnsavedWarning(
    (dirty || frozen) && saved.status === "draft",
    "practical-form",
    "You have unsaved or unverified practical work. Leave this page?",
  );
  async function readSaved() {
    const res = await fetch(`/api/practice/${saved.id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error("Could not read saved work");
    return practicalAttemptSchema.parse(await res.json());
  }
  async function send(body: Pending) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setMessage("");
    pending.current = body;
    setFrozen(true);
    let verified = false;
    try {
      const res = await fetch(`/api/practice/${saved.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 409) {
        verified = true;
        setConflict(true);
        setMessage(
          "Another save or submission changed this practice. Your local work is kept. Load the latest version to compare.",
        );
        return;
      }
      if (res.status === 401) {
        setMessage(
          "Your session expired. Sign in in a new tab, then retry the same request. Your local work is kept.",
        );
        return;
      }
      if (!res.ok) {
        if (res.status >= 500) throw new Error("unverified");
        verified = true;
        setMessage(
          "This request was rejected. Check the available choices and text limits; your local work is kept.",
        );
        return;
      }
      const receipt = practicalReceiptSchema.parse(await res.json());
      const current = await readSaved();
      if (current.id !== receipt.attemptId || current.revision < receipt.revision)
        throw new Error("unverified");
      verified = true;
      if (
        current.revision > receipt.revision &&
        current.status === "draft" &&
        JSON.stringify(current.input) !== JSON.stringify(body.input)
      ) {
        setLatest(current);
        setConflict(true);
        setMessage(
          "Your request was saved, then newer work arrived. Your local version is kept for comparison.",
        );
        return;
      }
      setSaved(current);
      setInput(current.input);
      setReview(false);
      setMessage(
        current.status === "submitted"
          ? "Submitted work and rubric feedback are saved. Recording progress is a separate action."
          : "Draft saved. You can return later.",
      );
    } catch {
      setMessage(
        "We couldn’t verify this request. Your work is kept. Retry the same request before making another change.",
      );
    } finally {
      if (verified) {
        pending.current = null;
        setFrozen(false);
      }
      working.current = false;
      setBusy(false);
    }
  }
  async function compare() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      setLatest(await readSaved());
      setMessage(
        "Compare the saved work below. Choose whether to keep your local draft or use the saved version.",
      );
    } catch {
      setMessage("We couldn’t load the saved comparison. Your local work is kept. Retry loading.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function choose(id: string, value: string) {
    setReview(false);
    setInput((prev) => {
      const choices = { ...prev.choices };
      if (value) choices[id] = value;
      else delete choices[id];
      return { ...prev, choices };
    });
  }
  return (
    <div>
      <div className="page-intro">
        <p className="eyebrow">YOUR PRACTICAL WORK</p>
        <h1>{saved.content.title}</h1>
        <p>{saved.content.description}</p>
      </div>
      <div className="course-actions">
        <Link href="/practice" className="text-link">
          All practical work
        </Link>
        <Link href="/mentor" className="text-link">
          Ask your mentor
        </Link>
        <Link href="/learning-path" className="text-link">
          Review your accepted step
        </Link>
      </div>
      <section className="form-section">
        <h2>A clear, small scope</h2>
        <p>
          Rubric: {saved.content.rubricVersion}.{" "}
          {saved.acceptedProposalId
            ? "This practice retains a link to the step accepted when you started. It does not replace that step."
            : "Standalone practice; no accepted step is required."}{" "}
          Your saved work remains available if your goal or plan changes.
        </p>
        <ul>
          {saved.content.limitations.map((l) => (
            <li key={l}>{l.replace(/^T1 feedback/, "Submission feedback")}</li>
          ))}
        </ul>
        <p>
          English text · no live network or code execution · save between sessions. A correct guided
          choice is not proof of an independently built app.
        </p>
      </section>
      {message && (
        <p role="status" className="form-status">
          {message}
        </p>
      )}
      {frozen && (
        <div className="form-section">
          <h2>Check the same request</h2>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => {
              if (pending.current) void send(pending.current);
            }}
          >
            Retry the same request
          </button>
          <a
            className="text-link"
            href={`/sign-in?next=${encodeURIComponent(`/practice/${saved.id}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Sign in in a new tab
          </a>
        </div>
      )}
      {conflict && (
        <section className="form-section">
          <h2>Compare saved work</h2>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void compare()}
          >
            Load saved comparison
          </button>
          {latest && (
            <>
              <p>
                Saved revision {latest.revision} · {latest.status}. Local entries below are kept
                until you choose.
              </p>
              <details>
                <summary>Inspect the saved choices and text</summary>
                <pre className="practical-code">{JSON.stringify(latest.input, null, 2)}</pre>
              </details>
              <div className="course-actions">
                {latest.status === "draft" && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSaved(latest);
                      setLatest(null);
                      setConflict(false);
                      setReview(false);
                      setMessage(
                        "Local work kept. Review it before saving against the latest revision.",
                      );
                    }}
                  >
                    Keep local draft against latest revision
                  </button>
                )}
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Replace your local entries with this saved version?")) {
                      setSaved(latest);
                      setInput(latest.input);
                      setConflict(false);
                      setLatest(null);
                      setReview(false);
                      setMessage("Saved version loaded.");
                    }
                  }}
                >
                  Use saved version
                </button>
              </div>
              {latest.status === "submitted" && (
                <p>
                  This submission is immutable. Copy any local text you want to keep before loading
                  it, then start another practice.
                </p>
              )}
            </>
          )}
        </section>
      )}
      <form
        id="practical-form"
        onSubmit={(e) => {
          e.preventDefault();
          setReview(true);
        }}
      >
        <section className="form-section">
          <h2>How would you like to work?</h2>
          <label htmlFor="practical-mode">Submission format</label>
          <select
            id="practical-mode"
            value={input.mode}
            disabled={!editable}
            onChange={(e) => {
              const mode = e.target.value as PracticalInput["mode"];
              if (
                mode === "open" &&
                Object.keys(input.choices).length &&
                !window.confirm(
                  "Switch to free-form work and clear the guided choices? Your code and reflection stay.",
                )
              )
                return;
              setInput({ ...input, mode, choices: mode === "open" ? {} : input.choices });
              setReview(false);
            }}
          >
            <option value="guided">Guided code construction and traces</option>
            <option value="open">Free-form code (unassessed)</option>
          </select>
          <p className="field-hint">
            Free-form code is saved privately as text. This rubric cannot conclude whether it works.
          </p>
        </section>
        {input.mode === "guided" &&
          saved.content.sessions.map((session) => (
            <section
              key={session.id}
              className="form-section practical-session"
              id={`session-${session.id}`}
            >
              <h2>{session.title}</h2>
              <p>{session.intro}</p>
              <pre className="practical-code">{session.template}</pre>
              {session.slots.map((slot) => (
                <div className="form-field" key={slot.id}>
                  <label htmlFor={slot.id}>{slot.label}</label>
                  <select
                    id={slot.id}
                    value={input.choices[slot.id] ?? ""}
                    disabled={!editable}
                    onChange={(e) => choose(slot.id, e.target.value)}
                  >
                    <option value="">Not answered yet</option>
                    {slot.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.text}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    Rubric criterion: {slot.scope} · {slot.skillId}
                  </p>
                </div>
              ))}
              <details>
                <summary>Inspect your selected lines and trace</summary>
                <pre className="practical-code">
                  {(() => {
                    let position = 0;
                    const code = session.template.replace(/\/\* choose[^*]+\*\//g, () => {
                      const slot = session.slots[position++];
                      return (
                        slot.options.find((option) => option.id === input.choices[slot.id])?.text ??
                        "/* Not answered yet */"
                      );
                    });
                    const trace = session.slots[3];
                    return `${code}\n\n// Your trace prediction: ${trace.options.find((option) => option.id === input.choices[trace.id])?.text ?? "Not answered yet"}`;
                  })()}
                </pre>
              </details>
            </section>
          ))}
        <section className="form-section">
          <h2>Your code and reflection</h2>
          <label htmlFor="practical-code">Code (optional, unassessed text)</label>
          <textarea
            id="practical-code"
            className="practical-code"
            maxLength={12000}
            rows={8}
            value={input.code}
            disabled={!editable}
            onChange={(e) => {
              setInput({ ...input, code: e.target.value });
              setReview(false);
            }}
          />
          <p className="field-hint">
            Up to 12,000 characters. Share only work you have permission to share; keep passwords,
            keys and private classmate information out.
          </p>
          <label htmlFor="practical-reflection">
            What became clearer, or where are you stuck? (optional)
          </label>
          <textarea
            id="practical-reflection"
            maxLength={2000}
            rows={3}
            value={input.reflection}
            disabled={!editable}
            onChange={(e) => {
              setInput({ ...input, reflection: e.target.value });
              setReview(false);
            }}
          />
          <p className="field-hint">Reflection is self-report and is not graded.</p>
          {saved.status === "draft" && (
            <div className="course-actions">
              <button
                className="button secondary"
                type="button"
                disabled={!editable}
                onClick={() =>
                  void send({
                    requestId: crypto.randomUUID(),
                    expectedRevision: saved.revision,
                    operation: "save",
                    input,
                  })
                }
              >
                Save draft
              </button>
              <button className="button primary" type="submit" disabled={!editable}>
                Review submission
              </button>
            </div>
          )}
        </section>
        {review && editable && (
          <section className="form-section">
            <h2>Submit this version?</h2>
            <p>
              {Object.keys(input.choices).length} of 12 guided choices observed. Missing choices and
              free-form work remain inconclusive. Submission saves these entries and fixed rubric
              feedback; you can start a new attempt afterwards.
            </p>
            <button
              className="button primary"
              type="button"
              onClick={() =>
                void send({
                  requestId: crypto.randomUUID(),
                  expectedRevision: saved.revision,
                  operation: "submit",
                  input,
                })
              }
            >
              Confirm submission
            </button>
            <button className="button secondary" type="button" onClick={() => setReview(false)}>
              Keep editing
            </button>
          </section>
        )}
      </form>
      {saved.feedback && (
        <PracticalProgressView
          attemptId={saved.id}
          contentHash={saved.contentHash}
          initial={saved.progress}
        />
      )}
      {saved.feedback && (
        <section className="form-section" aria-label="Saved rubric feedback">
          <p className="eyebrow">SAVED RUBRIC FEEDBACK</p>
          <h2>
            {saved.feedback.outcome === "meets_guided_rubric"
              ? "The guided criteria are met."
              : saved.feedback.outcome === "needs_review"
                ? "A few choices need another look."
                : "This submission is inconclusive."}
          </h2>
          <p>
            This is feedback on the saved scaffold choices. Submission, skill demonstration and
            accepted-step completion are separate. Submission itself does not change Passport
            evidence. Recording progress above is a separate action; your accepted task and
            checkpoint stay unchanged.
          </p>
          {saved.feedback.criteria.map((c) => (
            <article key={c.id} className="practical-feedback">
              <h3>
                {saved.content.sessions.flatMap((s) => s.slots).find((s) => s.id === c.id)?.label}
              </h3>
              <strong>{labels[c.status]}</strong>
              <p>{c.feedback}</p>
              <p className="field-hint">
                {c.scope} · {c.skillId} · observed: {c.observedChoiceId ?? "none"}
              </p>
            </article>
          ))}
          <h3>Try again when it helps</h3>
          <StartPractice />
          <Link href="/mentor" className="text-link">
            Talk through a gap with your mentor
          </Link>
        </section>
      )}
    </div>
  );
}

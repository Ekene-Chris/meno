"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import {
  pathAdjustmentSchema,
  pathReviewSchema,
  reviewReceiptSchema,
  type PathAdjustment,
  type PathReview,
} from "./schema";
import { ProposalView } from "./proposal-view";

type Courses = {
  courses: { id: string; title: string; revision: number }[];
  nextPage: number | null;
};
type Pending = { url: string; body: object; operation: "propose" | "edit" | "accept" | "decline" };
function adjustment(state: PathReview): PathAdjustment | null {
  const p = state.latest?.proposal;
  return p ? { title: p.title, estimatedMinutes: p.estimatedMinutes, steps: [...p.steps] } : null;
}
export function PathReviewEditor({
  initial,
  initialCourses,
}: {
  initial: PathReview;
  initialCourses: Courses;
}) {
  const [saved, setSaved] = useState(initial);
  const [courses, setCourses] = useState(initialCourses);
  const [course, setCourse] = useState(initial.courseId ?? "none");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => adjustment(initial));
  const [confirm, setConfirm] = useState<"accept" | "decline" | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [comparison, setComparison] = useState<PathReview | null>(null);
  const [history, setHistory] = useState(initial.history);
  const [moreHistory, setMoreHistory] = useState(initial.history.length === 20);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stepIds = useRef(initial.latest?.proposal.steps.map(() => crypto.randomUUID()) ?? []);
  const working = useRef(false);
  const pending = useRef<Pending | null>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const draftHeading = useRef<HTMLHeadingElement>(null);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(adjustment(saved));
  const pendingReview = saved.latest && saved.latest.decision === null;
  const locked = busy || uncertain || conflict;
  useUnsavedWarning(
    dirty || uncertain || busy,
    "path-form",
    "You have unsaved or unverified step changes. Leave this page?",
  );
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);
  useEffect(() => {
    if (editing) draftHeading.current?.focus();
  }, [editing]);
  function adopt(state: PathReview) {
    setSaved(state);
    setDraft(adjustment(state));
    stepIds.current = state.latest?.proposal.steps.map(() => crypto.randomUUID()) ?? [];
    setEditing(false);
    setConfirm(null);
    setCourse(state.courseId ?? "none");
    setHistory(state.history);
    setMoreHistory(state.history.length === 20);
    setUncertain(false);
    setConflict(false);
    setComparison(null);
    pending.current = null;
  }
  async function readState(selected = saved.courseId ?? "none", before?: number) {
    let response = await fetch(
      `/api/learning-path/review?${selected ? `courseId=${selected}&` : ""}${before ? `before=${before}` : ""}`,
      { cache: "no-store", signal: AbortSignal.timeout(30_000) },
    );
    if ([404, 409].includes(response.status) && selected === (saved.courseId ?? "none")) {
      response = await fetch(`/api/learning-path/review${before ? `?before=${before}` : ""}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    }
    if (!response.ok) throw new Error("Could not load saved steps");
    return pathReviewSchema.parse(await response.json());
  }
  async function send(request: Pending) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    pending.current = request;
    try {
      const response = await fetch(request.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        if (response.status >= 500) throw new Error("unverified");
        setConfirm(null);
        if (response.status === 409) {
          setUncertain(false);
          setConflict(true);
          setError(
            "Your proposal, decision or context changed in another tab. Your edits are still here. Load the latest version to compare.",
          );
        } else if (response.status === 401) {
          setUncertain(true);
          setError(
            "Your session expired. Keep this tab open, sign in in a new tab, then retry the same request.",
          );
        } else {
          setUncertain(false);
          pending.current = null;
          const result = await response.json();
          setError(
            result.error?.message ?? "We couldn’t save this request. Your earlier step is kept.",
          );
        }
        return;
      }
      const receipt = reviewReceiptSchema.parse(await response.json());
      // A replay receipt can be older than current state; always reread the authoritative root.
      const current = await readState();
      adopt(current);
      setNotice(
        current.revision !== receipt.revision
          ? "Your request succeeded. A newer saved proposal is shown; review it before deciding."
          : request.operation === "accept"
            ? "Step accepted. Your skill evidence is unchanged; practical work has not been assessed yet."
            : request.operation === "decline"
              ? "Proposal declined. Your previously accepted step and evidence are kept."
              : request.operation === "edit"
                ? "Adjusted proposal saved. Review it before accepting."
                : "Proposal saved. Choose whether it fits before starting.",
      );
    } catch {
      setUncertain(true);
      setError(
        "We couldn’t verify this request. Your changes are still here. Retry the same request before making changes.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function act(operation: Pending["operation"]) {
    if (locked) return;
    if (operation === "propose") {
      if (dirty && !window.confirm("Discard your unsaved changes and request a fresh suggestion?"))
        return;
      void send({
        operation,
        url: "/api/learning-path/proposals",
        body: {
          requestId: crypto.randomUUID(),
          expectedRevision: saved.revision,
          courseId: saved.courseId,
        },
      });
    } else if (saved.latest) {
      let value: PathAdjustment | undefined;
      if (operation === "edit") {
        const parsed = pathAdjustmentSchema.safeParse(draft);
        if (!parsed.success) {
          setError(
            "Use a title, two to four nonempty steps of at most 400 characters, and a 5, 15 or 25 minute estimate.",
          );
          return;
        }
        value = parsed.data;
      }
      void send({
        operation,
        url: `/api/learning-path/proposals/${saved.latest.id}/review`,
        body: {
          requestId: crypto.randomUUID(),
          expectedRevision: saved.revision,
          operation,
          ...(value ? { adjustment: value } : {}),
        },
      });
    }
  }
  async function loadLatest() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      setComparison(await readState());
      setNotice("The latest saved proposal is below. Your edits are still kept above.");
    } catch {
      setError("We couldn’t load the latest step. Keep this tab open and retry.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function changeCourse() {
    if (
      locked ||
      (dirty && !window.confirm("Discard your unsaved step changes and change course context?"))
    )
      return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      adopt(await readState(course));
      setNotice(
        "Course context selected. Request a fresh suggestion to use it; an earlier accepted step is kept.",
      );
    } catch {
      setError("We couldn’t load that confirmed course. Choose no course or retry.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function more(kind: "courses" | "history") {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "courses") {
        const result = await fetch(`/api/learning-path/courses?page=${courses.nextPage}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        if (!result.ok) throw new Error("unavailable");
        const next: Courses = await result.json();
        setCourses({
          courses: [
            ...new Map([...courses.courses, ...next.courses].map((c) => [c.id, c])).values(),
          ],
          nextPage: next.nextPage,
        });
      } else {
        const next = await readState(saved.courseId ?? "none", history.at(-1)?.revision);
        setHistory((current) => [
          ...current,
          ...next.history.filter((row) => !current.some((item) => item.id === row.id)),
        ]);
        setMoreHistory(next.history.length === 20);
      }
    } catch {
      setError("We couldn’t load more saved records. Please retry.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="path-workspace">
      <div className="page-intro">
        <p className="eyebrow">A USEFUL NEXT STEP</p>
        <h1>A little room to move forward.</h1>
        <p>
          A suggestion drawn from your goal, observations and available time. You decide what fits.
        </p>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="form-error course-message" role="alert" tabIndex={-1} ref={errorBox}>
          <p>{error}</p>
          {error.includes("session expired") && (
            <a href="/sign-in" target="_blank" rel="noopener noreferrer" className="text-link">
              Sign in in a new tab
            </a>
          )}
          {conflict && (
            <button type="button" className="button secondary" disabled={busy} onClick={loadLatest}>
              Load latest to compare
            </button>
          )}
          {uncertain && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => pending.current && void send(pending.current)}
            >
              Retry same request
            </button>
          )}
        </div>
      )}
      <section className="form-section path-course" aria-label="Course context">
        <h2>Keep your course in view</h2>
        <p className="field-help">
          Only confirmed outlines guide a suggestion. Draft changes stay separate. A course is
          optional.
        </p>
        <div className="field">
          <label htmlFor="path-course">Course for the next suggestion</label>
          <select
            id="path-course"
            disabled={locked}
            value={course}
            onChange={(e) => setCourse(e.target.value)}
          >
            <option value="none">No course — use my goal and evidence</option>
            {saved.courseId && !courses.courses.some((c) => c.id === saved.courseId) && (
              <option value={saved.courseId}>
                {saved.latest?.context.course?.title ?? "Earlier course"} · saved context
              </option>
            )}
            {courses.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · confirmed v{c.revision}
              </option>
            ))}
          </select>
        </div>
        <div className="course-actions">
          <button
            type="button"
            className="button secondary"
            disabled={locked || course === (saved.courseId ?? "none")}
            onClick={changeCourse}
          >
            Use this context
          </button>
          {courses.nextPage !== null && (
            <button
              type="button"
              className="text-link"
              disabled={locked}
              onClick={() => void more("courses")}
            >
              Load more confirmed courses
            </button>
          )}
          <Link href="/courses" className="text-link">
            Review your courses
          </Link>
        </div>
      </section>
      {saved.active && (
        <section className="form-section path-active" aria-label="Your accepted step">
          <p className="eyebrow">YOUR ACCEPTED STEP</p>
          <h2>Ready when you are.</h2>
          <Link href="/practice" className="text-link">
            Try guided API-app practice
          </Link>
          <Link href="/mentor" className="text-link">
            Work through this with Meno
          </Link>
          <ProposalView record={saved.active} compact />
          <p className="field-help">
            Accepting saves your intention. It does not complete the task or award skill evidence.
          </p>
        </section>
      )}
      <section className="form-section path-proposal" aria-label="Latest proposal">
        <div className="section-title">
          <h2>{saved.latest ? "Review your next step" : "Start with one manageable step"}</h2>
          {saved.latest && (
            <span className="subtle-badge">{saved.latest.decision ?? "Awaiting your choice"}</span>
          )}
        </div>
        {!saved.latest && (
          <p className="section-description">
            You can start without a quiz or course. An unknown skill remains unassessed; this
            suggestion will not label it a gap.
          </p>
        )}
        {saved.latest && !saved.contextCurrent && (
          <p className="path-stale" role="status">
            This suggestion uses earlier context.{" "}
            {saved.contextAvailable
              ? "Your evidence, preferences or selected course changed."
              : "Its saved course is no longer available or confirmed."}{" "}
            Request a fresh suggestion before accepting or editing. Earlier evidence and your
            accepted step are kept.
          </p>
        )}
        {saved.latest && <ProposalView record={saved.latest} />}
        {editing && draft && (
          <form
            id="path-form"
            onSubmit={(e) => {
              e.preventDefault();
              act("edit");
            }}
            className="path-edit"
          >
            <h3 ref={draftHeading} tabIndex={-1}>
              Make this task fit
            </h3>
            <p className="field-help">
              Adjust the wording and time. The selected skill, observed evidence, resource and
              reasons stay attached. Saving creates a pending proposal; it does not replace your
              accepted step.
            </p>
            <fieldset disabled={locked}>
              <div className="field">
                <label htmlFor="step-title">Task title</label>
                <input
                  id="step-title"
                  required
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="step-time">Estimated minutes</label>
                <select
                  id="step-time"
                  value={draft.estimatedMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, estimatedMinutes: Number(e.target.value) as 5 | 15 | 25 })
                  }
                >
                  {[5, 15, 25].map((value) => (
                    <option key={value} value={value}>
                      {value} minutes
                    </option>
                  ))}
                </select>
              </div>
              {draft.steps.map((step, index) => (
                <div className="field path-edit-step" key={stepIds.current[index]}>
                  <label htmlFor={`step-${index}`}>Step {index + 1}</label>
                  <textarea
                    id={`step-${index}`}
                    required
                    maxLength={400}
                    rows={3}
                    value={step}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        steps: draft.steps.map((value, i) =>
                          i === index ? e.target.value : value,
                        ),
                      })
                    }
                  />
                  {draft.steps.length > 2 && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        stepIds.current = stepIds.current.filter((_, i) => i !== index);
                        setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) });
                      }}
                    >
                      Remove step {index + 1}
                    </button>
                  )}
                </div>
              ))}
              <div className="course-actions">
                {draft.steps.length < 4 && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      stepIds.current.push(crypto.randomUUID());
                      setDraft({ ...draft, steps: [...draft.steps, ""] });
                    }}
                  >
                    Add step
                  </button>
                )}
                <button className="button primary" type="submit" disabled={!dirty}>
                  Save adjusted proposal
                </button>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    if (!dirty || window.confirm("Discard your unsaved task changes?")) {
                      setEditing(false);
                      setDraft(adjustment(saved));
                      stepIds.current =
                        saved.latest?.proposal.steps.map(() => crypto.randomUUID()) ?? [];
                    }
                  }}
                >
                  Cancel adjustments
                </button>
              </div>
            </fieldset>
          </form>
        )}
        {!editing && pendingReview && (
          <div className="course-actions">
            <button
              type="button"
              className="button primary"
              disabled={locked || !saved.contextCurrent}
              onClick={() => setConfirm("accept")}
            >
              Accept this step
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={locked || !saved.contextCurrent}
              onClick={() => setEditing(true)}
            >
              Adjust this step
            </button>
            <button
              type="button"
              className="text-link"
              disabled={locked}
              onClick={() => setConfirm("decline")}
            >
              Decline this proposal
            </button>
          </div>
        )}
        {confirm && (
          <fieldset className="path-confirm" aria-label="Confirm your choice">
            <h3>
              {confirm === "accept" ? "Use this as your next step?" : "Leave this proposal aside?"}
            </h3>
            <p>
              {confirm === "accept"
                ? "This replaces your previously accepted step. Your earlier proposals, observations and course checkpoint are kept."
                : "Your accepted step, skill evidence and course checkpoint stay as they are. You can request another suggestion."}
            </p>
            <div className="course-actions">
              <button
                type="button"
                className="button primary"
                disabled={locked}
                onClick={() => act(confirm)}
              >
                {confirm === "accept" ? "Confirm and start" : "Confirm decline"}
              </button>
              <button
                type="button"
                className="text-link"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Keep reviewing
              </button>
            </div>
          </fieldset>
        )}
        <div className="path-refresh">
          <button
            type="button"
            className="button secondary"
            disabled={locked || !saved.contextAvailable}
            onClick={() => act("propose")}
          >
            {busy
              ? "Working…"
              : saved.latest
                ? "Request a fresh suggestion"
                : "Suggest a next step"}
          </button>
          <p className="field-help">
            A new suggestion stays pending. Your accepted step changes only when you confirm another
            one.
          </p>
        </div>
      </section>
      {comparison && (
        <section className="form-section conflict-review" aria-label="Latest saved comparison">
          <h2>Latest saved version</h2>
          <p>
            Your local adjustments are still above. Compare the skill, task and decision before
            replacing them.
          </p>
          {comparison.latest ? (
            <>
              <p className="field-help">
                v{comparison.revision} · {comparison.latest.decision ?? "Awaiting your choice"}
              </p>
              <ProposalView record={comparison.latest} compact />
            </>
          ) : (
            <p>No saved proposal for the current goal.</p>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              if (
                !dirty ||
                window.confirm("Discard your local adjustments and use the latest saved version?")
              ) {
                adopt(comparison);
                setError("");
                setNotice("Showing the latest saved version. Review it before deciding.");
              }
            }}
          >
            Replace my edits with saved version
          </button>
        </section>
      )}
      {!!history.length && (
        <section className="form-section" aria-label="Proposal history">
          <h2>Your steps, kept in view</h2>
          <p className="field-help">
            Recent first. Earlier proposals are history; only the latest pending proposal can be
            accepted.
          </p>
          {history.map((row) => (
            <details className="path-history" key={row.id}>
              <summary>
                v{row.revision} · {row.proposal.title}
                <span>
                  {row.decision ??
                    (row.revision === saved.revision ? "Awaiting your choice" : "Superseded")}{" "}
                  ·{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeZone: "Africa/Lagos",
                  }).format(new Date(row.createdAt))}
                  {row.revision === saved.activeRevision ? " · Current accepted step" : ""}
                </span>
              </summary>
              <ProposalView record={row} />
            </details>
          ))}
          {moreHistory && (
            <button
              type="button"
              className="text-link"
              disabled={busy || uncertain}
              onClick={() => void more("history")}
            >
              Load earlier proposals
            </button>
          )}
        </section>
      )}
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { mentorInputSchema } from "./mentor-schema";
import type { MentorWorkspace } from "./mentor-service";

type Courses = {
  courses: { id: string; title: string; revision: number }[];
  nextPage: number | null;
};
export function MentorWorkspaceView({
  initial,
  initialCourses,
}: {
  initial: MentorWorkspace;
  initialCourses: Courses;
}) {
  const [saved, setSaved] = useState(initial);
  const [question, setQuestion] = useState("");
  const [course, setCourse] = useState(initial.current.courseId ?? "none");
  const [courses, setCourses] = useState(initialCourses);
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [missingCourse, setMissingCourse] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const working = useRef(false);
  const pending = useRef<ReturnType<typeof mentorInputSchema.parse> | null>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const locked = busy || unverified || conflict;
  const current = saved.current.context;
  const active = current.acceptedStep;
  const occurrences = new Map<string, number>();
  const activeSteps =
    active?.proposal.steps.map((text) => {
      const n = occurrences.get(text) ?? 0;
      occurrences.set(text, n + 1);
      return { text, key: `${text}/${n}` };
    }) ?? [];
  useUnsavedWarning(
    question.trim().length > 0 || unverified || busy,
    "mentor-question",
    "You have an unsent or unverified question. Leave this page?",
  );
  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);
  async function load(selected = saved.current.courseId ?? "none", page = 0) {
    const response = await fetch(`/api/mentor?courseId=${selected}&page=${page}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if ([404, 409].includes(response.status)) throw new Error("course-context-unavailable");
    if (!response.ok) throw new Error("unavailable");
    return (await response.json()) as MentorWorkspace;
  }
  async function send(input: ReturnType<typeof mentorInputSchema.parse>) {
    if (working.current) return;
    working.current = true;
    pending.current = input;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/mentor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(35_000),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setUnverified(true);
          setError(
            "Your session expired. Keep this question here, sign in in a new tab, then retry the same request.",
          );
        } else if (response.status === 409) {
          setUnverified(false);
          setConflict(true);
          setError(
            "Your learning context changed. Your question is kept. Reload context before sending it again.",
          );
        } else if (
          response.status === 425 ||
          (response.status >= 500 && body.error?.code !== "AI_NOT_CONFIGURED")
        ) {
          setUnverified(true);
          setError(
            "We couldn’t verify this request yet. Your question is kept; retry the same request before making changes.",
          );
        } else {
          setUnverified(false);
          pending.current = null;
          setError(
            body.error?.message ?? "We couldn’t send this question. Your saved work is kept.",
          );
        }
        return;
      }
      if (body.status === "pending") {
        setUnverified(true);
        setError(
          "This question is still being checked. Retry the same request shortly; your saved step remains available.",
        );
        return;
      }
      const state = await load();
      setSaved(state);
      setQuestion("");
      setUnverified(false);
      setConflict(false);
      pending.current = null;
      setNotice(
        body.status === "ready"
          ? "Your explanation is saved. It is AI guidance, not a skill assessment."
          : "Your question is saved, but the mentor could not verify an explanation. Your accepted step and references are still available.",
      );
    } catch (failure) {
      if (failure instanceof Error && failure.message === "course-context-unavailable") {
        setMissingCourse(true);
        setUnverified(false);
        pending.current = null;
        setError(
          "The request was saved, but this course context is no longer available. Choose no course to view your saved conversation; your step and evidence are kept.",
        );
      } else {
        setUnverified(true);
        setError("We couldn’t verify this request. Keep this tab open and retry the same request.");
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const state = await load();
      setSaved(state);
      setConflict(false);
      setError("");
      pending.current = null;
      setNotice(
        "Context reloaded. Your question is still here; review the current step and course before sending.",
      );
    } catch {
      setError("We couldn’t reload context. Your question is still here.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function useCourse() {
    if (locked) return;
    working.current = true;
    setBusy(true);
    try {
      const state = await load(course);
      setSaved(state);
      setMissingCourse(false);
      setNotice("Course context selected. Your accepted step stays unchanged.");
      setError("");
    } catch {
      setError("We couldn’t load that confirmed course. Choose no course or retry.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  async function more(kind: "history" | "courses") {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      if (kind === "history") {
        const state = await load(saved.current.courseId ?? "none", saved.nextPage ?? 0);
        setSaved({
          ...saved,
          turns: [
            ...new Map([...saved.turns, ...state.turns].map((turn) => [turn.id, turn])).values(),
          ],
          nextPage: state.nextPage,
        });
      } else {
        const response = await fetch(`/api/learning-path/courses?page=${courses.nextPage}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) throw new Error("unavailable");
        const state: Courses = await response.json();
        setCourses({
          courses: [
            ...new Map(
              [...courses.courses, ...state.courses].map((course) => [course.id, course]),
            ).values(),
          ],
          nextPage: state.nextPage,
        });
      }
    } catch {
      setError("We couldn’t load more records. Please retry.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="mentor-workspace">
      <div className="page-intro">
        <p className="eyebrow">MENTORED HERE</p>
        <h1>Let’s work through this.</h1>
        <p>
          Bring the part that feels unclear. Meno uses your current goal, confirmed course and
          scoped observations to help you take a useful next step.
        </p>
      </div>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="form-error course-message" role="alert" ref={errorBox} tabIndex={-1}>
          <p>{error}</p>
          {missingCourse && (
            <Link href="/mentor?courseId=none" className="text-link">
              Continue without a course
            </Link>
          )}
          {error.includes("session expired") && (
            <a className="text-link" href="/sign-in" target="_blank" rel="noopener noreferrer">
              Sign in in a new tab
            </a>
          )}
          {unverified && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => pending.current && void send(pending.current)}
            >
              Retry same request
            </button>
          )}
          {conflict && (
            <button className="button secondary" type="button" disabled={busy} onClick={refresh}>
              Reload learning context
            </button>
          )}
        </div>
      )}
      <div className="mentor-grid">
        <section className="form-section mentor-question-panel">
          <h2>What would help right now?</h2>
          <p className="field-help">
            Ask for another explanation, a small example or a reference. Use permitted notes; keep
            passwords and sensitive personal details out of questions. Questions and relevant
            learning context go to the configured AI provider.
          </p>
          <form
            id="mentor-question"
            onSubmit={(event) => {
              event.preventDefault();
              if (locked) return;
              const input = mentorInputSchema.safeParse({
                requestId: crypto.randomUUID(),
                question,
                courseId: saved.current.courseId,
                expectedContextHash: saved.current.contextHash,
              });
              if (!input.success) {
                setError("Use a question of up to 2000 characters.");
                return;
              }
              void send(input.data);
            }}
          >
            <div className="field">
              <label htmlFor="mentor-question-text">Your question</label>
              <textarea
                id="mentor-question-text"
                rows={5}
                required
                maxLength={2000}
                disabled={locked}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </div>
            <button className="button primary" type="submit" disabled={locked || !question.trim()}>
              {busy ? "Checking…" : "Ask Meno"}
            </button>
          </form>
          <p className="field-help">
            AI explanations can be mistaken. Chat does not grade work, update evidence or change
            your accepted plan. Outline and mentor requests share the development AI limit.
          </p>
        </section>
        <aside className="form-section mentor-context" aria-label="Current learning context">
          <p className="eyebrow">YOUR DIRECTION</p>
          <h2>{current.learning.goal.desiredSkill}</h2>
          {active ? (
            <>
              <h3>Your accepted step</h3>
              <p>{active.proposal.title}</p>
              <ol>
                {activeSteps.map((step) => (
                  <li key={step.key}>{step.text}</li>
                ))}
              </ol>
              <p className="field-help">
                Saved intention, not completed work or assessed mastery.{" "}
                {active.courseId !== saved.current.courseId
                  ? "This accepted step comes from a different course context; it has not been replaced."
                  : ""}
              </p>
            </>
          ) : (
            <p className="field-help">You can ask for help before choosing a step.</p>
          )}
          <Link href="/learning-path" className="text-link">
            Review your next step
          </Link>
          <Link href="/practice" className="text-link">
            Open guided API-app practice
          </Link>
          <div className="field">
            <label htmlFor="mentor-course">Confirmed course for this conversation</label>
            <select
              id="mentor-course"
              disabled={locked}
              value={course}
              onChange={(event) => setCourse(event.target.value)}
            >
              <option value="none">No course — use my goal and observations</option>
              {saved.current.courseId &&
                !courses.courses.some((item) => item.id === saved.current.courseId) && (
                  <option value={saved.current.courseId}>
                    {current.learning.course?.title ?? "Saved class"}
                  </option>
                )}
              {courses.courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · confirmed v{item.revision}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button secondary"
            type="button"
            disabled={locked || course === (saved.current.courseId ?? "none")}
            onClick={useCourse}
          >
            Use this course context
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
          <p className="field-help">
            At most six confirmed modules and three recent conversation turns guide an explanation.
            Course topics and checkpoints are self-report; observed quiz/project findings keep their
            source and scope.
          </p>
          <details>
            <summary>References you can use now</summary>
            {!current.learning.resources.length && (
              <p className="field-help">
                No reviewed references are available right now. Use permitted course notes or your
                accepted step.
              </p>
            )}
            {current.learning.resources.map((resource) => (
              <p key={resource.id}>
                <a
                  className="text-link"
                  href={resource.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {resource.title} ↗
                </a>
                <span className="field-help">
                  English text · checked {resource.checkedAt} · download size and reading time
                  unknown. Own notes are an alternative.
                </span>
              </p>
            ))}
          </details>
        </aside>
        <section
          className="form-section mentor-history-panel"
          aria-label="Saved mentor conversation"
        >
          <h2>Your conversation, kept here</h2>
          {!saved.turns.length && (
            <p className="field-help">
              Saved questions and explanations will appear here. Your course and accepted step are
              available even when AI help is unavailable.
            </p>
          )}
          {saved.turns.map((turn) => (
            <article className="mentor-turn" key={turn.id}>
              <p className="eyebrow">
                YOU ·{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Lagos",
                }).format(new Date(turn.createdAt))}{" "}
                (Lagos)
              </p>
              <h3 className="preserve-lines">{turn.question}</h3>
              {!turn.contextCurrent && (
                <p className="field-help">
                  Earlier learning context is preserved with this conversation; your current
                  preferences or step have changed.
                </p>
              )}
              {turn.result ? (
                <>
                  <p className="eyebrow">MENO · AI EXPLANATION</p>
                  <p className="field-help">
                    {turn.policyVersion} · {turn.model}
                  </p>
                  <p className="preserve-lines">{turn.result.reply}</p>
                  <p className="field-help">Why this help: {turn.result.rationale}</p>
                  {turn.result.resourceIds.map((id) => {
                    const resource = turn.context.learning.resources.find((item) => item.id === id);
                    return resource ? (
                      <p key={id}>
                        <a
                          className="text-link"
                          href={resource.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {resource.title} ↗
                        </a>
                        <span className="field-help">
                          English text · checked {resource.checkedAt} · review due{" "}
                          {resource.reviewAfter} · size/reading time unknown.
                        </span>
                      </p>
                    ) : null;
                  })}
                  {turn.result.evidenceIds.map((id) => {
                    const skill = turn.context.learning.skills.find(
                      (item) => item.evidence?.id === id,
                    );
                    return skill ? (
                      <p className="field-help" key={id}>
                        {skill.name}: {skill.evidence?.scope} ·{" "}
                        {skill.evidence?.kind.replaceAll("_", " ")}
                      </p>
                    ) : null;
                  })}
                  <details>
                    <summary>Limits of this explanation</summary>
                    <ul>
                      {turn.result.limitations.map((limit) => (
                        <li key={limit}>{limit}</li>
                      ))}
                    </ul>
                  </details>
                </>
              ) : (
                <>
                  <p className="field-help">
                    {turn.status === "pending"
                      ? "This question is still pending. Check the original request before sending another."
                      : "No verified explanation was saved. Your question is kept; use your step or references, or ask again later."}
                  </p>
                  {turn.status === "pending" && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={locked}
                      onClick={() => {
                        if (
                          question.trim() &&
                          !window.confirm(
                            "Replace your unsent question with this saved pending request?",
                          )
                        )
                          return;
                        setQuestion(turn.question);
                        void send({
                          requestId: turn.id,
                          question: turn.question,
                          courseId: turn.courseId,
                          expectedContextHash: turn.requestContextHash,
                        });
                      }}
                    >
                      Check saved request
                    </button>
                  )}
                </>
              )}
            </article>
          ))}
          {saved.nextPage !== null && (
            <button
              type="button"
              className="text-link"
              disabled={locked}
              onClick={() => void more("history")}
            >
              Load earlier conversations
            </button>
          )}
        </section>
      </div>
    </div>
  );
}

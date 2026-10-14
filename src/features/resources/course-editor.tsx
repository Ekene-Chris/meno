"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { courseInputSchema, courseMutationResultSchema, type CourseInput } from "./course-schema";
import { emptyCourse, statusLabel, type CourseRecord, type CourseSkill } from "./course-view";
import { CourseFields } from "./course-fields";
import { CoursePreview } from "./course-preview";

export function CourseEditor({
  initial,
  skills,
}: {
  initial: CourseRecord | null;
  skills: CourseSkill[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState<CourseInput>(initial?.draft.content ?? emptyCourse);
  const [editing, setEditing] = useState(!initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<CourseRecord | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const working = useRef(false);
  const allowLeave = useRef(false);
  const errorBox = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty =
    editing && JSON.stringify(form) !== JSON.stringify(saved?.draft.content ?? emptyCourse);
  const guarded = dirty || uncertain || busy;

  useEffect(() => {
    if (error) errorBox.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!guarded) return;
    const warning = "You have unsaved or unverified course changes. Leave this page?";
    function unload(event: BeforeUnloadEvent) {
      if (!allowLeave.current) event.preventDefault();
    }
    function click(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !link ||
        link.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        allowLeave.current
      )
        return;
      // Same-page anchors, including the skip link, do not discard the form.
      if (
        link.origin === window.location.origin &&
        link.pathname === window.location.pathname &&
        link.search === window.location.search
      )
        return;
      if (!window.confirm(warning)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function submit(event: SubmitEvent) {
      if (
        event.target instanceof HTMLFormElement &&
        event.target.id !== "course-form" &&
        !allowLeave.current &&
        !window.confirm(warning)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [guarded]);

  function cancel() {
    if (
      dirty &&
      !window.confirm("Discard your unsaved edits? Your saved course will stay as it is.")
    )
      return;
    if (!saved) {
      allowLeave.current = true;
      router.push("/courses");
      return;
    }
    setForm(saved.draft.content);
    setEditing(false);
    setError("");
    setConflict(false);
    setLatest(null);
    setNotice("Unsaved edits discarded. Your saved course is unchanged.");
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function mutate(operation: "save" | "confirm") {
    if (working.current) return;
    const parsed = courseInputSchema.safeParse(form);
    if (operation === "save" && !parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue.path.join(" → ").replaceAll("_", " ");
      setError(`Check ${field || "your course"}: ${issue.message}`);
      return;
    }
    if (operation === "confirm" && !saved) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const url =
      operation === "confirm"
        ? `/api/courses/${saved?.id}/confirm`
        : saved
          ? `/api/courses/${saved.id}`
          : "/api/courses";
    const method = operation === "save" && saved ? "PUT" : "POST";
    const payload =
      operation === "save"
        ? { course: parsed.data, ...(saved ? { expectedRevision: saved.revision } : {}) }
        : { expectedRevision: saved?.revision };
    const key = JSON.stringify({ url, method, payload });
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    let navigating = false;
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestId: attempt.current.id }),
      });
      if (!response.ok) {
        if (response.status >= 500) throw new Error("unverified");
        setUncertain(false);
        if (response.status === 409) {
          setConflict(true);
          setError(
            "This course changed in another tab or session. Your edits are still here. Load the latest saved version to compare before trying again.",
          );
        } else if (response.status === 401) {
          setError(
            "Your session expired. Sign in in a new tab, then return here and retry. Keep this tab open to preserve your edits.",
          );
        } else if (response.status === 404) {
          setError(
            "This saved course is no longer available to your account. Your edits are still here; check that you’re signed in to the right account.",
          );
        } else {
          setError(
            "We couldn’t save these details. Check the course URL, module titles, topics, and checkpoint, then try again.",
          );
        }
        return;
      }
      const receipt = courseMutationResultSchema.parse(await response.json());
      // A retry can return an older receipt. Read current state before presenting
      // a confirmation or enabling another edit; never treat that receipt as latest.
      const current = await fetch(`/api/courses/${receipt.courseId}`, { cache: "no-store" });
      if (!current.ok) throw new Error("unverified");
      const record: CourseRecord = await current.json();
      if (!saved) {
        // Keep the new-course form locked until the saved route mounts. Showing
        // an editable review here can lose edits when the pending navigation ends.
        navigating = true;
        allowLeave.current = true;
        router.replace(`/courses/${receipt.courseId}`);
        return;
      }
      setSaved(record);
      setForm(record.draft.content);
      setEditing(false);
      setNotice(
        record.revision !== receipt.revision
          ? "Your save succeeded. A newer draft was saved in another session; review it below before confirming."
          : operation === "save"
            ? "Draft saved. Review the details below before confirming."
            : "Course confirmed. Your topics and checkpoint are saved for your return.",
      );
      setUncertain(false);
      setConflict(false);
      setLatest(null);
      attempt.current = null;
      router.refresh();
      requestAnimationFrame(() => heading.current?.focus());
    } catch {
      setUncertain(true);
      setError(
        "We couldn’t verify the save. Your input is still here. Retry the same request to check its result before making more changes.",
      );
    } finally {
      if (!navigating) {
        working.current = false;
        setBusy(false);
      }
    }
  }

  async function loadLatest() {
    if (!saved || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/courses/${saved.id}`, { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const record: CourseRecord = await response.json();
      if (editing) {
        setLatest(record);
        setNotice("Latest saved version loaded below. Your unsaved edits are unchanged.");
      } else {
        setSaved(record);
        setForm(record.draft.content);
        setConflict(false);
        setError("");
        setNotice("Latest version loaded. Review it before confirming.");
      }
    } catch {
      setError(
        "We couldn’t load the latest course. Your edits are still here. Check your connection and try again.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const canConfirm =
    saved &&
    saved.draft.content.modules.length > 0 &&
    saved.draft.content.modules.every((module) => module.topics.length > 0);
  return (
    <div className="course-workspace">
      <Link href="/courses" className="text-link course-back">
        <ArrowLeft size={16} aria-hidden="true" /> My courses
      </Link>
      <div className="page-intro course-intro">
        <div>
          <p className="eyebrow">
            {editing
              ? saved
                ? "EDIT YOUR COURSE"
                : "BRING YOUR LEARNING WITH YOU"
              : saved?.status === "confirmed"
                ? "READY FOR YOUR RETURN"
                : "REVIEW YOUR SAVED DRAFT"}
          </p>
          <h1 ref={heading} tabIndex={-1}>
            {editing
              ? saved
                ? "Make it your own."
                : "Keep going from here."
              : saved?.draft.content.title}
          </h1>
          <p>
            {editing
              ? "Add what you’re learning and where you paused. You can save a draft and come back."
              : "Your course order and your place, kept together."}
          </p>
        </div>
        {saved && (
          <span className="course-status">
            {statusLabel(saved.revision, saved.confirmedRevision)} · v{saved.revision}
          </span>
        )}
      </div>
      {notice && (
        <p role="status" className="form-notice">
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" tabIndex={-1} ref={errorBox} className="form-error course-message">
          <p>{error}</p>
          {error.includes("session expired") && (
            <a href="/sign-in" target="_blank" rel="noopener noreferrer" className="text-link">
              Sign in in a new tab
            </a>
          )}
          {conflict && (
            <button type="button" className="button secondary" disabled={busy} onClick={loadLatest}>
              {busy ? "Loading…" : "Load latest saved version"}
            </button>
          )}
        </div>
      )}
      {latest && editing && (
        <section className="form-section conflict-review" aria-label="Latest saved version">
          <p className="eyebrow">COMPARE BEFORE SAVING</p>
          <h2>
            {latest.draft.content.title} · Version {latest.revision}
          </h2>
          <p className="course-footnote">
            Your edits remain in the form below. Keeping them will replace this draft when you save;
            the last confirmed version stays intact until you confirm again.
          </p>
          <CoursePreview content={latest.draft.content} skills={skills} />
          <div className="course-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                setSaved(latest);
                setLatest(null);
                setConflict(false);
                setError("");
                attempt.current = null;
                setNotice("Your edits are kept. Review the form, then save a new draft.");
              }}
            >
              Keep my edits over version {latest.revision}
            </button>
            <button
              className="text-link"
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Discard your unsaved edits and use the latest saved version?"))
                  return;
                setSaved(latest);
                setForm(latest.draft.content);
                setLatest(null);
                setConflict(false);
                setError("");
                setEditing(false);
                attempt.current = null;
                setNotice("Latest saved version restored.");
              }}
            >
              Use saved version
            </button>
          </div>
        </section>
      )}
      {editing ? (
        <form
          id="course-form"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate("save");
          }}
        >
          <fieldset className="form-controls" disabled={busy || uncertain}>
            <legend className="sr-only">Course details</legend>
            <CourseFields
              value={form}
              onChange={(value) => {
                setForm(value);
                setNotice("");
                if (!conflict) setError("");
              }}
              skills={skills}
            />
          </fieldset>
          <div className="course-save-bar">
            <p>
              {uncertain
                ? "Retry to verify your last save."
                : dirty
                  ? "Unsaved changes"
                  : saved
                    ? "No unsaved changes"
                    : "Only you can see this course."}
            </p>
            <div className="course-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || uncertain}
                onClick={cancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy || conflict || (!!saved && !dirty && !uncertain)}
              >
                {busy ? "Saving…" : uncertain ? "Retry save" : "Save draft & review"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        saved && (
          <>
            <section className="form-section course-review" aria-label="Saved course review">
              <div className="course-review-heading">
                <h2>
                  {saved.status === "confirmed"
                    ? "Your confirmed course"
                    : "Check your course details"}
                </h2>
                <button
                  type="button"
                  className="text-link"
                  disabled={busy || uncertain}
                  onClick={() => {
                    setForm(saved.draft.content);
                    setEditing(true);
                    setError("");
                    setNotice("");
                    setConflict(false);
                    allowLeave.current = false;
                  }}
                >
                  <Pencil size={15} aria-hidden="true" /> Edit course
                </button>
              </div>
              <CoursePreview content={saved.draft.content} skills={skills} />
            </section>
            {saved.status !== "confirmed" ? (
              <section className="course-confirm-panel">
                <h2>Does this reflect your course?</h2>
                <p>
                  Confirm these topics and your checkpoint as your course context. This doesn’t
                  assess your skills or mark anything complete.
                </p>
                {!canConfirm && (
                  <p className="form-notice">
                    Add at least one module and a topic in every module before confirming. Unmapped
                    topics are welcome.
                  </p>
                )}
                <button
                  className="button primary"
                  type="button"
                  disabled={busy || conflict || !canConfirm}
                  onClick={() => void mutate("confirm")}
                >
                  {busy
                    ? "Confirming…"
                    : uncertain
                      ? "Retry confirmation"
                      : "Confirm course context"}
                </button>
              </section>
            ) : (
              <div className="course-confirm-panel">
                <h2>
                  <Check size={20} aria-hidden="true" /> Your place is saved.
                </h2>
                <p>
                  Return here whenever you’re ready. Skill checks and mentor guidance are coming
                  next.
                </p>
                <Link className="text-link" href="/dashboard">
                  Back to your Passport
                </Link>
              </div>
            )}
            {saved.confirmed && saved.confirmedRevision !== saved.revision && (
              <details className="form-section previous-confirmation">
                <summary>Previously confirmed · Version {saved.confirmedRevision}</summary>
                <h2>{saved.confirmed.content.title}</h2>
                <CoursePreview content={saved.confirmed.content} skills={skills} />
              </details>
            )}
          </>
        )
      )}
    </div>
  );
}

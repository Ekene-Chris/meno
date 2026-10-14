"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { pathReceiptSchema } from "@/features/learning-paths/schema";
import { ProposalView } from "@/features/learning-paths/proposal-view";
import type { CheckInWorkspace } from "./check-in-service";
import { obstacles, type CheckInInput } from "./check-in-schema";

export function CheckInView({ initial }: { initial: CheckInWorkspace }) {
  const [obstacle, setObstacle] = useState<CheckInInput["obstacle"]>("time");
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef<CheckInInput | null>(null);
  const working = useRef(false);
  const active = initial.state.active;
  const blocked = !active || initial.state.latest?.decision === null;
  useUnsavedWarning(
    busy || uncertain,
    "check-in-form",
    "Your check-in hasn't been verified. Leave this page?",
  );
  async function submit() {
    if (working.current || blocked || saved || conflict || !active) return;
    working.current = true;
    setBusy(true);
    setError("");
    pending.current ??= {
      requestId: crypto.randomUUID(),
      expectedRevision: initial.state.revision,
      acceptedProposalId: active.id,
      source: demo ? "demo_pause" : "user_report",
      obstacle: demo ? "returning" : obstacle,
    };
    try {
      const response = await fetch("/api/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(true);
          setUncertain(false);
        } else if (response.status >= 500 || response.status === 401) setUncertain(true);
        else {
          setUncertain(false);
          pending.current = null;
        }
        setError(body.error?.message ?? "We couldn't verify this check-in.");
        return;
      }
      pathReceiptSchema.parse(body);
      setSaved(true);
      setUncertain(false);
      pending.current = null;
    } catch (failure) {
      setUncertain(true);
      setError(
        failure instanceof Error
          ? failure.message
          : "We couldn't verify this check-in. Retry the same request.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">YOUR PACE, YOUR CHOICE</p>
        <h1>A smaller return.</h1>
        <p>
          A pause doesn't erase what you learned. Tell us what would help today, or skip this
          check-in. No personal explanation is needed.
        </p>
      </div>
      {active && (
        <section className="form-section" aria-label="Step kept while you check in">
          <h2>Your accepted step stays active.</h2>
          <ProposalView record={active} compact />
        </section>
      )}
      {saved ? (
        <section className="form-section" role="status">
          <h2>Your smaller proposal is saved.</h2>
          <p>
            {demo
              ? "DEMO DATA — SIMULATED INACTIVITY. You selected this simulation; Meno did not detect a missed session."
              : "Your obstacle is saved as a self-report, not an assessment of your ability."}{" "}
            Saving a check-in does not activate a step. Open My next step to review the current
            proposal and choose whether to accept, edit or decline it.
          </p>
          <Link className="button primary" href="/learning-path">
            Review the recovery proposal
          </Link>
        </section>
      ) : blocked ? (
        <section className="form-section">
          <h2>
            {active
              ? "Review your pending proposal first."
              : "Choose a first step before checking in."}
          </h2>
          <p>Your previous work stays available.</p>
          <Link className="button primary" href="/learning-path">
            Open My next step
          </Link>
        </section>
      ) : (
        <form
          id="check-in-form"
          className="form-section"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h2>What would make today easier?</h2>
          <fieldset disabled={busy || uncertain || conflict}>
            <label className="field-label" htmlFor="obstacle">
              Learning obstacle
            </label>
            <select
              id="obstacle"
              value={obstacle}
              disabled={demo}
              onChange={(event) => setObstacle(event.target.value as CheckInInput["obstacle"])}
            >
              {Object.entries(obstacles).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="field-help">
              We'll offer a five-minute partial activity using your current evidence and the course
              behind your accepted step. This may target a different gap if your observations
              changed. It does not restart your course.
            </p>
            <label className="check-in-choice">
              <input
                type="checkbox"
                checked={demo}
                onChange={(event) => setDemo(event.target.checked)}
              />{" "}
              Simulate a pause for the demo
            </label>
            {demo && (
              <p className="demo-label">
                DEMO DATA — SIMULATED INACTIVITY. This deliberately simulates a return after a
                pause; no absence was detected.
              </p>
            )}
          </fieldset>
          {error && (
            <div role="alert">
              <p>{error}</p>
              {uncertain && (
                <p>
                  Your request is kept unchanged. If your session expired,{" "}
                  <a
                    className="text-link"
                    href="/sign-in"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    sign in in a new tab
                  </a>
                  , then retry here.
                </p>
              )}
              {conflict && (
                <Link href="/learning-path" className="text-link">
                  Compare the latest saved step
                </Link>
              )}
            </div>
          )}
          <button className="button primary" type="submit" disabled={busy || conflict}>
            {busy
              ? "Saving…"
              : uncertain
                ? "Retry the same check-in"
                : "Propose a five-minute return"}
          </button>
          <p>
            <Link href="/journey" className="text-link">
              No obstacle today / skip check-in
            </Link>
          </p>
        </form>
      )}
      {!!initial.history.length && (
        <section className="form-section">
          <h2>Recent check-ins</h2>
          <p className="field-help">
            Your ten most recent reports. These are historical choices, not newly detected events.
          </p>
          {initial.history.map((item) => (
            <div key={item.id} className="path-observation">
              <strong>
                {item.source === "demo_pause" ? "DEMO DATA — SIMULATED INACTIVITY" : "SELF-REPORT"}
              </strong>
              <p>
                {obstacles[item.obstacle]} · {item.createdAt.slice(0, 10)}
              </p>
              <p className="field-help">
                Recovery proposal retained in My next step history. A saved check-in does not mean
                that you accepted or completed it.
              </p>
            </div>
          ))}
        </section>
      )}
      <p className="field-help">
        Only in-app check-ins are available. Scheduled reminders and automatic inactivity detection
        are not running.
      </p>
    </>
  );
}

"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { opportunityEntrySchema, savedReceiptSchema, type OpportunityEntry } from "./schema";
import { compareRequirement, gapAction } from "./comparison";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
type Save = { requestId: string; expectedSaved: boolean; saved: boolean };
export function OpportunityView({ initial }: { initial: OpportunityEntry }) {
  const [entry, setEntry] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const pending = useRef<Save | null>(null);
  const working = useRef(false);
  useUnsavedWarning(
    frozen,
    "opportunity-form",
    "This save is unverified. Leave and check the saved result later?",
  );
  async function load() {
    const res = await fetch(`/api/opportunities/${entry.opportunity.id}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw Error("unverified");
    return opportunityEntrySchema.parse(await res.json());
  }
  async function save(body: Save) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setFrozen(true);
    setMessage("");
    pending.current = body;
    let verified = false;
    try {
      const res = await fetch(`/api/opportunities/${entry.opportunity.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 401) {
        setMessage("Your session expired. Sign in in a new tab, then retry the same save.");
        return;
      }
      if (res.status === 409) {
        verified = true;
        setConflict(true);
        setMessage(
          "Another session changed the saved state. Reload the saved comparison before choosing again.",
        );
        return;
      }
      if (!res.ok) {
        if (res.status >= 500) throw Error("unverified");
        verified = true;
        setMessage("This request was rejected; your previous saved state is kept.");
        return;
      }
      savedReceiptSchema.parse(await res.json());
      setEntry(await load());
      verified = true;
      setMessage(
        "Save request verified. The current saved state and evidence comparison are shown below.",
      );
    } catch {
      setMessage(
        "We couldn’t verify this save. Retry the same request before making another change.",
      );
    } finally {
      if (verified) {
        setFrozen(false);
        pending.current = null;
      }
      setBusy(false);
      working.current = false;
    }
  }
  async function reload() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      setEntry(await load());
      setConflict(false);
      setMessage("Latest saved comparison loaded.");
    } catch {
      setMessage("We couldn’t load the latest comparison. Retry when connected.");
    } finally {
      setBusy(false);
      working.current = false;
    }
  }
  return (
    <>
      <div className="page-intro">
        <p className="eyebrow">OPPORTUNITY RADAR</p>
        <p className="demo-label">DEMO — NOT A LIVE LISTING</p>
        <h1>{entry.opportunity.title}</h1>
        <p>{entry.opportunity.description}</p>
      </div>
      <div className="course-actions">
        <Link href="/opportunities" className="text-link">
          All example opportunities
        </Link>
        <Link href="/journey" className="text-link">
          Your full journey
        </Link>
        <Link href="/dashboard" className="text-link">
          Inspect Passport evidence
        </Link>
      </div>
      <section className="form-section">
        <h2>An example direction, with honest limits.</h2>
        <p>
          {entry.opportunity.organization} · {entry.opportunity.kind}. No source, application,
          deadline or location has been provided because this is fictional.
        </p>
        <p>
          No readiness score or hiring promise. Real opportunities decide their own eligibility;
          Meno does not grant or deny permission to apply.
        </p>
        <ul>
          {entry.opportunity.eligibility.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <p>
          Saved comparisons retain only your scoped skill observations, privately. Saving does not
          submit an application, create skill evidence or change your plan.
        </p>
        <button
          className="button secondary"
          type="button"
          disabled={busy || conflict}
          onClick={() => {
            const body = frozen
              ? pending.current
              : {
                  requestId: crypto.randomUUID(),
                  expectedSaved: !!entry.saved,
                  saved: !entry.saved,
                };
            if (body) void save(body);
          }}
        >
          {busy
            ? "Checking…"
            : frozen
              ? "Retry the same save"
              : entry.saved
                ? "Remove saved example"
                : "Save example and baseline"}
        </button>
        {entry.saved && (
          <p className="field-help">
            Saved{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeZone: "Africa/Lagos",
            }).format(new Date(entry.saved.savedAt))}
            . “Since saved” compares this baseline with current evidence; removing and saving again
            starts a new baseline.
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {conflict && (
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => void reload()}
          >
            Reload saved comparison
          </button>
        )}
        {frozen && (
          <a href="/sign-in" target="_blank" rel="noopener noreferrer">
            Sign in in a new tab
          </a>
        )}
      </section>
      {(["required", "preferred"] as const).map((priority) => (
        <section
          className="form-section"
          key={priority}
          aria-label={`${priority} example requirements`}
        >
          <h2>
            {priority === "required" ? "Required in this example" : "Preferred in this example"}
          </h2>
          {entry.requirements
            .filter((r) => r.priority === priority)
            .map((r) => {
              const current = compareRequirement(r, entry.observations);
              const old = entry.saved ? compareRequirement(r, entry.saved.baseline) : null;
              const action = gapAction(r.skillId);
              const sourceChanged =
                old?.observation?.evidenceId !== current.observation?.evidenceId;
              return (
                <article className="practical-feedback" key={r.id} data-requirement={r.id}>
                  <h3>{r.title}</h3>
                  <p className="field-help">
                    {r.skillId} ·{" "}
                    {r.evidenceLevel === "guided_foundation"
                      ? "Guided preparation criterion"
                      : "Independent project criterion"}
                  </p>
                  <p>{r.description}</p>
                  <strong>{current.label}</strong>
                  <p>{current.explanation}</p>
                  {old && (
                    <p className="opportunity-change">
                      Since saved: {old.label} → {current.label}.
                      {sourceChanged && old.state === current.state
                        ? " A new scoped observation is recorded; this requirement status is unchanged."
                        : !sourceChanged && old.state === current.state
                          ? " No relevant evidence change."
                          : ""}
                    </p>
                  )}
                  {current.observation?.evidenceId && (
                    <div className="skill-evidence">
                      <p>
                        {current.observation.scope ??
                          "Scope not recorded; this source cannot establish a complete requirement."}
                      </p>
                      <p className="field-help">
                        {current.observation.method === "guided_scaffold"
                          ? "Guided scaffold observation"
                          : current.observation.kind?.replaceAll("_", " ")}{" "}
                        · {current.observation.rubricVersion ?? "Version unspecified"} ·{" "}
                        {current.observation.outcome?.replaceAll("_", " ")}
                      </p>
                      {current.observation.attemptId && (
                        <Link
                          className="text-link"
                          href={`/${current.observation.method === "guided_scaffold" ? "practice" : "assessment"}/${current.observation.attemptId}`}
                        >
                          Review the source observation
                        </Link>
                      )}
                    </div>
                  )}
                  {!current.met && (
                    <div>
                      <Link className="text-link" href={action.href}>
                        {action.label}
                      </Link>
                      <p className="field-help">{action.note}</p>
                    </div>
                  )}
                </article>
              );
            })}
        </section>
      ))}
      <section className="form-section">
        <h2>One useful next move</h2>
        <p>
          Build evidence for one gap at a time. Your existing course, accepted step and stronger
          observations stay intact.
        </p>
        <Link className="button primary" href="/learning-path">
          Review your next learning step
        </Link>
      </section>
    </>
  );
}

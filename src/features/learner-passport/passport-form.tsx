"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { entryStates, passportSchema, type PassportInput } from "./schema";

export function PassportForm({ initial, editing }: { initial?: PassportInput; editing: boolean }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requestId = useRef<string | null>(null);
  const router = useRouter();

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const result = passportSchema.safeParse({
      display_name: text("display_name"),
      entry_state: text("entry_state"),
      desired_skill: text("desired_skill"),
      target_role: text("target_role"),
      motivation: text("motivation"),
      study_minutes_per_week: text("study_minutes_per_week")
        ? Number(text("study_minutes_per_week"))
        : null,
      device: text("device") || null,
      bandwidth: text("bandwidth") || null,
      locale: text("locale"),
    });
    if (!result.success) {
      setError("Choose where you are in your journey and check your goal and preferences.");
      return;
    }
    requestId.current ??= crypto.randomUUID();
    setPending(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passport: result.data, requestId: requestId.current }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "We couldn't save your changes. Please try again.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(
        "We couldn't confirm the save. Check your connection and retry; retrying won't duplicate your Passport.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onChange={() => {
        requestId.current = null;
      }}
      className="passport-form"
    >
      <fieldset className="form-controls" disabled={pending}>
        <legend className="sr-only">Your learning context</legend>
        <section className="form-section">
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <h2>Where are you right now?</h2>
              <p>You can change this as your journey changes.</p>
            </div>
          </div>
          <fieldset className="entry-grid">
            <legend className="sr-only">Current learning situation</legend>
            {entryStates.map((entry) => (
              <label className="entry-option" key={entry.value}>
                <input
                  type="radio"
                  name="entry_state"
                  value={entry.value}
                  required
                  defaultChecked={initial?.entry_state === entry.value}
                />
                <span>
                  <strong>{entry.title}</strong>
                  <span>{entry.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>
        <section className="form-section">
          <div className="section-heading">
            <span className="step-number">02</span>
            <div>
              <h2>What are you working toward?</h2>
              <p>A little context today. Room to change direction tomorrow.</p>
            </div>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="display_name">
                What should we call you? <span>Optional</span>
              </label>
              <input
                id="display_name"
                name="display_name"
                maxLength={60}
                autoComplete="given-name"
                defaultValue={initial?.display_name ?? ""}
                placeholder="Your first name"
              />
            </div>
            <div className="field">
              <label htmlFor="desired_skill">Skill you want to develop</label>
              <input
                id="desired_skill"
                name="desired_skill"
                minLength={2}
                maxLength={120}
                required
                defaultValue={initial?.desired_skill ?? ""}
                placeholder="For example, JavaScript"
              />
            </div>
            <div className="field wide">
              <label htmlFor="target_role">
                A role or outcome you have in mind <span>Optional</span>
              </label>
              <input
                id="target_role"
                name="target_role"
                maxLength={120}
                defaultValue={initial?.target_role ?? ""}
                placeholder="For example, build a website or explore frontend roles"
              />
            </div>
            <div className="field wide">
              <label htmlFor="motivation">
                What makes this goal matter to you? <span>Optional</span>
              </label>
              <textarea
                id="motivation"
                name="motivation"
                rows={3}
                maxLength={500}
                defaultValue={initial?.motivation ?? ""}
                placeholder="Share only what you're comfortable saving."
              />
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="section-heading">
            <span className="step-number">03</span>
            <div>
              <h2>Make room for real life</h2>
              <p>These preferences are optional. Pick what feels realistic.</p>
            </div>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="study_minutes_per_week">
                Study minutes per week <span>Optional</span>
              </label>
              <input
                id="study_minutes_per_week"
                name="study_minutes_per_week"
                type="number"
                inputMode="numeric"
                min={15}
                max={2400}
                step={1}
                defaultValue={initial?.study_minutes_per_week ?? ""}
                placeholder="For example, 90"
              />
              <p className="field-hint">A starting estimate, not a commitment.</p>
            </div>
            <div className="field">
              <label htmlFor="device">
                Main learning device <span>Optional</span>
              </label>
              <select id="device" name="device" defaultValue={initial?.device ?? ""}>
                <option value="">Prefer not to say</option>
                <option value="phone">Phone</option>
                <option value="computer">Computer</option>
                <option value="shared">Shared device</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="bandwidth">
                Internet access <span>Optional</span>
              </label>
              <select id="bandwidth" name="bandwidth" defaultValue={initial?.bandwidth ?? ""}>
                <option value="">Prefer not to say</option>
                <option value="limited">Limited or unreliable</option>
                <option value="reliable">Usually reliable</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="locale">Preferred language</label>
              <select id="locale" name="locale" defaultValue={initial?.locale ?? "en"}>
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="pt">Portuguese</option>
                <option value="ar">Arabic</option>
              </select>
              <p className="field-hint">
                This version is in English. We’ll remember your preference.
              </p>
            </div>
          </div>
        </section>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-bottom">
        <p>
          <LockKeyhole size={15} aria-hidden="true" /> Saved privately to your account.
        </p>
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Saving your context…" : editing ? "Save changes" : "Create my Passport"}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

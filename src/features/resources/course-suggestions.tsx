"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { outlineRequestSchema, outlineResponseSchema } from "./outline-schema";
import type { ExtractionResult } from "@/lib/ai/extraction-schema";
import type { CourseInput } from "./course-schema";
import type { CourseRecord, CourseSkill } from "./course-view";

export function CourseSuggestions({
  value,
  saved,
  skills,
  onApply,
}: {
  value: CourseInput;
  saved: CourseRecord | null;
  skills: CourseSkill[];
  onApply: (value: CourseInput) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(false);
  const [proposal, setProposal] = useState<{ key: string; result: ExtractionResult } | null>(null);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const working = useRef(false);
  const source = {
    courseId: saved?.id ?? null,
    expectedRevision: saved?.revision ?? 0,
    expectedConfirmedRevision: saved?.confirmedRevision ?? null,
    title: value.title.trim(),
    outline: value.outline.trim(),
  };
  const key = JSON.stringify(source);
  const current = proposal?.key === key ? proposal.result : null;
  async function suggest() {
    if (working.current) return;
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    const parsed = outlineRequestSchema.safeParse({ ...source, requestId: attempt.current.id });
    if (!parsed.success) {
      setError(
        "Add a course title and at least 20 characters of outline text first. Long outlines may need shortening.",
      );
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40_000);
    try {
      const response = await fetch("/api/courses/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      if (!response.ok) {
        const failure = await response.json();
        const code = failure.error?.code;
        // Ambiguous network/accounting failures keep the ID. Terminal provider failures
        // need a deliberate new attempt; retry never automatically charges again.
        const sameAttempt =
          ["AI_IN_PROGRESS", "AI_RESULT_UNVERIFIED", "UNAVAILABLE"].includes(code) || !code;
        setRetry(sameAttempt);
        if (!sameAttempt) attempt.current = null;
        setError(
          typeof failure.error?.message === "string"
            ? failure.error.message
            : "Suggestions could not be checked. Your topics are unchanged.",
        );
        return;
      }
      const receipt = outlineResponseSchema.parse(await response.json());
      if (receipt.requestId !== parsed.data.requestId) throw new Error("Wrong receipt");
      if (
        receipt.result.modules.some((module) =>
          module.topics.some(
            (topic) =>
              topic.skill_id !== null && !skills.some((skill) => skill.id === topic.skill_id),
          ),
        )
      ) {
        throw new Error("Unknown mapping");
      }
      setProposal({ key, result: receipt.result });
      setRetry(false);
      attempt.current = null;
    } catch {
      setRetry(true);
      setError(
        "We couldn’t verify the suggestions. Your input is unchanged. Retry this request to check its result.",
      );
    } finally {
      clearTimeout(timer);
      working.current = false;
      setBusy(false);
    }
  }

  function apply() {
    if (!current?.modules.length) return;
    if (
      value.modules.length &&
      !window.confirm(
        "Replace this draft’s modules with the suggestions? Your saved and confirmed versions stay intact. Choose your checkpoint again; your return note is kept.",
      )
    )
      return;
    onApply({
      ...value,
      modules: current.modules.map((module) => ({
        id: crypto.randomUUID(),
        title: module.title,
        topics: module.topics.map(({ label, skill_id }) => ({ label, skill_id })),
      })),
      checkpoint_module_id: null,
    });
    setProposal(null);
  }
  return (
    <section className="course-suggestions" aria-label="AI topic suggestions" aria-busy={busy}>
      <h3>
        <Sparkles size={18} aria-hidden="true" /> Get a starting point
      </h3>
      <p>
        AI can suggest modules and skill matches from your pasted outline. Only your title and
        outline are shared with OpenAI when you request suggestions. Review every match; these
        suggestions don’t assess your abilities.
      </p>
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => void suggest()}
      >
        {busy
          ? "Reading your outline…"
          : retry && attempt.current?.key === key
            ? "Retry suggestions"
            : "Suggest topics from outline"}
      </button>
      <p className="field-help">
        You can always enter topics manually. Requesting suggestions leaves your course unchanged.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {proposal && !current && (
        <p role="status" className="field-help">
          Your outline or saved version changed. Request fresh suggestions for the current text.
        </p>
      )}
      {current && (
        <section className="suggestion-review" aria-label="Suggested modules">
          <h3>Review the suggestions</h3>
          <p role="status">
            {current.modules.length
              ? "Suggestions are ready. Your course topics are still unchanged."
              : "No course topics could be identified. Try a clearer syllabus or enter modules manually."}
          </p>
          <ol className="course-module-list">
            {current.modules.map((module, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: immutable candidate snapshot
              <li className="course-module-summary" key={index}>
                <h4>
                  {index + 1}. {module.title}
                </h4>
                <ul>
                  {module.topics.map((topic, at) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable candidate snapshot
                    <li key={at}>
                      <span>{topic.label}</span>
                      <span className="topic-mapping">
                        {skills.find((skill) => skill.id === topic.skill_id)?.name ?? "Unmapped"}
                        <small>
                          {topic.mapping === "uncertain"
                            ? "Uncertain match — please check"
                            : topic.mapping === "unmapped"
                              ? "No catalog match"
                              : "Suggested match — please check"}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <div className="course-actions">
            {!!current.modules.length && (
              <button type="button" className="button secondary" onClick={apply}>
                Use suggested modules
              </button>
            )}
            <button type="button" className="text-link" onClick={() => setProposal(null)}>
              Discard suggestions
            </button>
          </div>
          <p className="field-help">
            Using suggestions changes the form only. Correct the topics and choose your checkpoint,
            then save and confirm separately.
          </p>
        </section>
      )}
    </section>
  );
}

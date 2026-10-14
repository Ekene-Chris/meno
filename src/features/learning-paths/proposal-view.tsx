import Link from "next/link";
import type { ReviewedProposal } from "./schema";
export function ProposalView({
  record,
  compact = false,
}: {
  record: ReviewedProposal;
  compact?: boolean;
}) {
  const { proposal: p, context } = record;
  const names = (ids: string[]) =>
    ids.map((id) => context.skills.find((s) => s.id === id)?.name ?? id).join(", ");
  const observed = context.skills.filter(
    (s) => s.evidence && p.basis.evidenceIds.includes(s.evidence.id),
  );
  const occurrences = new Map<string, number>();
  const steps = p.steps.map((text) => {
    const count = occurrences.get(text) ?? 0;
    occurrences.set(text, count + 1);
    return { text, key: `${text}-${count}` };
  });
  return (
    <div className="proposal-content">
      <p className="eyebrow">
        {names([p.skillId])} · {p.estimatedMinutes} MINUTE ESTIMATE · v{record.revision}
      </p>
      <h3>{p.title}</h3>
      {record.editedFrom && (
        <p className="field-help">
          Adjusted by you. Your wording is a task preference; its learning quality has not been
          assessed. The original evidence and selection reasons are kept.
        </p>
      )}
      <ol className="path-steps">
        {steps.map((step) => (
          <li key={step.key}>{step.text}</li>
        ))}
      </ol>
      {!compact && (
        <>
          <section className="path-reasons" aria-label="Why this step fits">
            <h4>Why this step fits</h4>
            <ul>
              {p.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p>
              <strong>Retained observations:</strong>{" "}
              {p.basis.preservedSkills.length
                ? names(p.basis.preservedSkills)
                : "No assessed strengths used in this proposal. Unknown does not mean unable."}
            </p>
            {!!p.basis.unknownPrerequisites.length && (
              <p>
                <strong>Still unassessed:</strong> {names(p.basis.unknownPrerequisites)}. These are
                uncertainties, not failures.
              </p>
            )}
            {context.course && (
              <p>
                <strong>Confirmed course:</strong>{" "}
                <Link href={`/courses/${context.course.id}`}>{context.course.title}</Link> · v
                {context.course.revision}.{" "}
                {p.courseAnchor
                  ? `Connected to ${p.courseAnchor.moduleTitle}; checkpoint is self-reported, not skill evidence.`
                  : "No mapped module was selected for this skill."}
              </p>
            )}
            {!context.course && <p>This step uses your goal and evidence without a course.</p>}
            <details className="path-evidence">
              <summary>Evidence used for this suggestion ({observed.length})</summary>
              {!observed.length && (
                <p>
                  No assessed observations were used; this is a conservative starting suggestion.
                </p>
              )}
              {observed.map((skill) => (
                <div className="path-observation" key={skill.id}>
                  <strong>{skill.name}</strong>
                  <p>{skill.evidence?.scope ?? "Scope not recorded."}</p>
                  <p className="field-help">
                    {skill.evidence?.kind.replaceAll("_", " ")} ·{" "}
                    {skill.evidence?.rubricVersion ?? "No rubric recorded"} ·{" "}
                    {skill.status.replaceAll("_", " ")}
                  </p>
                  {skill.evidence?.attemptId && (
                    <Link href={`/assessment/${skill.evidence.attemptId}`} className="text-link">
                      Review this observation
                    </Link>
                  )}
                </div>
              ))}
            </details>
          </section>
          <section className="path-resource" aria-label="Optional learning resource">
            <h4>Optional reference</h4>
            <a
              href={p.resource.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link"
            >
              {p.resource.title} ↗
            </a>
            <p className="field-help">
              {p.resource.provider} · English text · checked {p.resource.checkedAt} · review due{" "}
              {p.resource.reviewAfter}. Download size and reading time are unknown. You can use your
              own notes instead.
            </p>
          </section>
          {p.demoConnection && (
            <aside className="path-demo">
              <strong>{p.demoConnection.label}</strong>
              <p>{p.demoConnection.statement}</p>
            </aside>
          )}
          <details className="path-evidence">
            <summary>What this suggestion can and cannot tell you</summary>
            <ul>
              {p.limitations.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

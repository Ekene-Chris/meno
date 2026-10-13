import { Flag } from "lucide-react";
import type { CourseInput } from "./course-schema";
import { sourceLabels, type CourseSkill } from "./course-view";

export function CoursePreview({
  content,
  skills,
}: {
  content: CourseInput;
  skills: CourseSkill[];
}) {
  const checkpoint = content.modules.find((module) => module.id === content.checkpoint_module_id);
  return (
    <div className="course-preview">
      <div className="course-details">
        <span className="subtle-badge">{sourceLabels[content.source_type]}</span>
        {content.source_url && (
          <a
            className="text-link course-source"
            href={content.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open course reference <span className="sr-only">(new tab)</span>
          </a>
        )}
      </div>
      <section className="course-checkpoint" aria-label="Saved checkpoint">
        <Flag size={22} aria-hidden="true" />
        <div>
          <p className="eyebrow">YOUR PLACE IN THE COURSE</p>
          <h3>{checkpoint?.title ?? "No checkpoint selected"}</h3>
          {content.checkpoint_note && <p className="preserve-lines">{content.checkpoint_note}</p>}
          <p className="course-footnote">
            This is where you said you paused. It doesn’t mark earlier topics as completed or
            assessed.
          </p>
        </div>
      </section>
      <h2 className="course-section-title">Modules & topics</h2>
      {!content.modules.length && (
        <p className="course-footnote">
          No modules yet. Add at least one module with a topic before confirming.
        </p>
      )}
      <ol className="course-module-list">
        {content.modules.map((module, index) => (
          <li key={module.id} className="course-module-summary">
            <h3>
              <span className="step-number">{index + 1}</span>
              {module.title}
            </h3>
            {module.topics.length ? (
              <ul>
                {module.topics.map((topic, topicIndex) => (
                  // Labels and mappings may repeat; their position identifies a topic in this immutable snapshot.
                  // biome-ignore lint/suspicious/noArrayIndexKey: immutable ordered snapshot
                  <li key={topicIndex}>
                    <span>{topic.label}</span>
                    <span className="topic-mapping">
                      {skills.find((skill) => skill.id === topic.skill_id)?.name ?? "Unmapped"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="course-footnote">No topics yet.</p>
            )}
          </li>
        ))}
      </ol>
      {content.outline && (
        <details className="course-outline">
          <summary>Original course outline</summary>
          <p className="preserve-lines">{content.outline}</p>
        </details>
      )}
    </div>
  );
}

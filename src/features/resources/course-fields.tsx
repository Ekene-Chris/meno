"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { courseSourceTypes, type CourseInput } from "./course-schema";
import { sourceLabels, type CourseSkill } from "./course-view";

export function CourseFields({
  value,
  onChange,
  skills,
  suggestions,
}: {
  value: CourseInput;
  onChange: (value: CourseInput) => void;
  skills: CourseSkill[];
  suggestions?: ReactNode;
}) {
  function patch(patch: Partial<CourseInput>) {
    onChange({ ...value, ...patch });
  }
  function moduleChange(index: number, module: CourseInput["modules"][number]) {
    patch({ modules: value.modules.map((item, at) => (at === index ? module : item)) });
  }
  function move(index: number, direction: number) {
    const modules = [...value.modules];
    [modules[index], modules[index + direction]] = [modules[index + direction], modules[index]];
    patch({ modules });
  }
  function addModule() {
    const id = crypto.randomUUID();
    patch({ modules: [...value.modules, { id, title: "", topics: [] }] });
    requestAnimationFrame(() => document.getElementById(`module-${id}`)?.focus());
  }
  return (
    <>
      <section className="form-section">
        <div className="section-heading">
          <span className="step-number">1</span>
          <div>
            <h2>Bring your course</h2>
            <p>A few details to keep your learning connected.</p>
          </div>
        </div>
        <div className="field-grid">
          <div className="field wide">
            <label htmlFor="course-title">Course title</label>
            <input
              id="course-title"
              required
              minLength={2}
              maxLength={160}
              value={value.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="e.g. My JavaScript course"
            />
          </div>
          <div className="field">
            <label htmlFor="course-source">Where are you learning?</label>
            <select
              id="course-source"
              value={value.source_type}
              onChange={(event) =>
                patch({ source_type: event.target.value as CourseInput["source_type"] })
              }
            >
              {courseSourceTypes.map((source) => (
                <option key={source} value={source}>
                  {sourceLabels[source]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="course-url">
              Course reference URL <span>optional</span>
            </label>
            <input
              id="course-url"
              type="url"
              maxLength={2048}
              value={value.source_url ?? ""}
              onChange={(event) => patch({ source_url: event.target.value })}
              placeholder="https://…"
              aria-describedby="reference-help"
            />
            <p id="reference-help" className="field-help">
              A link to return to. Meno doesn’t fetch its contents.
            </p>
          </div>
          <div className="field wide">
            <label htmlFor="course-outline">
              Course outline or notes <span>optional</span>
            </label>
            <textarea
              id="course-outline"
              rows={6}
              maxLength={12000}
              value={value.outline}
              onChange={(event) => patch({ outline: event.target.value })}
              placeholder="Paste the syllabus or notes you’re allowed to share."
              aria-describedby="outline-help"
            />
            <p id="outline-help" className="field-help">
              Keep the original here, then arrange your modules and topics below.{" "}
              {value.outline.length.toLocaleString()} / 12,000 characters.
            </p>
          </div>
        </div>
        {suggestions}
      </section>
      <section className="form-section">
        <div className="section-heading">
          <span className="step-number">2</span>
          <div>
            <h2>Arrange your topics</h2>
            <p>
              Follow your course’s order. Match a topic to a skill when it fits, or leave it
              unmapped.
            </p>
          </div>
        </div>
        <p className="course-footnote">
          The skill list currently covers frontend development. Unmapped means no matching skill was
          chosen; it says nothing about your ability.
        </p>
        {!value.modules.length && (
          <p className="module-empty">
            Start with the module you know. You can save a draft at any point.
          </p>
        )}
        {value.modules.map((module, index) => (
          <section className="module-editor" key={module.id} aria-label={`Module ${index + 1}`}>
            <div className="module-toolbar">
              <h3>Module {index + 1}</h3>
              <div className="course-actions">
                <button
                  className="icon-button"
                  type="button"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move module ${index + 1} up`}
                >
                  <ArrowUp size={17} aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  disabled={index === value.modules.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move module ${index + 1} down`}
                >
                  <ArrowDown size={17} aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove module ${index + 1}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remove module ${index + 1} and its topics from this draft?${value.checkpoint_module_id === module.id ? " Its checkpoint will also be cleared." : ""}`,
                      )
                    )
                      return;
                    patch({
                      modules: value.modules.filter((item) => item.id !== module.id),
                      checkpoint_module_id:
                        value.checkpoint_module_id === module.id
                          ? null
                          : value.checkpoint_module_id,
                    });
                  }}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`module-${module.id}`}>Module {index + 1} title</label>
              <input
                id={`module-${module.id}`}
                required
                maxLength={160}
                value={module.title}
                onChange={(event) => moduleChange(index, { ...module, title: event.target.value })}
              />
            </div>
            {module.topics.map((topic, topicIndex) => (
              <div
                className="topic-editor"
                // biome-ignore lint/suspicious/noArrayIndexKey: topics have no IDs and inputs are fully controlled
                key={topicIndex}
              >
                <div className="field">
                  <label htmlFor={`topic-${module.id}-${topicIndex}`}>Topic {topicIndex + 1}</label>
                  <input
                    id={`topic-${module.id}-${topicIndex}`}
                    required
                    maxLength={120}
                    value={topic.label}
                    onChange={(event) =>
                      moduleChange(index, {
                        ...module,
                        topics: module.topics.map((item, at) =>
                          at === topicIndex ? { ...item, label: event.target.value } : item,
                        ),
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`skill-${module.id}-${topicIndex}`}>
                    Skill for topic {topicIndex + 1}
                  </label>
                  <select
                    id={`skill-${module.id}-${topicIndex}`}
                    value={topic.skill_id ?? ""}
                    onChange={(event) =>
                      moduleChange(index, {
                        ...module,
                        topics: module.topics.map((item, at) =>
                          at === topicIndex
                            ? { ...item, skill_id: event.target.value || null }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="">Unmapped — no matching skill chosen</option>
                    {skills.map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove topic ${topicIndex + 1} from module ${index + 1}`}
                  onClick={() =>
                    moduleChange(index, {
                      ...module,
                      topics: module.topics.filter((_, at) => at !== topicIndex),
                    })
                  }
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-link"
              disabled={module.topics.length >= 10}
              onClick={() => {
                moduleChange(index, {
                  ...module,
                  topics: [...module.topics, { label: "", skill_id: null }],
                });
                requestAnimationFrame(() =>
                  document.getElementById(`topic-${module.id}-${module.topics.length}`)?.focus(),
                );
              }}
            >
              <Plus size={15} aria-hidden="true" /> Add topic to module {index + 1}
            </button>
            {module.topics.length >= 10 && (
              <p className="field-help">10 topics per module. Add another module for more.</p>
            )}
          </section>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={value.modules.length >= 30}
          onClick={addModule}
        >
          <Plus size={17} aria-hidden="true" /> Add module
        </button>
        {value.modules.length >= 30 && (
          <p className="field-help">This course has reached the 30-module limit.</p>
        )}
      </section>
      <section className="form-section">
        <div className="section-heading">
          <span className="step-number">3</span>
          <div>
            <h2>Keep your place</h2>
            <p>A pause doesn’t erase what came before.</p>
          </div>
        </div>
        <div className="field-grid">
          <div className="field wide">
            <label htmlFor="course-checkpoint">
              Where did you pause? <span>optional</span>
            </label>
            <select
              id="course-checkpoint"
              value={value.checkpoint_module_id ?? ""}
              onChange={(event) => patch({ checkpoint_module_id: event.target.value || null })}
            >
              <option value="">No checkpoint yet</option>
              {value.modules.map((module, index) => (
                <option value={module.id} key={module.id}>
                  {index + 1}. {module.title || "Untitled module"}
                </option>
              ))}
            </select>
          </div>
          <div className="field wide">
            <label htmlFor="course-note">
              A note for your return <span>optional</span>
            </label>
            <textarea
              id="course-note"
              rows={3}
              maxLength={500}
              value={value.checkpoint_note ?? ""}
              onChange={(event) => patch({ checkpoint_note: event.target.value })}
              placeholder="e.g. I followed promises in the lesson, but got stuck using them in my project."
            />
          </div>
        </div>
      </section>
    </>
  );
}

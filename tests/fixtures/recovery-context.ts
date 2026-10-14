import type { PathContext } from "@/features/learning-paths/schema";

// Explicit domain-test context; these are not real learner records or assessed results.
export function recoveryContext(): PathContext {
  const skills = [
    ["web.html-basics", "HTML foundations"],
    ["web.css-layout", "CSS layouts"],
    ["js.variables", "Variables and values"],
    ["js.functions", "Functions"],
    ["js.arrays", "Arrays"],
    ["js.promises", "Promises"],
  ];
  return {
    goal: { id: crypto.randomUUID(), desiredSkill: "JavaScript", targetRole: null },
    learner: {
      entryState: "returning",
      studyMinutesPerWeek: 90,
      device: "phone",
      bandwidth: "limited",
      locale: "en",
    },
    skills: skills.map(([id, name], index) => ({
      id,
      name,
      position: index + 1,
      status: "not_assessed",
      evidence: null,
    })),
    prerequisites: [
      { skillId: "web.css-layout", prerequisiteSkillId: "web.html-basics" },
      { skillId: "js.functions", prerequisiteSkillId: "js.variables" },
      { skillId: "js.arrays", prerequisiteSkillId: "js.functions" },
      { skillId: "js.promises", prerequisiteSkillId: "js.functions" },
    ],
    course: null,
    resources: skills.map(([id, name]) => ({
      id: `fixture-${id}`,
      skillId: id,
      title: name,
      sourceUrl: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      provider: "MDN",
      language: "en",
      format: "text",
      dataCost: "unknown",
      durationMinutes: null,
      checkedAt: "2026-10-14",
      reviewAfter: "2027-01-12",
    })),
  };
}
export function observedFinding(
  context: PathContext,
  id: string,
  status: "learning" | "needs_review" | "demonstrated",
) {
  const skill = context.skills.find((skill) => skill.id === id);
  if (!skill) throw new Error("Unknown fixture skill");
  skill.status = status;
  skill.evidence = {
    id: crypto.randomUUID(),
    kind: "quiz",
    outcome:
      status === "demonstrated"
        ? "meets_criteria"
        : status === "needs_review"
          ? "needs_practice"
          : "inconclusive",
    scope: "Fixed diagnostic examples only",
    rubricVersion: "objective-subset-v1",
    attemptId: crypto.randomUUID(),
  };
}

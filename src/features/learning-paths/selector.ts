import "server-only";
import { AppError } from "@/lib/http";
import { demoFrontendBrief } from "@/features/opportunities/demo-requirements";
import { pathContextSchema, proposalSchema, type PathContext, type PathProposal } from "./schema";

// Bump this version for changes to selection, templates, or the demo connection.
export const recoveryPolicyVersion = "recovery-v1";
const activities: Record<
  string,
  { start: string; review: string; practice: string; task: string }
> = {
  "web.html-basics": {
    start: "Give a small page meaningful structure",
    review: "Review how HTML elements fit together",
    practice: "Explain the structure of a small page",
    task: "Write a heading and a paragraph for a page about a local event. Label the opening tag, content and closing tag, then explain how you would nest an emphasized word.",
  },
  "web.css-layout": {
    start: "Explore how a page flows",
    review: "Review a small layout decision",
    practice: "Plan a layout for two screen sizes",
    task: "Sketch two content cards on a narrow and a wide screen. Explain their normal flow and one layout approach you would use to arrange them.",
  },
  "js.variables": {
    start: "Make sense of values and variables",
    review: "Review values without restarting your course",
    practice: "Explain values in a small example",
    task: "Write two variables for an event: a text name and a numeric seat count. Explain their types and what adding 2 to the count would mean. Predict what changes if the count is text.",
  },
  "js.functions": {
    start: "Follow an input through a function",
    review: "Reconnect function inputs and return values",
    practice: "Design a small function and explain it",
    task: "Write a small function that takes a seat count and returns that count plus 2. Show one call, name its argument and return value, and explain each step in words.",
  },
  "js.arrays": {
    start: "Explore a small collection",
    review: "Review how array transformations work",
    practice: "Explain a collection transformation",
    task: "Start with seat counts [2, 4, 6]. Describe a map that adds 1 to each value, then a filter that keeps values above 4. Predict both results and explain whether the original array changes.",
  },
  "js.promises": {
    start: "Follow a promise from pending to settled",
    review: "Rebuild a clear picture of promise order",
    practice: "Explain a promise chain and its failure path",
    task: "Write three labeled lines: start an asynchronous operation, attach a then callback, log an immediate message. Predict which message appears first and explain how you would handle rejection.",
  },
};
function observed(skill: PathContext["skills"][number]) {
  return (
    !!skill.evidence &&
    ["quiz", "practical_task", "externally_verified_project"].includes(skill.evidence.kind)
  );
}
function goalSkills(goal: string) {
  const text = goal.toLowerCase();
  if (/javascript|\bjs\b|\breact\b/.test(text))
    return ["js.variables", "js.functions", "js.arrays", "js.promises"];
  if (/front.?end|web development|web design/.test(text)) return Object.keys(activities);
  if (/\bcss\b/.test(text)) return ["web.html-basics", "web.css-layout"];
  if (/\bhtml\b/.test(text)) return ["web.html-basics"];
  throw new AppError(
    422,
    "GOAL_NOT_SUPPORTED",
    "This prototype proposes JavaScript and frontend milestones. Your current goal is kept; other domains are not supported yet.",
  );
}
export function selectRecoveryProposal(value: PathContext): PathProposal {
  const context = pathContextSchema.parse(value);
  const eligible = goalSkills(context.goal.desiredSkill);
  const candidates = context.skills.filter(
    (skill) => eligible.includes(skill.id) && activities[skill.id],
  );
  if (!candidates.length)
    throw new AppError(
      503,
      "PATH_CATALOG_UNAVAILABLE",
      "The learning catalog is unavailable. Your saved plan is kept.",
    );
  const byId = new Map(context.skills.map((skill) => [skill.id, skill]));
  const prerequisites = (id: string, visited = new Set<string>()): string[] => {
    if (visited.has(id))
      throw new AppError(
        503,
        "PATH_CATALOG_UNAVAILABLE",
        "The learning catalog needs review. Your saved plan is kept.",
      );
    const next = new Set(visited).add(id);
    return [
      ...new Set(
        context.prerequisites
          .filter((edge) => edge.skillId === id)
          .flatMap((edge) => [
            edge.prerequisiteSkillId,
            ...prerequisites(edge.prerequisiteSkillId, next),
          ]),
      ),
    ];
  };
  const checkpoint = context.course?.modules.find(
    (module) => module.id === context.course?.checkpointModuleId,
  );
  const alignedModules = [...(context.course?.modules ?? [])].sort((a, b) => {
    const distance = (position: number) =>
      checkpoint
        ? position >= checkpoint.position
          ? position - checkpoint.position
          : 100 + checkpoint.position - position
        : position;
    return distance(a.position) - distance(b.position);
  });
  const alignment = (id: string) => {
    const index = alignedModules.findIndex((module) => module.skillIds.includes(id));
    return index < 0 ? 100 : index;
  };
  const ordered = [...candidates].sort(
    (a, b) => alignment(a.id) - alignment(b.id) || a.position - b.position,
  );
  const gaps = ordered.filter((skill) => observed(skill) && skill.status === "needs_review");
  let selected: PathContext["skills"][number] | undefined = gaps[0];
  let category: PathProposal["basis"]["category"] = "observed_gap";
  if (selected) {
    const prerequisiteIds = prerequisites(selected.id);
    const prerequisiteGap = candidates
      .filter(
        (skill) =>
          prerequisiteIds.includes(skill.id) && observed(skill) && skill.status === "needs_review",
      )
      .sort((a, b) => a.position - b.position)[0];
    if (prerequisiteGap) {
      selected = prerequisiteGap;
      category = "prerequisite_review";
    }
  } else {
    selected = ordered.find((skill) => observed(skill) && skill.status === "learning");
    category = "incomplete_observation";
    if (!selected) {
      const mapped =
        context.learner.entryState !== "starting"
          ? ordered.find((skill) => alignment(skill.id) < 100)
          : undefined;
      selected =
        mapped ??
        [...candidates]
          .sort((a, b) => a.position - b.position)
          .find((skill) => !observed(skill) || skill.status === "not_assessed");
      category = mapped ? "course_continuation" : "unassessed_start";
      if (!selected) {
        selected = [...candidates].sort((a, b) => b.position - a.position)[0];
        category = "practical_extension";
      }
    }
  }
  if (!selected)
    throw new AppError(
      503,
      "PATH_CATALOG_UNAVAILABLE",
      "The learning catalog is unavailable. Your saved plan is kept.",
    );
  const mode =
    observed(selected) && selected.status === "needs_review"
      ? "review"
      : observed(selected) && selected.status === "demonstrated"
        ? "practice"
        : "start";
  const resource = context.resources.find((item) => item.skillId === selected.id);
  if (!resource)
    throw new AppError(
      503,
      "PATH_RESOURCE_UNAVAILABLE",
      "A reviewed resource is unavailable for this step. Your saved plan is kept; please retry later.",
    );
  const minutes = context.learner.studyMinutesPerWeek;
  const estimatedMinutes =
    minutes !== null && minutes <= 30
      ? 5
      : minutes !== null && minutes >= 180 && context.learner.device === "computer"
        ? 25
        : 15;
  const preserved = candidates.filter(
    (skill) => observed(skill) && skill.status === "demonstrated",
  );
  const unknownPrerequisites = prerequisites(selected.id).filter((id) => {
    const skill = byId.get(id);
    return !skill || !observed(skill) || skill.status === "not_assessed";
  });
  const module = alignedModules.find((item) => item.skillIds.includes(selected.id));
  const reasons = [
    category === "observed_gap" || category === "prerequisite_review"
      ? "A recorded " +
        (selected.evidence?.kind === "quiz" ? "quiz observation" : "assessed activity") +
        " supports reviewing " +
        selected.name +
        ". " +
        (category === "prerequisite_review"
          ? "This observed prerequisite gap comes before the later topic. "
          : "") +
        "The finding applies only to its recorded scope."
      : category === "incomplete_observation"
        ? "There is an incomplete observation for " +
          selected.name +
          ". This step explores more of the scope; skipped items are not failures."
        : observed(selected)
          ? "Earlier evidence is retained for " +
            selected.name +
            ". This practice asks you to explain or apply it; correct quiz examples do not prove independent project ability."
          : "There is no assessed finding for " +
            selected.name +
            ". This is a manageable starting or continuation step, not a claim that you failed it.",
    minutes === null
      ? "Study time is unspecified, so this proposes a 15-minute session as an adjustable prototype estimate."
      : "With " +
        minutes +
        " minutes available per week, this proposes one " +
        estimatedMinutes +
        "-minute session; it does not schedule or fill the whole week.",
  ];
  if (module)
    reasons.push(
      "This skill is mapped in your confirmed course module " +
        module.title +
        ". The saved checkpoint is self-reported and is kept; it is not evidence of mastery.",
    );
  if (context.learner.device !== "computer" || context.learner.bandwidth === "limited")
    reasons.push(
      "The task can be drafted as text or on paper. Running code, watching video and downloading a project are not required for this proposed step.",
    );
  if (unknownPrerequisites.length)
    reasons.push(
      "Some prerequisite skills have not been assessed. They remain unknown; this proposal does not automatically restart your learning.",
    );
  const steps = [
    "Use your existing lesson notes or the linked resource for one relevant example. Read only the part needed for this task; the source has no verified reading-time estimate.",
    activities[selected.id].task,
  ];
  if (estimatedMinutes >= 15)
    steps.push(
      "Explain one choice or prediction in your own words and note one question you still have.",
    );
  if (estimatedMinutes === 25)
    steps.push("Change one input or situation and explain how the result or design would change.");
  const evidenceIds = [
    ...new Set(
      [selected, ...preserved].flatMap((skill) =>
        observed(skill) && skill.evidence ? [skill.evidence.id] : [],
      ),
    ),
  ];
  const limitations = [
    "This is a proposal. It does not replace an active plan, complete a task or award skill evidence.",
    "Session length is a prototype estimate, not a verified resource duration or promise of mastery.",
    "The supplemental resource is English text. Its download size is unknown; your own notes can be used if access is difficult.",
  ];
  if (context.learner.locale !== "en")
    limitations.push(
      "Your saved language preference is kept. A reviewed resource in that language is not available in this prototype.",
    );
  const connects = demoFrontendBrief.requirements.some(
    (requirement) => requirement.skillId === selected.id,
  );
  return proposalSchema.parse({
    policyVersion: recoveryPolicyVersion,
    skillId: selected.id,
    mode,
    title: activities[selected.id][mode],
    estimatedMinutes,
    steps,
    reasons,
    basis: {
      category,
      evidenceIds,
      preservedSkills: preserved.map((skill) => skill.id),
      unknownPrerequisites,
    },
    resource,
    courseAnchor:
      module && context.course
        ? {
            courseId: context.course.id,
            revision: context.course.revision,
            moduleId: module.id,
            moduleTitle: module.title,
            relationship: !checkpoint
              ? "mapped_topic"
              : module.position === checkpoint.position
                ? "checkpoint"
                : module.position < checkpoint.position
                  ? "earlier"
                  : "later",
          }
        : null,
    demoConnection: connects
      ? {
          fixtureId: demoFrontendBrief.id,
          label: demoFrontendBrief.label,
          statement:
            "The fictional frontend API project brief uses this skill in practical work. This proposed step is preparation, not evidence that you meet a real employer requirement.",
        }
      : null,
    limitations,
  });
}

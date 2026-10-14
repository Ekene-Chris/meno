import type { OpportunityRequirement, OpportunityObservation } from "./schema";
export function compareRequirement(
  requirement: OpportunityRequirement,
  observations: OpportunityObservation[],
) {
  const observation = observations.find((o) => o.skillId === requirement.skillId) ?? null;
  const observed =
    observation?.evidenceId &&
    ["quiz", "practical_task", "externally_verified_project"].includes(observation.kind ?? "");
  if (!observed)
    return {
      state: "unknown" as const,
      met: false,
      label: "Not assessed",
      explanation:
        "No assessed observation supports this skill yet. Unknown does not mean failure.",
      observation,
    };
  const independent =
    observation.kind === "externally_verified_project" ||
    (observation.kind === "practical_task" && observation.method !== "guided_scaffold");
  if (requirement.evidenceLevel === "independent_project") {
    if (
      independent &&
      observation.status === "demonstrated" &&
      observation.outcome === "meets_criteria" &&
      observation.scope
    )
      return {
        state: "scoped_evidence" as const,
        met: true,
        label: "Independent scoped evidence recorded",
        explanation:
          "Recorded project evidence supports its stated scope. This does not establish every part of the requirement or career qualification.",
        observation,
      };
    return {
      state:
        observation.status === "needs_review"
          ? ("observed_gap" as const)
          : ("independent_needed" as const),
      met: false,
      label:
        observation.status === "needs_review"
          ? "Observed gap; independent evidence needed"
          : "Independent evidence still needed",
      explanation:
        observation.method === "guided_scaffold"
          ? "Guided scaffold progress is recorded, but independent implementation and runtime behavior remain unverified."
          : "Quiz or incomplete observations do not demonstrate an independently implemented project.",
      observation,
    };
  }
  if (
    observation.method === "guided_scaffold" &&
    observation.status === "demonstrated" &&
    observation.outcome === "meets_criteria" &&
    observation.scope
  )
    return {
      state: "guided_preparation" as const,
      met: true,
      label: "Guided preparation shown",
      explanation:
        "The fixed guided criteria are met within their recorded scope. This is preparation, not independently built-app proof.",
      observation,
    };
  if (
    independent &&
    observation.status === "demonstrated" &&
    observation.outcome === "meets_criteria" &&
    observation.scope
  )
    return {
      state: "scoped_evidence" as const,
      met: true,
      label: "Project observation recorded",
      explanation:
        "Recorded project evidence may support preparation within its stated scope. The exact guided criteria were not checked by this source.",
      observation,
    };
  return {
    state:
      observation.status === "needs_review"
        ? ("observed_gap" as const)
        : ("preparation_needed" as const),
    met: false,
    label:
      observation.status === "needs_review"
        ? "Observed preparation gap"
        : "Guided preparation not yet shown",
    explanation:
      "The existing observation is kept. The fixed guided preparation criteria have not all been met by this source.",
    observation,
  };
}
export function gapAction(skillId: string) {
  const sessions: Record<string, string> = {
    "js.promises": "promises",
    "web.fetch-api": "fetch",
    "web.dom": "display",
  };
  if (sessions[skillId])
    return {
      href: `/practice?session=${sessions[skillId]}`,
      label: "Work on guided preparation",
      note: "This fixed scaffold helps preparation; an independent project requirement remains separate.",
    };
  if (["js.variables", "js.functions", "js.arrays"].includes(skillId))
    return {
      href: "/assessment",
      label: "Check the JavaScript foundations",
      note: "The quiz observes fixed examples, not independent project work.",
    };
  return {
    href: "/mentor",
    label: "Discuss an evidence-building task",
    note: "Meno can help you choose a small next step. Chat does not verify project evidence.",
  };
}

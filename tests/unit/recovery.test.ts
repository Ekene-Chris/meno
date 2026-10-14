import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const trusted = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/trusted", () => ({ createTrustedDb: trusted }));
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  proposePathSchema,
  proposalSchema,
  type ProposePathInput,
} from "@/features/learning-paths/schema";
import { selectRecoveryProposal } from "@/features/learning-paths/selector";
import { proposePath } from "@/features/learning-paths/service";
import { demoFrontendBrief } from "@/features/opportunities/demo-requirements";
import { observedFinding, recoveryContext } from "../fixtures/recovery-context";

describe("evidence- and constraint-based next steps", () => {
  it("offers an unknown JavaScript starting scope without calling it a failed skill", () => {
    const context = recoveryContext();
    context.learner.entryState = "starting";
    const proposal = selectRecoveryProposal(context);
    expect(proposal).toMatchObject({
      skillId: "js.variables",
      mode: "start",
      basis: { category: "unassessed_start", evidenceIds: [] },
    });
    expect(proposal.reasons[0]).toContain("no assessed finding");
  });
  it("preserves observed strengths and targets the returning learner's actual promise gap", () => {
    const context = recoveryContext();
    for (const id of ["js.variables", "js.functions", "js.arrays"])
      observedFinding(context, id, "demonstrated");
    observedFinding(context, "js.promises", "needs_review");
    const proposal = selectRecoveryProposal(context);
    expect(proposal).toMatchObject({
      skillId: "js.promises",
      mode: "review",
      basis: {
        category: "observed_gap",
        preservedSkills: ["js.variables", "js.functions", "js.arrays"],
      },
    });
    expect(proposal.basis.evidenceIds).toHaveLength(4);
    expect(proposal.demoConnection?.label).toBe("DEMO — NOT A LIVE LISTING");
    expect(proposal.demoConnection?.statement).toContain("not evidence");
  });
  it("selects an observed prerequisite gap before a later checkpoint gap", () => {
    const context = recoveryContext();
    observedFinding(context, "js.variables", "needs_review");
    observedFinding(context, "js.promises", "needs_review");
    context.course = {
      id: crypto.randomUUID(),
      revision: 2,
      title: "My course",
      checkpointModuleId: null,
      modules: [
        { id: crypto.randomUUID(), title: "Promises", position: 0, skillIds: ["js.promises"] },
      ],
    };
    const proposal = selectRecoveryProposal(context);
    expect(proposal).toMatchObject({
      skillId: "js.variables",
      mode: "review",
      basis: { category: "prerequisite_review" },
    });
  });
  it("keeps unassessed prerequisites unknown while addressing an observed gap", () => {
    const context = recoveryContext();
    observedFinding(context, "js.promises", "needs_review");
    const proposal = selectRecoveryProposal(context);
    expect(proposal.skillId).toBe("js.promises");
    expect(proposal.basis.unknownPrerequisites).toEqual(["js.functions", "js.variables"]);
    expect(proposal.reasons.at(-1)).toContain("remain unknown");
  });
  it("treats incomplete observations as further exploration rather than failure", () => {
    const context = recoveryContext();
    observedFinding(context, "js.functions", "learning");
    expect(selectRecoveryProposal(context)).toMatchObject({
      skillId: "js.functions",
      mode: "start",
      basis: { category: "incomplete_observation" },
    });
  });
  it("does not turn self-report or AI inference into observed strengths or gaps", () => {
    const context = recoveryContext();
    observedFinding(context, "js.promises", "needs_review");
    const evidence = context.skills.find((skill) => skill.id === "js.promises")?.evidence;
    if (!evidence) throw new Error("Expected fixture evidence");
    evidence.kind = "ai_inference";
    expect(selectRecoveryProposal(context)).toMatchObject({
      skillId: "js.variables",
      basis: { evidenceIds: [], preservedSkills: [] },
    });
  });
  it("extends correct quiz examples with practice without inventing project or API mastery", () => {
    const context = recoveryContext();
    for (const id of ["js.variables", "js.functions", "js.arrays", "js.promises"])
      observedFinding(context, id, "demonstrated");
    const proposal = selectRecoveryProposal(context);
    expect(proposal).toMatchObject({
      skillId: "js.promises",
      mode: "practice",
      basis: { category: "practical_extension" },
    });
    expect(proposal.reasons[0]).toContain("do not prove independent project ability");
    expect(proposal.basis.preservedSkills).not.toContain("web.fetch-api");
  });
  it("uses the confirmed course checkpoint to order comparable gaps without inferring mastery from a mapping", () => {
    const context = recoveryContext();
    observedFinding(context, "js.functions", "demonstrated");
    observedFinding(context, "js.arrays", "needs_review");
    observedFinding(context, "js.promises", "needs_review");
    const checkpoint = crypto.randomUUID();
    context.course = {
      id: crypto.randomUUID(),
      revision: 3,
      title: "Existing course",
      checkpointModuleId: checkpoint,
      modules: [
        { id: crypto.randomUUID(), title: "Arrays", position: 0, skillIds: ["js.arrays"] },
        { id: checkpoint, title: "Promises", position: 1, skillIds: ["js.promises"] },
      ],
    };
    const proposal = selectRecoveryProposal(context);
    expect(proposal).toMatchObject({
      skillId: "js.promises",
      courseAnchor: { revision: 3, moduleId: checkpoint, relationship: "checkpoint" },
    });
    expect(proposal.reasons.join(" ")).toContain("not evidence of mastery");
  });
  it("can continue an unassessed mapped course topic while retaining unknown status", () => {
    const context = recoveryContext();
    context.course = {
      id: crypto.randomUUID(),
      revision: 1,
      title: "My class",
      checkpointModuleId: null,
      modules: [{ id: crypto.randomUUID(), title: "Arrays", position: 0, skillIds: ["js.arrays"] }],
    };
    expect(selectRecoveryProposal(context)).toMatchObject({
      skillId: "js.arrays",
      mode: "start",
      basis: { category: "course_continuation", evidenceIds: [] },
    });
  });
  it("changes task size with time/device constraints and labels unspecified time as an assumption", () => {
    const context = recoveryContext();
    context.learner.studyMinutesPerWeek = 15;
    const short = selectRecoveryProposal(context);
    context.learner.studyMinutesPerWeek = 180;
    context.learner.device = "computer";
    const longer = selectRecoveryProposal(context);
    expect(short.estimatedMinutes).toBe(5);
    expect(short.steps).toHaveLength(2);
    expect(longer.estimatedMinutes).toBe(25);
    expect(longer.steps).toHaveLength(4);
    context.learner.device = "phone";
    expect(selectRecoveryProposal(context).estimatedMinutes).toBe(15);
    context.learner.studyMinutesPerWeek = null;
    expect(selectRecoveryProposal(context).reasons.join(" ")).toContain("unspecified");
  });
  it("keeps the resource language and unknown size/duration explicit for other language preferences", () => {
    const context = recoveryContext();
    context.learner.locale = "fr";
    const proposal = selectRecoveryProposal(context);
    expect(proposal.resource).toMatchObject({
      language: "en",
      dataCost: "unknown",
      durationMinutes: null,
    });
    expect(proposal.limitations.join(" ")).toContain("in that language is not available");
  });
  it("rejects unsupported goals, unavailable reviewed resources and prerequisite cycles", () => {
    const context = recoveryContext();
    context.goal.desiredSkill = "Python";
    expect(() => selectRecoveryProposal(context)).toThrow(
      expect.objectContaining({ code: "GOAL_NOT_SUPPORTED" }),
    );
    context.goal.desiredSkill = "JavaScript";
    context.resources = [];
    expect(() => selectRecoveryProposal(context)).toThrow(
      expect.objectContaining({ code: "PATH_RESOURCE_UNAVAILABLE" }),
    );
    context.resources = recoveryContext().resources;
    observedFinding(context, "js.promises", "needs_review");
    context.prerequisites.push({ skillId: "js.functions", prerequisiteSkillId: "js.promises" });
    expect(() => selectRecoveryProposal(context)).toThrow(
      expect.objectContaining({ code: "PATH_CATALOG_UNAVAILABLE" }),
    );
  });
  it("supports frontend/HTML/CSS beginnings, keeps output bounded and does not mutate context", () => {
    for (const goal of ["Frontend web development", "HTML", "CSS"]) {
      const context = recoveryContext();
      context.goal.desiredSkill = goal;
      const original = structuredClone(context);
      expect(selectRecoveryProposal(context).skillId).toBe("web.html-basics");
      expect(context).toEqual(original);
      expect(proposalSchema.safeParse(selectRecoveryProposal(context)).success).toBe(true);
    }
    expect(demoFrontendBrief).toMatchObject({ isDemo: true, sourceUrl: null, deadline: null });
  });
});

const userId = crypto.randomUUID();
const input: ProposePathInput = {
  requestId: crypto.randomUUID(),
  expectedRevision: 0,
  courseId: null,
};
const receipt = { pathId: crypto.randomUUID(), proposalId: crypto.randomUUID(), revision: 1 };
function serviceFixture(prior: object | null = null, revision = 0) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: prior, error: null }),
  };
  const rpc = vi.fn().mockResolvedValue({
    data: {
      context: recoveryContext(),
      contextHash: "a".repeat(64),
      pathId: null,
      revision,
      activeRevision: null,
    },
    error: null,
  });
  const db = { from: vi.fn().mockReturnValue(chain), rpc } as unknown as SupabaseClient<Database>;
  const write = vi.fn().mockResolvedValue({ data: receipt, error: null });
  trusted.mockReturnValue({ rpc: write });
  return { db, rpc, write };
}
afterEach(() => trusted.mockReset());
describe("proposal request and trusted-write boundaries", () => {
  it("rejects client ownership, evidence, resource, context, active-plan and policy fields", () => {
    expect(proposePathSchema.parse(input)).toEqual(input);
    for (const patch of [
      { userId },
      { proposal: {} },
      { contextHash: "a".repeat(64) },
      { activeRevision: 1 },
      { selectorVersion: "other" },
      { expectedRevision: -1 },
    ])
      expect(proposePathSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("replays saved receipts before recomputation after lost responses and rejects mismatched requests", async () => {
    const fixture = serviceFixture({ expected_revision: 0, course_id: null, result: receipt });
    expect(await proposePath(fixture.db, userId, input)).toEqual(receipt);
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(trusted).not.toHaveBeenCalled();
    await expect(
      proposePath(fixture.db, userId, { ...input, expectedRevision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("checks session context/revision before constructing the privileged client", async () => {
    const fixture = serviceFixture(null, 1);
    await expect(proposePath(fixture.db, userId, input)).rejects.toMatchObject({ status: 409 });
    fixture.rpc.mockResolvedValue({ data: null, error: { code: "PT404" } });
    await expect(
      proposePath(fixture.db, userId, { ...input, courseId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
    expect(trusted).not.toHaveBeenCalled();
  });
  it("writes the selected server proposal and context fingerprint with authenticated identity", async () => {
    const fixture = serviceFixture();
    await proposePath(fixture.db, userId, input);
    expect(fixture.write).toHaveBeenCalledWith(
      "propose_learning_path",
      expect.objectContaining({
        p_user_id: userId,
        p_context_hash: "a".repeat(64),
        p_expected_revision: 0,
        p_selector_version: "recovery-v1",
        p_proposal: expect.objectContaining({ skillId: "js.variables", mode: "start" }),
      }),
    );
    fixture.write.mockResolvedValue({ data: null, error: { code: "PT409" } });
    await expect(proposePath(fixture.db, userId, input)).rejects.toMatchObject({ status: 409 });
  });
});

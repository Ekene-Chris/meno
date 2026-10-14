import "server-only";
import { createHash } from "node:crypto";
import publicContent from "./practical-content.json";
import key from "./practical-key.json";
import {
  practicalContentSchema,
  practicalFeedbackSchema,
  practicalInputSchema,
  validatePracticalChoices,
  type PracticalInput,
} from "./practical-schema";
export const practicalContentHash = createHash("sha256")
  .update(JSON.stringify({ public: publicContent, key }))
  .digest("hex");
export function getPracticalContent() {
  return practicalContentSchema.parse(publicContent);
}
export function scorePractical(raw: PracticalInput) {
  const content = getPracticalContent();
  const input = validatePracticalChoices(practicalInputSchema.parse(raw), content);
  const criteria = content.sessions
    .flatMap((s) => s.slots)
    .map((slot) => {
      const observed = input.mode === "guided" ? (input.choices[slot.id] ?? null) : null;
      const expected = key[slot.id as keyof typeof key];
      return {
        id: slot.id,
        skillId: slot.skillId,
        scope: slot.scope,
        status:
          observed === null
            ? ("inconclusive" as const)
            : observed === expected.choiceId
              ? ("met" as const)
              : ("needs_review" as const),
        observedChoiceId: observed,
        feedback:
          observed === null
            ? "No guided choice observed. Free-form code and reflection are not assessed by this rubric."
            : expected.feedback,
      };
    });
  // Missing work remains inconclusive even if other choices reveal a specific gap.
  const outcome = criteria.some((c) => c.status === "inconclusive")
    ? "inconclusive"
    : criteria.some((c) => c.status === "needs_review")
      ? "needs_review"
      : "meets_guided_rubric";
  return practicalFeedbackSchema.parse({
    rubricVersion: content.rubricVersion,
    outcome,
    criteria,
    limitations: content.limitations,
  });
}

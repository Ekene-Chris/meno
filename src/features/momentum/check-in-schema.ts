import { z } from "zod";
import {
  pathIdSchema,
  pathAdjustmentSchema,
  type PathProposal,
} from "@/features/learning-paths/schema";

export const obstacles = {
  time: "I have less time today",
  confused: "This topic feels confusing",
  access: "My connection or device is limiting me",
  returning: "I'm returning after a pause",
} as const;
export const checkInSchema = z
  .strictObject({
    requestId: pathIdSchema,
    expectedRevision: z.number().int().positive().max(2147483644),
    acceptedProposalId: pathIdSchema,
    source: z.enum(["user_report", "demo_pause"]),
    obstacle: z.enum(["time", "confused", "access", "returning"]),
  })
  .refine((v) => v.source !== "demo_pause" || v.obstacle === "returning", {
    message: "A demo pause must be labeled as a simulated return.",
  });
export const checkInProvenanceSchema = z.strictObject({
  id: pathIdSchema,
  source: z.enum(["user_report", "demo_pause"]),
  obstacle: z.enum(["time", "confused", "access", "returning"]),
  createdAt: z.string(),
});
export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckInProvenance = z.infer<typeof checkInProvenanceSchema>;

export function smallerActivity(proposal: PathProposal, obstacle: CheckInInput["obstacle"]) {
  const first =
    obstacle === "access"
      ? "Use notes you already have, without downloading anything. Pick one small example related to this topic and explain it in your notebook."
      : `Spend up to three minutes beginning this action: ${proposal.steps[0].slice(0, 300)}`;
  return pathAdjustmentSchema.parse({
    title: `A five-minute return: ${proposal.title}`.slice(0, 160),
    estimatedMinutes: 5,
    steps: [
      first,
      "Use the remaining time to note one thing that is clearer and one question for your mentor. Stop after five minutes; this is a partial activity, not completion of the larger task.",
    ],
  });
}

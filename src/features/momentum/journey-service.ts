import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/http";
export async function getJourney(db: SupabaseClient<Database>) {
  const result = await db.rpc("get_journey_state");
  if (result.error)
    throw new AppError(
      503,
      "JOURNEY_UNAVAILABLE",
      "We couldn’t load your saved journey. Please retry.",
    );
  const state = z
    .strictObject({
      courseConfirmed: z.boolean(),
      diagnosticReviewed: z.boolean(),
      stepAccepted: z.boolean(),
      mentorUsed: z.boolean(),
      practiceSubmitted: z.boolean(),
      progressRecorded: z.boolean(),
      exampleSaved: z.boolean(),
    })
    .parse(result.data);
  const next = !state.exampleSaved
    ? {
        href: "/opportunities",
        title: "Choose an example direction",
        description: "Save an example now to retain a before-practice comparison.",
      }
    : !state.diagnosticReviewed
      ? {
          href: "/assessment",
          title: "Check what you remember",
          description:
            "Record observations from eight fixed JavaScript examples; skips are allowed.",
        }
      : !state.stepAccepted
        ? {
            href: "/learning-path",
            title: "Review one manageable next step",
            description:
              "Use your evidence and confirmed course, then accept or adjust the proposal.",
          }
        : !state.practiceSubmitted
          ? {
              href: "/practice",
              title: "Work through a small guided exercise",
              description: "Save between sessions. Submission stays separate from skill evidence.",
            }
          : !state.progressRecorded
            ? {
                href: "/practice",
                title: "Record supported guided progress",
                description:
                  "Open submitted work, review its limits and explicitly record observed findings.",
              }
            : {
                href: "/opportunities",
                title: "See which example gaps changed",
                description:
                  "Compare with your saved baseline. Independent project requirements remain separate.",
              };
  return { state, next };
}

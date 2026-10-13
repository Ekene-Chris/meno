import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { PassportInput } from "./schema";
import { AppError } from "@/lib/http";

export async function getPassport(db: SupabaseClient<Database>, userId: string) {
  const [profile, goal, skills, findings, events] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).maybeSingle(),
    db
      .from("learning_goals")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    db.from("skills").select("*").order("position"),
    db.from("learner_skills").select("*").eq("user_id", userId),
    db
      .from("learning_events")
      .select("id, type, occurred_at")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(5),
  ]);
  if ([profile, goal, skills, findings, events].some((result) => result.error)) {
    throw new AppError(
      503,
      "PASSPORT_UNAVAILABLE",
      "We couldn't load your Passport. Please try again.",
    );
  }
  return {
    profile: profile.data,
    goal: goal.data,
    skills: (skills.data ?? []).map((skill) => ({
      ...skill,
      finding: findings.data?.find((item) => item.skill_id === skill.id) ?? null,
    })),
    events: events.data ?? [],
  };
}

export async function savePassport(
  db: SupabaseClient<Database>,
  input: PassportInput,
  requestId: string,
) {
  const { error } = await db.rpc("save_passport", { p_input: input, p_request_id: requestId });
  if (error)
    throw new AppError(
      503,
      "SAVE_FAILED",
      "Your changes weren't saved. Please retry; your previous Passport is safe.",
    );
}

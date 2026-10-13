import { AppShell } from "@/components/app-shell";
import { requireLearner } from "@/lib/auth/session";
import { getPassport } from "@/features/learner-passport/service";
import { PassportForm } from "@/features/learner-passport/passport-form";
import { passportSchema } from "@/features/learner-passport/schema";

export const metadata = { title: "Your goals and preferences" };

export default async function Onboarding() {
  const { db, user } = await requireLearner();
  const { profile, goal } = await getPassport(db, user.id);
  const initial =
    profile && goal
      ? passportSchema.parse({
          display_name: profile.display_name,
          entry_state: profile.entry_state,
          locale: profile.locale,
          study_minutes_per_week: profile.study_minutes_per_week,
          device: profile.device,
          bandwidth: profile.bandwidth,
          desired_skill: goal.desired_skill,
          target_role: goal.target_role,
          motivation: goal.motivation,
        })
      : undefined;
  return (
    <AppShell active="onboarding">
      <div className="page-intro">
        <p className="eyebrow">YOUR LEARNER PASSPORT</p>
        <h1>{profile ? "A journey that fits your life." : "Let’s start with your story."}</h1>
        <p>
          {profile
            ? "Update your direction and preferences whenever you need to."
            : "No starting over. No assumptions. Just a little context to make this space yours."}
        </p>
      </div>
      <PassportForm initial={initial} editing={Boolean(profile)} />
    </AppShell>
  );
}

import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireLearner } from "@/lib/auth/session";
import { getPassport } from "@/features/learner-passport/service";
import { getCheckInWorkspace } from "@/features/momentum/check-in-service";
import { CheckInView } from "@/features/momentum/check-in-view";
export const metadata = { title: "A smaller return" };
export default async function CheckIn() {
  const { db, user } = await requireLearner();
  const passport = await getPassport(db, user.id);
  if (!passport.profile || !passport.goal) redirect("/onboarding");
  return (
    <AppShell active="learning-path">
      <CheckInView initial={await getCheckInWorkspace(db)} />
    </AppShell>
  );
}

import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireLearner } from "@/lib/auth/session";
import { getPassport } from "@/features/learner-passport/service";
import { AppError } from "@/lib/http";
import { attemptIdSchema } from "./attempt-schema";
import { getDiagnostic } from "./attempt-service";

export async function assessmentPageContext() {
  const { db, user } = await requireLearner();
  const passport = await getPassport(db, user.id);
  if (!passport.profile || !passport.goal) redirect("/onboarding");
  return { db, skills: passport.skills.map(({ id, name }) => ({ id, name })) };
}
export async function attemptForPage(
  db: Awaited<ReturnType<typeof assessmentPageContext>>["db"],
  id: string,
) {
  const parsed = attemptIdSchema.safeParse(id);
  if (!parsed.success) notFound();
  try {
    return await getDiagnostic(db, parsed.data);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

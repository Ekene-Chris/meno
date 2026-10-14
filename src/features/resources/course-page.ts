import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireLearner } from "@/lib/auth/session";
import { getPassport } from "@/features/learner-passport/service";
import { AppError } from "@/lib/http";
import { courseIdSchema } from "./course-schema";
import { getCourse } from "./course-service";

export async function coursePageContext() {
  const { db, user } = await requireLearner();
  const passport = await getPassport(db, user.id);
  if (!passport.profile || !passport.goal) redirect("/onboarding");
  return { db, skills: passport.skills.map(({ id, name }) => ({ id, name })) };
}

export async function courseForPage(
  db: Awaited<ReturnType<typeof coursePageContext>>["db"],
  id: string,
) {
  const parsed = courseIdSchema.safeParse(id);
  if (!parsed.success) notFound();
  try {
    return await getCourse(db, parsed.data);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}

import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireLearner } from "@/lib/auth/session";
import { getPassport } from "@/features/learner-passport/service";
import { getPathReview, listConfirmedCourses } from "@/features/learning-paths/review-service";
import { reviewQuerySchema } from "@/features/learning-paths/schema";
import { PathReviewEditor } from "@/features/learning-paths/review-editor";
import { AppError } from "@/lib/http";
export const metadata = { title: "Your next step" };
export default async function LearningPath({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db, user } = await requireLearner();
  const passport = await getPassport(db, user.id);
  if (!passport.profile || !passport.goal) redirect("/onboarding");
  const query = reviewQuerySchema.safeParse(await searchParams);
  if (!query.success || query.data.before !== undefined) notFound();
  try {
    const [initial, courses] = await Promise.all([
      getPathReview(db, query.data.courseId),
      listConfirmedCourses(db, 0),
    ]);
    return (
      <AppShell active="learning-path">
        <PathReviewEditor initial={initial} initialCourses={courses} />
      </AppShell>
    );
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    if (error instanceof AppError && error.status === 409)
      return (
        <AppShell active="learning-path">
          <div className="page-intro">
            <h1>Confirm your course first.</h1>
            <p>
              Only a confirmed outline can guide a step. You can also continue without a course.
            </p>
            <a className="button primary" href="/learning-path?courseId=none">
              Continue without a course
            </a>
          </div>
        </AppShell>
      );
    throw error;
  }
}

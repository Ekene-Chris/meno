import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireLearner } from "@/lib/auth/session";
import { AppError } from "@/lib/http";
import { getPassport } from "@/features/learner-passport/service";
import { getMentorWorkspace } from "@/features/momentum/mentor-service";
import { MentorWorkspaceView } from "@/features/momentum/mentor-workspace";
import { listConfirmedCourses } from "@/features/learning-paths/review-service";
import { reviewQuerySchema } from "@/features/learning-paths/schema";
export const metadata = { title: "Your mentor" };
export default async function Mentor({
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
      getMentorWorkspace(db, query.data.courseId),
      listConfirmedCourses(db, 0),
    ]);
    return (
      <AppShell active="mentor">
        <MentorWorkspaceView
          key={initial.current.courseId ?? "none"}
          initial={initial}
          initialCourses={courses}
        />
      </AppShell>
    );
  } catch (error) {
    if (error instanceof AppError && [404, 409].includes(error.status)) {
      if (query.data.courseId && query.data.courseId !== "none" && error.status === 404) notFound();
      return (
        <AppShell active="mentor">
          <div className="page-intro">
            <h1>Choose your course context.</h1>
            <p>
              The earlier course is unavailable or unconfirmed. Your accepted step is kept. You can
              continue without a course or review your outlines.
            </p>
            <Link href="/mentor?courseId=none" className="button primary">
              Continue without a course
            </Link>
            <Link href="/courses" className="text-link">
              Review courses
            </Link>
          </div>
        </AppShell>
      );
    }
    throw error;
  }
}

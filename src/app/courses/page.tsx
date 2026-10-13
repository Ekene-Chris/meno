import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, BookOpen, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { coursePageContext } from "@/features/resources/course-page";
import { listCourses } from "@/features/resources/course-service";
import { listCoursesSchema, type CourseInput } from "@/features/resources/course-schema";
import { sourceLabels, statusLabel } from "@/features/resources/course-view";

export const metadata = { title: "My courses" };

export default async function Courses({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { db } = await coursePageContext();
  const parsed = listCoursesSchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const page = parsed.data.page;
  const { courses, nextPage } = await listCourses(db, page);
  return (
    <AppShell active="courses">
      <div className="page-intro course-intro">
        <div>
          <p className="eyebrow">LEARN ANYWHERE</p>
          <h1>Your learning, continued.</h1>
          <p>Bring your course or class, and keep your place. There’s no need to start over.</p>
        </div>
        <Link href="/courses/new" className="button primary">
          <Plus size={17} aria-hidden="true" /> Add a course
        </Link>
      </div>
      {courses.length ? (
        <div className="course-list">
          {courses.map((course) => (
            <Link href={`/courses/${course.id}`} className="course-card" key={course.id}>
              <span className="icon-tile">
                <BookOpen size={22} aria-hidden="true" />
              </span>
              <div className="course-card-content">
                <p className="eyebrow">
                  {sourceLabels[course.source_type as CourseInput["source_type"]]}
                </p>
                <h2>{course.title}</h2>
                <p className="course-card-status">
                  {statusLabel(course.revision, course.confirmed_revision)} · Version{" "}
                  {course.revision}
                </p>
              </div>
              <ArrowUpRight size={20} aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <section className="course-empty form-section">
          <BookOpen size={32} strokeWidth={1.4} aria-hidden="true" />
          <h2>{page ? "No more courses here." : "Every bit of learning counts."}</h2>
          <p>
            {page
              ? "Return to the previous page to see your saved courses."
              : "An online course, a bootcamp, university notes, or your own study plan. Add the topics you’re learning and tell us where you paused."}
          </p>
          {!page && (
            <Link href="/courses/new" className="text-link">
              Bring your first course <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          )}
        </section>
      )}
      {(page > 0 || nextPage !== null) && (
        <nav className="course-actions" aria-label="Course pages">
          {page > 0 && (
            <Link className="button secondary" href={`/courses?page=${page - 1}`}>
              Previous page
            </Link>
          )}
          <span>Page {page + 1}</span>
          {nextPage !== null && nextPage <= 1000 && (
            <Link className="button secondary" href={`/courses?page=${nextPage}`}>
              Next page
            </Link>
          )}
        </nav>
      )}
      <p className="course-footnote">
        Course topics describe what you’re studying. Your skill evidence stays separate.
      </p>
    </AppShell>
  );
}

import { AppShell } from "@/components/app-shell";
import { courseForPage, coursePageContext } from "@/features/resources/course-page";
import { CourseEditor } from "@/features/resources/course-editor";

export const metadata = { title: "Your course" };
export default async function Course({ params }: { params: Promise<{ id: string }> }) {
  const { db, skills } = await coursePageContext();
  const { id } = await params;
  const course = await courseForPage(db, id);
  return (
    <AppShell active="courses">
      <CourseEditor key={id} initial={course} skills={skills} />
    </AppShell>
  );
}

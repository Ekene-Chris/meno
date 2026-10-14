import { AppShell } from "@/components/app-shell";
import { coursePageContext } from "@/features/resources/course-page";
import { CourseEditor } from "@/features/resources/course-editor";

export const metadata = { title: "Add a course" };
export default async function NewCourse() {
  const { skills } = await coursePageContext();
  return (
    <AppShell active="courses">
      <CourseEditor initial={null} skills={skills} />
    </AppShell>
  );
}

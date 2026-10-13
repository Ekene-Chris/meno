import Link from "next/link";
import { AppShell } from "@/components/app-shell";
export default function CourseNotFound() {
  return (
    <AppShell active="courses">
      <div className="page-intro">
        <p className="eyebrow">LET’S FIND YOUR PLACE</p>
        <h1>That course wasn’t found.</h1>
        <p>Open your course list to continue with your saved learning.</p>
      </div>
      <Link href="/courses" className="button primary">
        My courses
      </Link>
    </AppShell>
  );
}

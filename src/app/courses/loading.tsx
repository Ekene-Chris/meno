import { AppShell } from "@/components/app-shell";
export default function LoadingCourses() {
  return (
    <AppShell active="courses">
      <p role="status">Opening your courses…</p>
    </AppShell>
  );
}

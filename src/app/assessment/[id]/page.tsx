import { AppShell } from "@/components/app-shell";
import { assessmentPageContext, attemptForPage } from "@/features/assessment/assessment-page";
import { DiagnosticEditor } from "@/features/assessment/diagnostic-editor";
export const metadata = { title: "Your JavaScript check" };
export default async function Diagnostic({ params }: { params: Promise<{ id: string }> }) {
  const { db, skills } = await assessmentPageContext();
  const attempt = await attemptForPage(db, (await params).id);
  return (
    <AppShell active="assessment">
      <DiagnosticEditor key={attempt.id} initial={attempt} skills={skills} />
    </AppShell>
  );
}

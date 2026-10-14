import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { assessmentPageContext } from "@/features/assessment/assessment-page";
import { getPractical } from "@/features/assessment/practical-service";
import { practicalId } from "@/features/assessment/practical-schema";
import { PracticalEditor } from "@/features/assessment/practical-editor";
import { AppError } from "@/lib/http";
export const metadata = { title: "Your practical work" };
export default async function Practical({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await assessmentPageContext();
  const id = practicalId.safeParse((await params).id);
  if (!id.success) notFound();
  let attempt: Awaited<ReturnType<typeof getPractical>>;
  try {
    attempt = await getPractical(db, id.data);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  return (
    <AppShell active="practice">
      <PracticalEditor key={attempt.id} initial={attempt} />
    </AppShell>
  );
}

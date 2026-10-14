import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { assessmentPageContext } from "@/features/assessment/assessment-page";
import { getOpportunities } from "@/features/opportunities/service";
import { opportunityIdSchema } from "@/features/opportunities/schema";
import { OpportunityView } from "@/features/opportunities/opportunity-view";
import { AppError } from "@/lib/http";
export const metadata = { title: "Example opportunity comparison" };
export default async function Opportunity({ params }: { params: Promise<{ id: string }> }) {
  const { db } = await assessmentPageContext();
  const id = opportunityIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  let entries: Awaited<ReturnType<typeof getOpportunities>>;
  try {
    entries = await getOpportunities(db, id.data);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
  if (!entries[0]) notFound();
  return (
    <AppShell active="opportunities">
      <OpportunityView key={id.data} initial={entries[0]} />
    </AppShell>
  );
}

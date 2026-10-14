import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { assessmentPageContext } from "@/features/assessment/assessment-page";
import { getOpportunities } from "@/features/opportunities/service";
export const metadata = { title: "Opportunity Radar" };
export default async function Opportunities() {
  const { db } = await assessmentPageContext();
  const entries = await getOpportunities(db);
  return (
    <AppShell active="opportunities">
      <div className="page-intro">
        <p className="eyebrow">A DIRECTION WORTH WORKING TOWARD</p>
        <h1>Make progress feel connected.</h1>
        <p>
          Explore a small curated set of fictional opportunity briefs. Compare their requirements
          with your actual observations and choose one useful gap to work on.
        </p>
        <p className="demo-label">DEMO DATA — every entry is an example, not a live listing.</p>
      </div>
      <Link className="text-link" href="/journey">
        See your full learning journey
      </Link>
      <div className="opportunity-grid">
        {entries.map((entry) => (
          <section className="form-section" key={entry.opportunity.id}>
            <p className="demo-label">DEMO — NOT A LIVE LISTING</p>
            <p className="eyebrow">
              {entry.opportunity.kind}
              {entry.saved ? " · SAVED" : ""}
            </p>
            <h2>{entry.opportunity.title}</h2>
            <p>{entry.opportunity.description}</p>
            <p>
              {entry.requirements.filter((r) => r.priority === "required").length} example
              requirements · eligibility unspecified · no application link
            </p>
            <Link className="button primary" href={`/opportunities/${entry.opportunity.id}`}>
              Compare your evidence
            </Link>
          </section>
        ))}
      </div>
      <p className="field-help">
        A quiz or guided scaffold cannot prove an independently built app. This catalog does not
        predict employment or replace an opportunity’s own criteria.
      </p>
    </AppShell>
  );
}

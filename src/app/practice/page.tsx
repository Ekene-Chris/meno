import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { assessmentPageContext } from "@/features/assessment/assessment-page";
import { listPracticals } from "@/features/assessment/practical-service";
import { practicalPageSchema } from "@/features/assessment/practical-schema";
import { StartPractice } from "@/features/assessment/start-practice";
export const metadata = { title: "Practical work" };
export default async function Practice({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await assessmentPageContext();
  const parsed = practicalPageSchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const data = await listPracticals(db, parsed.data.page);
  return (
    <AppShell active="practice">
      <div className="page-intro">
        <p className="eyebrow">MAKE ROOM TO PRACTICE</p>
        <h1>A small app, a clearer next step.</h1>
        <p>{data.content.description}</p>
      </div>
      <section className="form-section">
        <h2>{data.content.title}</h2>
        {parsed.data.session && (
          <p>
            Focus requested: {parsed.data.session}. Work through this guided session to prepare;
            independent project requirements remain separate.
          </p>
        )}
        <ol>
          {data.content.sessions.map((s) => (
            <li key={s.id}>{s.title}</li>
          ))}
        </ol>
        <p>
          No download or live API is required. Beginners can start here; nothing locks later
          sessions. Read the rubric before submitting.
        </p>
        {data.draftId ? (
          <Link
            className="button primary"
            href={`/practice/${data.draftId}${parsed.data.session ? `#session-${parsed.data.session}` : ""}`}
          >
            Resume saved practice
          </Link>
        ) : (
          <StartPractice key={data.attempts[0]?.id ?? "first"} focusSession={parsed.data.session} />
        )}
        <p className="field-hint">
          Feedback checks fixed scaffold choices. Free-form code is unassessed. Passport evidence
          and your accepted step are kept.
        </p>
      </section>
      <section className="form-section">
        <h2>Your saved work</h2>
        {!data.attempts.length ? (
          <p>No practice yet. Your current course is kept.</p>
        ) : (
          <ul className="diagnostic-history">
            {data.attempts.map((a) => (
              <li key={a.id}>
                <Link href={`/practice/${a.id}`}>
                  <strong>
                    {a.status === "submitted" ? "Review submitted work" : "Continue draft"}
                  </strong>
                  <span className="diagnostic-history-meta">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeZone: "Africa/Lagos",
                    }).format(new Date(a.created_at))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="course-actions">
          {parsed.data.page > 0 && (
            <Link href={`/practice?page=${parsed.data.page - 1}`}>Newer work</Link>
          )}
          {data.nextPage !== null && (
            <Link href={`/practice?page=${data.nextPage}`}>Older work</Link>
          )}
        </div>
      </section>
    </AppShell>
  );
}

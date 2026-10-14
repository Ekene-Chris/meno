import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { assessmentPageContext } from "@/features/assessment/assessment-page";
import { listDiagnostics } from "@/features/assessment/attempt-service";
import { StartCheck } from "@/features/assessment/start-check";
import { listAttemptsSchema } from "@/features/assessment/attempt-schema";

export const metadata = { title: "Your skill checks" };
export default async function Assessment({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await assessmentPageContext();
  const parsed = listAttemptsSchema.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const { attempts, nextPage, activeAttemptId } = await listDiagnostics(db, parsed.data.page);
  return (
    <AppShell active="assessment">
      <div className="page-intro">
        <p className="eyebrow">BUILD ON WHAT YOU REMEMBER</p>
        <h1>A small check, a clearer picture.</h1>
        <p>
          Eight JavaScript questions about values, functions, arrays, and promises. Take your time,
          or skip any question. Your existing courses and place are kept.
        </p>
      </div>
      <section className="form-section">
        <h2>
          {activeAttemptId ? "Your check is waiting for you." : "Find a useful starting point."}
        </h2>
        <p>
          Save between questions and return later. Results reflect only these fixed examples; they
          aren’t a certification or a measure of career readiness.
        </p>
        {activeAttemptId ? (
          <Link className="button primary" href={`/assessment/${activeAttemptId}`}>
            Resume your check
          </Link>
        ) : (
          <StartCheck
            key={attempts[0]?.id ?? "first"}
            label={attempts.length ? "Take another JavaScript check" : undefined}
          />
        )}
      </section>
      <section className="form-section">
        <h2>Your saved checks</h2>
        {!attempts.length ? (
          <p>No check yet. You don’t have to restart your learning to begin.</p>
        ) : (
          <ul className="diagnostic-history">
            {attempts.map((attempt) => (
              <li key={attempt.id}>
                <Link href={`/assessment/${attempt.id}`}>
                  <strong>
                    {attempt.status === "evaluated"
                      ? "Review saved results"
                      : "Continue saved answers"}
                  </strong>
                  <span className="diagnostic-history-meta">
                    {attempt.answeredCount} / 8 answered or skipped ·{" "}
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeZone: "Africa/Lagos",
                    }).format(new Date(attempt.createdAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="course-actions">
          {parsed.data.page > 0 && (
            <Link className="text-link" href={`/assessment?page=${parsed.data.page - 1}`}>
              Newer checks
            </Link>
          )}
          {nextPage !== null && (
            <Link className="text-link" href={`/assessment?page=${nextPage}`}>
              Older checks
            </Link>
          )}
        </div>
      </section>
    </AppShell>
  );
}

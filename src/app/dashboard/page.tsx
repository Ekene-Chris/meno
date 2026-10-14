import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, BookOpen, Check, Compass, Flag, Pencil, Sprout } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireLearner } from "@/lib/auth/session";
import { getPassport } from "@/features/learner-passport/service";
import { entryStates } from "@/features/learner-passport/schema";

export const metadata = { title: "My Learner Passport" };
const statusLabels: Record<string, string> = {
  not_assessed: "Not assessed",
  learning: "Learning",
  needs_review: "Needs review",
  demonstrated: "Demonstrated",
};

export default async function Dashboard() {
  const { db, user } = await requireLearner();
  const { profile, goal, skills, events, recentEvidence } = await getPassport(db, user.id);
  if (!profile || !goal) redirect("/onboarding");
  const entry = entryStates.find((entry) => entry.value === profile.entry_state);
  const savedDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(profile.updated_at),
  );
  return (
    <AppShell active="passport">
      <div className="page-intro dashboard-intro">
        <div>
          <p className="eyebrow">YOUR LEARNER PASSPORT</p>
          <h1>A place to grow{profile.display_name ? `, ${profile.display_name}` : ""}.</h1>
          <p>Your direction, your context, and room for everything you’ll learn next.</p>
        </div>
        <span className="saved-badge">
          <Check size={14} aria-hidden="true" /> Saved {savedDate}
        </span>
      </div>
      <div className="dashboard-grid">
        <section className="goal-card">
          <span className="card-kicker">
            <Compass size={17} aria-hidden="true" /> YOUR NORTH STAR
          </span>
          <h2>{goal.desired_skill}</h2>
          {goal.target_role && <p className="goal-target">Working toward {goal.target_role}</p>}
          {goal.motivation && <p className="goal-motivation">{goal.motivation}</p>}
          <Link href="/onboarding" className="light-link">
            Refine your goal <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
          <Sprout className="goal-decoration" size={100} strokeWidth={1} aria-hidden="true" />
        </section>
        <section className="context-card">
          <div className="card-heading">
            <h2>Your rhythm</h2>
            <Link href="/onboarding" aria-label="Edit your learning preferences">
              <Pencil size={17} />
            </Link>
          </div>
          <dl>
            <div>
              <dt>Where you are</dt>
              <dd>{entry?.title ?? "Your learning journey"}</dd>
            </div>
            <div>
              <dt>Time to learn</dt>
              <dd>
                {profile.study_minutes_per_week
                  ? `${profile.study_minutes_per_week} minutes / week`
                  : "At your own pace"}
              </dd>
            </div>
            <div>
              <dt>Your device</dt>
              <dd>
                {profile.device === "phone"
                  ? "Phone"
                  : profile.device === "computer"
                    ? "Computer"
                    : profile.device === "shared"
                      ? "Shared device"
                      : "Not specified"}
              </dd>
            </div>
            <div>
              <dt>Internet access</dt>
              <dd>
                {profile.bandwidth === "limited"
                  ? "Limited or unreliable"
                  : profile.bandwidth === "reliable"
                    ? "Usually reliable"
                    : "Not specified"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="next-chapter">
        <span className="icon-tile">
          <BookOpen size={23} aria-hidden="true" />
        </span>
        <div>
          <p className="eyebrow">YOUR CONTEXT IS SAVED</p>
          <h2>Pick up where you left off.</h2>
          <p className="chapter-description">
            Bring a course or class, arrange its topics, and save your place. Your progress belongs
            here, even after a pause. A short JavaScript check can show what you remember. Then
            choose a manageable next step.
          </p>
          <Link href="/courses" className="text-link">
            Continue with your courses <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/assessment" className="text-link">
            Check what you remember <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/learning-path" className="text-link">
            Review your next step <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/practice" className="text-link">
            Open practical work
          </Link>
          <Link href="/mentor" className="text-link">
            Work through a question with Meno <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <section className="skills-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">EVIDENCE, NOT ASSUMPTIONS</p>
            <h2>Your skill map</h2>
          </div>
          <span className="subtle-badge">Frontend · demo curriculum</span>
        </div>
        <p className="section-description">
          Not assessed means we haven’t checked this skill yet. It says nothing about what you
          already know.
        </p>
        <div className="skill-grid">
          {skills.map((skill) => (
            <article
              className={`skill-item${skill.evidence ? " has-evidence" : ""}`}
              key={skill.id}
            >
              <div>
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
              </div>
              <span className={`skill-status status-${skill.finding?.status ?? "not_assessed"}`}>
                {skill.evidence?.kind === "quiz" && skill.finding?.status === "demonstrated"
                  ? "Shown in quiz examples"
                  : statusLabels[skill.finding?.status ?? "not_assessed"]}
              </span>
              {skill.evidence && (
                <div className="skill-evidence">
                  <p>
                    {skill.evidence.scope ??
                      skill.evidence.caveat ??
                      "An observation is recorded for this skill."}
                  </p>
                  <p className="field-help">
                    {skill.evidence.kind === "quiz"
                      ? "Quiz observation"
                      : skill.evidence.kind.replaceAll("_", " ")}{" "}
                    · {skill.evidence.rubric_version ?? "Unassessed source"}
                  </p>
                  {skill.evidence.assessment_attempt_id && (
                    <Link
                      href={`/assessment/${skill.evidence.assessment_attempt_id}`}
                      className="text-link"
                    >
                      View the answers and evidence
                    </Link>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {!!recentEvidence.length && (
        <section className="form-section" aria-label="Recent skill evidence">
          <h2>Your observed learning</h2>
          <p>
            Previous observations stay in your history. A short quiz supports only its stated scope;
            it doesn’t certify project or career readiness.
          </p>
          <ul className="evidence-history">
            {recentEvidence.map((evidence) => (
              <li key={evidence.id}>
                <strong>
                  {skills.find((skill) => skill.id === evidence.skill_id)?.name ??
                    evidence.skill_id}
                </strong>
                <p>{evidence.scope ?? evidence.caveat}</p>
                <span className="field-help">
                  {evidence.kind === "quiz" ? "Quiz" : evidence.kind.replaceAll("_", " ")} ·{" "}
                  {evidence.outcome === "meets_criteria"
                    ? "Met the scoped criteria"
                    : evidence.outcome === "needs_practice"
                      ? "Review the observed example"
                      : "Limited observation"}{" "}
                  ·{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeZone: "Africa/Lagos",
                  }).format(new Date(evidence.evaluated_at))}
                </span>
                {evidence.assessment_attempt_id && (
                  <Link
                    href={`/assessment/${evidence.assessment_attempt_id}`}
                    className="text-link"
                  >
                    Review this check
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="recent-section">
        <div className="section-title">
          <h2>A little history</h2>
          <Flag size={18} aria-hidden="true" />
        </div>
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <span className="event-dot" aria-hidden="true" />
              <span>
                {event.type === "onboarding_completed"
                  ? "Your Learner Passport began"
                  : event.type === "course_draft_saved"
                    ? "You saved a course draft"
                    : event.type === "course_confirmed"
                      ? "You confirmed your course context"
                      : event.type === "diagnostic_started"
                        ? "You began a JavaScript check"
                        : event.type === "diagnostic_evaluated"
                          ? "You saved observed skill evidence"
                          : event.type === "path_proposed"
                            ? "You saved a proposed next step"
                            : event.type === "path_accepted"
                              ? "You accepted your next step"
                              : event.type === "path_declined"
                                ? "You declined a proposed step"
                                : event.type === "path_edited"
                                  ? "You adjusted a proposed step"
                                  : "You updated your learning context"}
              </span>
              <time dateTime={event.occurred_at}>
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(event.occurred_at))}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireLearner } from "@/lib/auth/session";
import { getPassport } from "@/features/learner-passport/service";
import { getJourney } from "@/features/momentum/journey-service";
export const metadata = { title: "Your connected journey" };
export default async function Journey() {
  const { db, user } = await requireLearner();
  const passport = await getPassport(db, user.id);
  if (!passport.profile || !passport.goal) redirect("/onboarding");
  const { state, next } = await getJourney(db);
  const steps = [
    {
      title: "Your Passport",
      href: "/onboarding",
      saved: true,
      note: "Your goal and constraints are saved. Your learning belongs to you.",
    },
    {
      title: "Your existing course",
      href: "/courses",
      saved: state.courseConfirmed,
      note: "Optional: confirm a permitted outline and self-reported place. Course context is not assessed evidence.",
    },
    {
      title: "A motivating direction",
      href: "/opportunities",
      saved: state.exampleSaved,
      note: "Save a clearly fictional brief before practice to keep a baseline for the later comparison.",
    },
    {
      title: "What you remember",
      href: "/assessment",
      saved: state.diagnosticReviewed,
      note: "Review fixed JavaScript observations. Unknown and skipped work are not failures.",
    },
    {
      title: "One accepted next step",
      href: "/learning-path",
      saved: state.stepAccepted,
      note: "Accept, edit or decline a small proposal. You can return to your course without restarting it.",
    },
    {
      title: "Mentor help when useful",
      href: "/mentor",
      saved: state.mentorUsed,
      note: "Optional: ask a course-aware question. Provider failure keeps your saved work accessible.",
    },
    {
      title: "Guided work submitted",
      href: "/practice",
      saved: state.practiceSubmitted,
      note: "Complete a three-session scaffold or save partial/free-form work. Submitted text is not executed.",
    },
    {
      title: "Scoped progress recorded",
      href: "/practice",
      saved: state.progressRecorded,
      note: "Explicitly record observed choices and a suggested follow-up. Guided completion does not complete your accepted task or prove an independent app.",
    },
  ];
  return (
    <AppShell active="journey">
      <div className="page-intro">
        <p className="eyebrow">LEARN ANYWHERE. GET MENTORED HERE.</p>
        <h1>Your journey, connected.</h1>
        <p>
          Bring the learning you already started, work through a useful step, then connect real
          observations to an example opportunity. These markers come from your saved records; they
          are not a mastery score.
        </p>
      </div>
      <section className="form-section">
        <h2>{next.title}</h2>
        <p>{next.description}</p>
        <Link className="button primary" href={next.href}>
          Continue your journey
        </Link>
        <p className="field-help">
          Every step stays available. This suggested sequence does not block learning or
          exploration.
        </p>
      </section>
      <ol className="journey-steps">
        {steps.map((step, index) => (
          <li className="form-section" key={step.title}>
            <p className="eyebrow">
              STEP {index + 1} · {step.saved ? "SAVED RECORD EXISTS" : "AVAILABLE TO EXPLORE"}
            </p>
            <h2>{step.title}</h2>
            <p>{step.note}</p>
            <Link className="text-link" href={step.href}>
              {step.saved ? "Review saved work" : "Open this step"}
            </Link>
          </li>
        ))}
      </ol>
      <section className="form-section">
        <p className="eyebrow">SEE WHAT CHANGED</p>
        <h2>Connect progress to a transparent gap.</h2>
        <p>
          {state.exampleSaved && state.progressRecorded
            ? "Your saved baseline and recorded progress are ready to compare."
            : "Save an example and record guided progress to compare the before and after observations."}{" "}
          Guided preparation can change while independent project evidence remains needed. Git, HTML
          or other unrelated requirements do not change just because an API exercise was submitted.
        </p>
        <p className="demo-label">DEMO — NOT A LIVE LISTING</p>
        <Link className="button primary" href="/opportunities/demo-frontend-api-v1">
          Compare the API portfolio example
        </Link>
      </section>
      <section className="form-section">
        <h2>Need a smaller step?</h2>
        <p>
          Your accepted step and prior evidence stay intact. Share an obstacle and review a
          five-minute return at your pace. Scheduled reminders and automatic
          inactivity detection are not running.
        </p>
        <Link className="text-link" href="/check-in">
          Check in and choose a smaller step
        </Link>
      </section>
    </AppShell>
  );
}

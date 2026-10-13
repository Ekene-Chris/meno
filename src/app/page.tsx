import Link from "next/link";
import { ArrowRight, Compass, Layers3, Sprout } from "lucide-react";
import { Brand } from "@/components/brand";

export default function Home() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <Link href="/sign-in" className="text-link">
          Your learning space <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </header>
      <main id="main-content">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">LEARN ANYWHERE. GET MENTORED HERE.</p>
            <h1>
              Your next chapter
              <br />
              starts <em>where you are.</em>
            </h1>
            <p className="hero-description">
              Started a course. Hit a wall. Took a break. Your journey still counts. Make space for
              your goals, your experience, and a pace that works for you.
            </p>
            <Link href="/sign-in" className="button primary">
              Find your starting point <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <p className="hero-footnote">Already learning? Bring that journey with you.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <span className="orbit-label label-one">Your experience</span>
            <span className="orbit-label label-two">Your direction</span>
            <span className="orbit-label label-three">Your pace</span>
            <div className="hero-seed">
              <Sprout size={76} strokeWidth={1.2} />
            </div>
            <span className="art-caption">ROOM TO GROW</span>
          </div>
        </section>
        <section className="principles" aria-label="A learning space for you">
          <article>
            <span className="icon-tile">
              <Layers3 size={22} aria-hidden="true" />
            </span>
            <h2>Build on your story</h2>
            <p>
              Starting, studying, returning, or exploring what comes next. There is a place for
              every entry point.
            </p>
          </article>
          <article>
            <span className="icon-tile">
              <Compass size={22} aria-hidden="true" />
            </span>
            <h2>Keep your direction</h2>
            <p>Save the skill you want to develop and the goal that gives your learning meaning.</p>
          </article>
          <article>
            <span className="icon-tile">
              <Sprout size={22} aria-hidden="true" />
            </span>
            <h2>Make it your own</h2>
            <p>
              Your time, your learning conditions, your preferences. Change them as life changes.
            </p>
          </article>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>An early version of Meno. Start with your Learner Passport.</span>
      </footer>
    </div>
  );
}

import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Route,
} from "lucide-react";
import { Brand } from "./brand";
import { signOut } from "@/lib/auth/actions";

export function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active: "passport" | "onboarding" | "courses" | "assessment" | "learning-path";
}) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Brand />
        <p className="sidebar-caption">YOUR LEARNING SPACE</p>
        <nav aria-label="Main navigation">
          <Link
            href="/dashboard"
            className={active === "passport" ? "nav-link selected" : "nav-link"}
            aria-current={active === "passport" ? "page" : undefined}
          >
            <LayoutDashboard size={18} aria-hidden="true" /> My Passport
          </Link>
          <Link
            href="/courses"
            className={active === "courses" ? "nav-link selected" : "nav-link"}
            aria-current={active === "courses" ? "page" : undefined}
          >
            <BookOpen size={18} aria-hidden="true" /> My courses
          </Link>
          <Link
            href="/assessment"
            className={active === "assessment" ? "nav-link selected" : "nav-link"}
            aria-current={active === "assessment" ? "page" : undefined}
          >
            <ClipboardCheck size={18} aria-hidden="true" /> Skill checks
          </Link>
          <Link
            href="/learning-path"
            className={active === "learning-path" ? "nav-link selected" : "nav-link"}
            aria-current={active === "learning-path" ? "page" : undefined}
          >
            <Route size={18} aria-hidden="true" /> My next step
          </Link>
          <Link
            href="/onboarding"
            className={active === "onboarding" ? "nav-link selected" : "nav-link"}
            aria-current={active === "onboarding" ? "page" : undefined}
          >
            <BookOpen size={18} aria-hidden="true" /> Goals & preferences
          </Link>
        </nav>
        <div className="sidebar-note">
          <SproutNote />
          <p>
            Every learning journey
            <br />
            has room for a fresh start.
          </p>
        </div>
        <form action={signOut}>
          <button className="nav-link sign-out" type="submit">
            <LogOut size={18} aria-hidden="true" /> Sign out
          </button>
        </form>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <span>
            {process.env.NEXT_PUBLIC_DEPLOYMENT_STAGE === "development"
              ? "Development preview"
              : "Your journey, at your pace"}
          </span>
          <span className="privacy-badge">
            <ShieldCheck size={15} aria-hidden="true" /> Private to you
          </span>
        </header>
        <main id="main-content" className="workspace">
          {children}
        </main>
        <footer className="app-footer">
          <span>Meno · Learn anywhere. Get mentored here.</span>
          <Link href="/onboarding">
            Your learning preferences <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  );
}

function SproutNote() {
  return (
    <span className="small-orbit" aria-hidden="true">
      m.
    </span>
  );
}

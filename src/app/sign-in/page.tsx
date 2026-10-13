import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { getPublicConfig } from "@/lib/env";
import { createDbClient } from "@/lib/db/server";

export const metadata = { title: "Welcome back" };
export default async function SignIn() {
  if (!getPublicConfig()) redirect("/setup");
  const db = await createDbClient();
  const { data } = await db.auth.getUser();
  if (data.user) redirect("/dashboard");
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">A LITTLE SPACE TO BEGIN AGAIN</p>
          <h1>
            You don’t have to
            <br />
            start <em>from zero.</em>
          </h1>
          <p>
            Bring your ambition, the things you already know, and the things you’re still figuring
            out.
          </p>
        </div>
        <span>Learn anywhere. Get mentored here.</span>
      </aside>
      <main id="main-content" className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">YOUR JOURNEY CONTINUES</p>
          <h2>Good to have you here.</h2>
          <p className="muted">Sign in to your private learning space.</p>
          <AuthForm />
          <p className="privacy-copy">
            Your goals and learning progress are private to your account.
          </p>
        </div>
      </main>
    </div>
  );
}

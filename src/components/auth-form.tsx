"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { authenticate, type AuthState } from "@/lib/auth/actions";

export function AuthForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, {});
  return (
    <>
      <fieldset className="auth-tabs">
        <legend className="sr-only">Account access</legend>
        <button type="button" aria-pressed={mode === "sign-in"} onClick={() => setMode("sign-in")}>
          Sign in
        </button>
        <button type="button" aria-pressed={mode === "sign-up"} onClick={() => setMode("sign-up")}>
          Create an account
        </button>
      </fieldset>
      <form action={action} className="auth-form">
        <input type="hidden" name="mode" value={mode} />
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@example.com"
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          minLength={10}
          maxLength={72}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="field-hint">
          Use 10–72 characters.
        </p>
        {state.error && (
          <p role="alert" className="form-error">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="form-notice">
            {state.message}
          </p>
        )}
        <button className="button primary full-width" disabled={pending} type="submit">
          {pending
            ? "One moment…"
            : mode === "sign-in"
              ? "Continue your journey"
              : "Create your account"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
    </>
  );
}

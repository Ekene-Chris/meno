"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createDbClient } from "@/lib/db/server";
import { getAppOrigin } from "@/lib/app-origin";

export type AuthState = { error?: string; message?: string };
const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(10).max(72),
  mode: z.enum(["sign-in", "sign-up"]),
});

export async function authenticate(_previous: AuthState, form: FormData): Promise<AuthState> {
  const result = credentialsSchema.safeParse(Object.fromEntries(form));
  if (!result.success) return { error: "Enter a valid email and a password of 10–72 characters." };
  const { email, password, mode } = result.data;
  try {
    const db = await createDbClient();
    if (mode === "sign-up") {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL(
            "/auth/callback",
            getAppOrigin((await headers()).get("origin")),
          ).toString(),
        },
      });
      if (error)
        return { error: "We couldn't create an account. Check your details or try signing in." };
      if (!data.session)
        return {
          message: "Check your email to confirm your account, then return here to sign in.",
        };
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error)
        return {
          error: "We couldn't sign you in. Check your email and password, or try again shortly.",
        };
    }
  } catch {
    return { error: "Sign-in is temporarily unavailable. Please try again shortly." };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const db = await createDbClient();
  const { error } = await db.auth.signOut({ scope: "local" });
  if (error) throw new Error("Sign-out could not be completed. Please try again.");
  redirect("/sign-in");
}

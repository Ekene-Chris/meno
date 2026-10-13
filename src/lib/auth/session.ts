import "server-only";
import { redirect } from "next/navigation";
import { createDbClient } from "@/lib/db/server";
import { AppError } from "@/lib/http";

export async function authenticatedContext() {
  const db = await createDbClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new AppError(401, "UNAUTHENTICATED", "Please sign in to continue.");
  return { db, user: data.user };
}

export async function requireLearner() {
  try {
    return await authenticatedContext();
  } catch (error) {
    if (error instanceof AppError && error.status === 401) redirect("/sign-in");
    if (error instanceof AppError && error.code === "SETUP_REQUIRED") redirect("/setup");
    throw error;
  }
}

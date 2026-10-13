import { NextResponse } from "next/server";
import { authenticatedContext } from "@/lib/auth/session";
import { jsonError } from "@/lib/http";
import { getPassport } from "@/features/learner-passport/service";

export async function GET() {
  try {
    const { db, user } = await authenticatedContext();
    return NextResponse.json(await getPassport(db, user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return jsonError(error);
  }
}

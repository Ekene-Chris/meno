import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicConfig } from "@/lib/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const config = getPublicConfig();
  if (!config) return response;
  const db = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  // Authorization is repeated in each protected route; the proxy only refreshes sessions.
  await db.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/courses/:path*",
    "/assessment/:path*",
    "/learning-path/:path*",
    "/mentor/:path*",
    "/sign-in",
    "/auth/:path*",
    "/api/:path*",
  ],
};

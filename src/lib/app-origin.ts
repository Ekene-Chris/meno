function origin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function deploymentOrigin(host: string | undefined) {
  return host && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(host)
    ? `https://${host}`
    : null;
}

// Only configured origins and Vercel's own deployment metadata are trusted.
// Request Host / forwarded headers never expand the hosted allowlist.
export function getAppOrigins(localFallback = "http://localhost:3000") {
  const canonical = origin(process.env.NEXT_PUBLIC_APP_URL);
  const deployed = process.env.VERCEL === "1";
  const deployment = deployed ? deploymentOrigin(process.env.VERCEL_URL) : null;
  const branch = deployed ? deploymentOrigin(process.env.VERCEL_BRANCH_URL) : null;
  const fallback = deployed ? null : origin(localFallback);
  return [
    ...new Set(
      [canonical, branch, deployment, canonical ? null : fallback].filter(
        (value): value is string => value !== null,
      ),
    ),
  ];
}

export function getAppOrigin(requestOrigin?: string | null) {
  const allowed = getAppOrigins();
  if (requestOrigin && allowed.includes(requestOrigin)) return requestOrigin;
  if (!allowed[0]) throw new Error("An application origin must be configured.");
  return allowed[0];
}

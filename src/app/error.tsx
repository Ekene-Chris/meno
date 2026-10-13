"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="simple-page">
      <div className="simple-card">
        <p className="eyebrow">LET’S TRY THAT AGAIN</p>
        <h1>We couldn’t load your learning space.</h1>
        <p>Your saved progress is still yours. Check your connection and try again.</p>
        <button type="button" className="button primary" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="text-link">
          Back to Meno
        </Link>
      </div>
    </main>
  );
}

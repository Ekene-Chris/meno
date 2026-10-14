"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <div className="simple-page">
      <div className="simple-card">
        <h1>Your saved work is kept.</h1>
        <p>We couldn't load the check-in. Please retry when you have a connection.</p>
        <button type="button" className="button primary" onClick={retry}>
          Try again
        </button>
        <Link href="/learning-path" className="text-link">
          My next step
        </Link>
      </div>
    </div>
  );
}

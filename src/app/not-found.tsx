import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="simple-page">
      <div className="simple-card">
        <p className="eyebrow">A DIFFERENT DIRECTION</p>
        <h1>This page isn’t here.</h1>
        <Link href="/" className="button primary">
          Back to Meno
        </Link>
      </div>
    </main>
  );
}

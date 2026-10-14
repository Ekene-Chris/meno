import Link from "next/link";
export default function NotFound() {
  return (
    <div className="page-intro">
      <h1>That check isn’t available.</h1>
      <p>Check that you’re signed in to the account that saved it.</p>
      <Link href="/assessment" className="button secondary">
        Your skill checks
      </Link>
    </div>
  );
}

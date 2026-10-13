import Link from "next/link";
import { Brand } from "@/components/brand";

export default function Setup() {
  return (
    <div className="simple-page">
      <Brand />
      <main id="main-content" className="simple-card">
        <p className="eyebrow">GETTING READY</p>
        <h1>This learning space is being set up.</h1>
        <p>Account access isn’t available yet. Please come back shortly.</p>
        <Link href="/" className="button secondary">
          Back to Meno
        </Link>
      </main>
    </div>
  );
}

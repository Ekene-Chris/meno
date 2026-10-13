import Link from "next/link";
import { Sprout } from "lucide-react";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Meno home">
      <span className="brand-mark">
        <Sprout size={24} aria-hidden="true" />
      </span>
      Meno<span className="brand-dot">.</span>
    </Link>
  );
}
